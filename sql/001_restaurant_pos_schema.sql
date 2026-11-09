-- =====================================================================
-- Restaurant POS: complete database schema
-- File: sql/001_restaurant_pos_schema.sql
--
-- Idempotent: safe to run more than once (IF NOT EXISTS, ON CONFLICT,
-- CREATE OR REPLACE, DROP TRIGGER IF EXISTS). Runs in one transaction.
-- Target: PostgreSQL 16+ (Supabase).
--
-- Conventions
--   * Primary keys are serial integers, because the running app uses integer
--     ids. Ledger, log and event tables use bigserial. The product bible's
--     UUID rule is not applied, since the app's code depends on integer ids.
--   * Branch scope: branch_id text, FK -> branches.branch_code (default 'br-1').
--   * Money numeric(12,2). Quantities numeric(12,3). Timestamps are "timestamp"
--     (without time zone), matching the app's drizzle schema.
--   * Business tables carry created_at / updated_at (updated_at is set by a
--     trigger). New enterprise tables also carry deleted_at for soft delete.
--   * Append-only tables (inventory_ledger, audit_logs) reject UPDATE and DELETE.
--   * High-volume log tables are range-partitioned by month on created_at.
--   * Row Level Security is enabled on every table and no policies are defined.
--     The public REST API (anon / authenticated keys) therefore cannot read or
--     write these tables. The app connects as the table owner (postgres), which
--     bypasses RLS.
--   * Columns that the app inserts without a value are nullable or have
--     defaults, so the current app code keeps working.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Sequences and generic functions
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS order_number_seq   START 1000;
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS po_number_seq      START 1;
CREATE SEQUENCE IF NOT EXISTS grn_number_seq     START 1;
CREATE SEQUENCE IF NOT EXISTS pr_number_seq      START 1;
CREATE SEQUENCE IF NOT EXISTS return_number_seq  START 1;

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%.% is append-only: % is not allowed',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP;
END $$;

-- Creates one partition per month, starting at first_month, for month_count months.
-- Call it again later (for example from a monthly job) to extend the range.
CREATE OR REPLACE FUNCTION ensure_monthly_partitions(parent_table text, first_month date, month_count int)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  i int;
  from_d date;
  to_d date;
BEGIN
  FOR i IN 0 .. month_count - 1 LOOP
    from_d := (date_trunc('month', first_month) + make_interval(months => i))::date;
    to_d   := (from_d + make_interval(months => 1))::date;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
      parent_table || '_' || to_char(from_d, 'YYYY_MM'), parent_table, from_d, to_d);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 1. Branches and security (product bible DB-SEC-002)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id           serial PRIMARY KEY,
  branch_code  text NOT NULL UNIQUE,
  branch_name  text NOT NULL,
  timezone     text NOT NULL DEFAULT 'Asia/Kolkata',
  currency     text NOT NULL DEFAULT 'INR',
  address      text,
  gst_number   text,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at   timestamp NOT NULL DEFAULT now(),
  updated_at   timestamp NOT NULL DEFAULT now(),
  deleted_at   timestamp
);

CREATE TABLE IF NOT EXISTS users (
  id                serial PRIMARY KEY,
  -- columns used by the app's PIN login (auth.server.ts)
  name              text NOT NULL,
  pin               text NOT NULL,
  role              text NOT NULL,            -- legacy role string: owner | manager | cashier | waiter | kitchen
  -- enterprise identity columns
  employee_code     varchar(30) UNIQUE,
  username          varchar(100) UNIQUE,
  email             varchar(255),
  phone             varchar(20),
  password_hash     text,                     -- salted hash only (PINs should move here too)
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'locked')),
  default_branch_id text REFERENCES branches(branch_code),
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now(),
  deleted_at        timestamp
);
CREATE INDEX IF NOT EXISTS users_email_idx  ON users (email);
CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id      integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url   text,
  locale       text NOT NULL DEFAULT 'en-IN',
  timezone     text NOT NULL DEFAULT 'Asia/Kolkata',
  updated_at   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id             serial PRIMARY KEY,
  role_code      text NOT NULL UNIQUE,
  role_name      text NOT NULL,
  description    text,
  is_system_role boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS permissions (
  id              serial PRIMARY KEY,
  permission_code text NOT NULL UNIQUE,        -- MODULE.ACTION, e.g. POS.REFUND
  description     text
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       integer NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id integer NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    integer NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by integer REFERENCES users(id),
  granted_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS user_branches (
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_code text NOT NULL REFERENCES branches(branch_code),
  PRIMARY KEY (user_id, branch_code)
);

CREATE TABLE IF NOT EXISTS devices (
  id           serial PRIMARY KEY,
  device_code  text NOT NULL UNIQUE,
  device_name  text NOT NULL,
  device_type  text NOT NULL CHECK (device_type IN ('pos', 'kds', 'tablet', 'printer_host', 'back_office')),
  branch_id    text NOT NULL DEFAULT 'br-1' REFERENCES branches(branch_code),
  is_trusted   boolean NOT NULL DEFAULT false,
  last_seen_at timestamp,
  created_at   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id               serial PRIMARY KEY,
  jwt_id           text NOT NULL UNIQUE,
  user_id          integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id        integer REFERENCES devices(id),
  ip_address       inet,
  browser          text,
  login_at         timestamp NOT NULL DEFAULT now(),
  logout_at        timestamp,
  last_activity_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id, login_at);

CREATE TABLE IF NOT EXISTS login_history (
  id                 bigserial PRIMARY KEY,
  user_id            integer REFERENCES users(id),   -- NULL when the username is unknown
  username_attempted text,
  event              text NOT NULL CHECK (event IN ('success', 'failure', 'locked', 'mfa', 'password_reset', 'logout')),
  ip_address         inet,
  device_id          integer REFERENCES devices(id),
  created_at         timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_history_user_idx ON login_history (user_id, created_at);

CREATE TABLE IF NOT EXISTS password_history (
  id            serial PRIMARY KEY,
  user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at    timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  key_prefix text NOT NULL,                    -- first characters only, for display
  key_hash   text NOT NULL UNIQUE,             -- hash of the full key, never the key itself
  scopes     text[] NOT NULL DEFAULT '{}',
  created_by integer REFERENCES users(id),
  expires_at timestamp,
  revoked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_clients (
  id                 serial PRIMARY KEY,
  client_id          text NOT NULL UNIQUE,
  client_name        text NOT NULL,
  client_secret_hash text,
  redirect_uris      text[] NOT NULL DEFAULT '{}',
  created_at         timestamp NOT NULL DEFAULT now(),
  revoked_at         timestamp
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id                 serial PRIMARY KEY,
  feature_key        text NOT NULL,
  environment        text NOT NULL DEFAULT 'production',
  branch_id          text REFERENCES branches(branch_code),   -- NULL = all branches
  enabled            boolean NOT NULL DEFAULT false,
  rollout_percentage integer NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  effective_date     timestamp,
  updated_at         timestamp NOT NULL DEFAULT now(),
  UNIQUE (feature_key, environment, branch_id)
);

CREATE TABLE IF NOT EXISTS security_policies (
  id                      serial PRIMARY KEY,
  policy_key              text NOT NULL UNIQUE,     -- 'default' or a branch code
  min_length              integer NOT NULL DEFAULT 8,
  require_uppercase       boolean NOT NULL DEFAULT true,
  require_lowercase       boolean NOT NULL DEFAULT true,
  require_numeric         boolean NOT NULL DEFAULT true,
  require_special         boolean NOT NULL DEFAULT false,
  password_expiry_days    integer,
  password_reuse_count    integer NOT NULL DEFAULT 5,
  max_failed_logins       integer NOT NULL DEFAULT 5,
  lock_minutes            integer NOT NULL DEFAULT 15,
  session_timeout_minutes integer NOT NULL DEFAULT 30,
  concurrent_sessions     integer NOT NULL DEFAULT 1,
  allowed_ip_ranges       text[] NOT NULL DEFAULT '{}',
  require_trusted_device  boolean NOT NULL DEFAULT false,
  updated_at              timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. Settings and configuration (product bible DB-ADM-006)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS setting_groups (
  id            serial PRIMARY KEY,
  group_code    text NOT NULL UNIQUE,
  group_name    text NOT NULL,
  display_order integer NOT NULL DEFAULT 0
);

-- Key/value store the app already uses (config-store). Kept as is.
CREATE TABLE IF NOT EXISTS system_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  id               serial PRIMARY KEY,
  setting_group_id integer REFERENCES setting_groups(id),
  setting_key      text NOT NULL,
  setting_value    text,
  data_type        text NOT NULL DEFAULT 'string' CHECK (data_type IN ('string', 'number', 'boolean', 'json')),
  is_encrypted     boolean NOT NULL DEFAULT false,
  branch_id        text NOT NULL DEFAULT 'br-1' REFERENCES branches(branch_code),
  updated_by       integer REFERENCES users(id),
  updated_at       timestamp NOT NULL DEFAULT now(),
  UNIQUE (branch_id, setting_key)
);

CREATE TABLE IF NOT EXISTS business_profiles (
  id             serial PRIMARY KEY,
  branch_id      text NOT NULL UNIQUE REFERENCES branches(branch_code),
  legal_name     text NOT NULL,
  trade_name     text,
  gst_number     text,
  pan_number     text,
  address        text,
  phone          text,
  email          text,
  bill_prefix    text NOT NULL DEFAULT 'INV-',
  receipt_footer text,
  logo_url       text,
  updated_at     timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. Printers, kitchen stations, menu and tax
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS printers (
  id           serial PRIMARY KEY,
  branch_id    text NOT NULL DEFAULT 'br-1' REFERENCES branches(branch_code),
  printer_name text NOT NULL,
  printer_type text NOT NULL DEFAULT 'receipt' CHECK (printer_type IN ('receipt', 'kitchen', 'bar', 'dessert')),
  ip_address   inet,
  port         integer NOT NULL DEFAULT 9100,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  created_at   timestamp NOT NULL DEFAULT now(),
  UNIQUE (branch_id, printer_name)
);

-- Kitchen stations (product bible "kitchen_stations"). The app's table name is kept.
CREATE TABLE IF NOT EXISTS stations (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamp NOT NULL DEFAULT now(),
  station_code  text UNIQUE,
  printer_id    integer REFERENCES printers(id),
  sla_minutes   integer NOT NULL DEFAULT 15,
  display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS printer_mappings (
  id           serial PRIMARY KEY,
  printer_id   integer NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  mapping_type text NOT NULL CHECK (mapping_type IN ('receipt', 'kitchen', 'bar', 'dessert')),
  station_id   integer REFERENCES stations(id),
  UNIQUE (printer_id, mapping_type, station_id)
);

-- Tax profiles (product bible "tax_profiles"). The app's table name is kept.
CREATE TABLE IF NOT EXISTS tax_slabs (
  id             serial PRIMARY KEY,
  name           text NOT NULL,
  rate           numeric(5,2) NOT NULL,
  is_default     boolean NOT NULL DEFAULT false,
  active         boolean NOT NULL DEFAULT true,
  tax_code       text UNIQUE,
  tax_type       text NOT NULL DEFAULT 'GST',
  branch_id      text NOT NULL DEFAULT 'br-1' REFERENCES branches(branch_code),
  effective_from date NOT NULL DEFAULT current_date,
  effective_to   date,
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Payment modes (product bible "payment_modes"). The app's table name is kept.
CREATE TABLE IF NOT EXISTS payment_methods (
  id                 serial PRIMARY KEY,
  name               text NOT NULL,
  type               text NOT NULL,            -- cash | card | upi | custom
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamp NOT NULL DEFAULT now(),
  code               text UNIQUE,
  display_name       text,
  gateway_name       text,
  requires_reference boolean NOT NULL DEFAULT false
);

-- Menu categories (product bible "menu_categories"). The app's table name is kept.
CREATE TABLE IF NOT EXISTS categories (
  id                 serial PRIMARY KEY,
  name               text NOT NULL,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamp NOT NULL DEFAULT now(),
  code               text UNIQUE,
  parent_category_id integer REFERENCES categories(id),
  display_order      integer NOT NULL DEFAULT 0,
  kitchen_station_id integer REFERENCES stations(id),
  updated_at         timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id                       serial PRIMARY KEY,
  name                     text NOT NULL,
  price                    numeric(10,2) NOT NULL,
  category_id              integer NOT NULL REFERENCES categories(id),
  station_id               integer REFERENCES stations(id),
  is_available             boolean NOT NULL DEFAULT true,
  created_at               timestamp NOT NULL DEFAULT now(),
  sku                      text UNIQUE,
  description              text,
  tax_slab_id              integer REFERENCES tax_slabs(id),
  preparation_time_minutes integer NOT NULL DEFAULT 0,
  is_veg                   boolean,
  updated_at               timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menu_items_category_idx ON menu_items (category_id);

CREATE TABLE IF NOT EXISTS menu_prices (
  id             serial PRIMARY KEY,
  menu_item_id   integer NOT NULL REFERENCES menu_items(id),
  branch_id      text NOT NULL DEFAULT 'br-1' REFERENCES branches(branch_code),
  effective_from timestamp NOT NULL DEFAULT now(),
  effective_to   timestamp,
  selling_price  numeric(10,2) NOT NULL CHECK (selling_price >= 0),
  label          text,                          -- e.g. 'Happy hour'
  UNIQUE (menu_item_id, branch_id, effective_from)
);

CREATE TABLE IF NOT EXISTS modifier_groups (
  id           serial PRIMARY KEY,
  menu_item_id integer REFERENCES menu_items(id),
  name         text NOT NULL,
  min_select   integer NOT NULL DEFAULT 0,
  max_select   integer NOT NULL DEFAULT 1,
  is_required  boolean NOT NULL DEFAULT false,
  CHECK (max_select >= min_select)
);

CREATE TABLE IF NOT EXISTS modifiers (
  id                serial PRIMARY KEY,
  modifier_group_id integer NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name              text NOT NULL,
  price_delta       numeric(10,2) NOT NULL DEFAULT 0,
  is_default        boolean NOT NULL DEFAULT false,
  is_active         boolean NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------------
-- 4. Floors, tables, reservations, shifts (product bible DB-POS-003)
-- ---------------------------------------------------------------------
-- Floors / table sections. The app's table name is kept.
CREATE TABLE IF NOT EXISTS table_sections (
  id            serial PRIMARY KEY,
  branch_id     text NOT NULL DEFAULT 'br-1' REFERENCES branches(branch_code),
  name          text NOT NULL,
  prefix        text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamp NOT NULL DEFAULT now(),
  display_order integer NOT NULL DEFAULT 0
);

-- Table master (product bible "table_master"). The app's table name is kept.
CREATE TABLE IF NOT EXISTS tables (
  id         serial PRIMARY KEY,
  branch_id  text NOT NULL DEFAULT 'br-1' REFERENCES branches(branch_code),
  number     text NOT NULL,
  section_id integer REFERENCES table_sections(id),
  status     text NOT NULL DEFAULT 'available',   -- available | reserved | occupied | billing | cleaning
  capacity   integer NOT NULL DEFAULT 4,
  qr_code    text UNIQUE,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (branch_id, number)
);

CREATE TABLE IF NOT EXISTS table_sessions (
  id          serial PRIMARY KEY,
  table_id    integer NOT NULL REFERENCES tables(id),
  opened_by   integer REFERENCES users(id),
  guest_count integer NOT NULL DEFAULT 1 CHECK (guest_count > 0),
  opened_at   timestamp NOT NULL DEFAULT now(),
  closed_at   timestamp
);
CREATE INDEX IF NOT EXISTS table_sessions_table_idx ON table_sessions (table_id, opened_at);

CREATE TABLE IF NOT EXISTS reservations (
  id               serial PRIMARY KEY,
  branch_id        text NOT NULL DEFAULT 'br-1' REFERENCES branches(branch_code),
  type             text NOT NULL,                  -- waitlist | advance
  status           text NOT NULL DEFAULT 'waiting', -- waiting | seated | cancelled | no-show
  customer_name    text NOT NULL,
  customer_phone   text NOT NULL,
  pax              integer NOT NULL,
  reservation_time text,                          -- "HH:MM" for advance bookings
  table_id         text,                          -- text, like orders.table_id
  notes            text,
  created_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservations_status_idx ON reservations (branch_id, status, created_at);

CREATE TABLE IF NOT EXISTS shifts (
  id            serial PRIMARY KEY,
  branch_id     text NOT NULL DEFAULT 'br-1' REFERENCES branches(branch_code),
  opened_by     integer NOT NULL REFERENCES users(id),
  closed_by     integer REFERENCES users(id),
  opening_cash  numeric(10,2) NOT NULL,
  closing_cash  numeric(10,2),
  expected_cash numeric(10,2),
  variance      numeric(10,2),
  status        text NOT NULL DEFAULT 'open',     -- open | closed
  opened_at     timestamp NOT NULL DEFAULT now(),
  closed_at     timestamp
);
CREATE INDEX IF NOT EXISTS shifts_branch_status_idx ON shifts (branch_id, status);

-- ---------------------------------------------------------------------
-- 5. Orders, KOT, payments (product bible DB-POS-003)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                serial PRIMARY KEY,
  order_number      bigint NOT NULL UNIQUE DEFAULT nextval('order_number_seq'),
  table_id          text,                         -- stored as text by the app (no FK, see header)
  table_session_id  integer REFERENCES table_sessions(id),
  type              text NOT NULL,                -- dine-in | takeaway
  customer_name     text,
  customer_phone    text,
  status            text NOT NULL DEFAULT 'open', -- open | completed | paid | cancelled | void
  subtotal          numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount   numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount        numeric(12,2) NOT NULL DEFAULT 0,
  service_charge    numeric(12,2) NOT NULL DEFAULT 0,
  total             numeric(10,2) NOT NULL DEFAULT 0,   -- grand total (app column)
  discount_pct      numeric(5,2) NOT NULL DEFAULT 0,
  tax_pct           numeric(5,2) NOT NULL DEFAULT 0,
  payment_method_id integer REFERENCES payment_methods(id),
  shift_id          integer REFERENCES shifts(id),
  branch_id         text REFERENCES branches(branch_code),
  created_by        integer REFERENCES users(id),
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_branch_status_idx ON orders (branch_id, status);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders (status, created_at);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at);
CREATE INDEX IF NOT EXISTS orders_shift_idx ON orders (shift_id);

CREATE TABLE IF NOT EXISTS order_items (
  id             serial PRIMARY KEY,
  order_id       integer NOT NULL REFERENCES orders(id),
  menu_item_id   integer NOT NULL REFERENCES menu_items(id),
  quantity       integer NOT NULL CHECK (quantity > 0),
  status         text NOT NULL DEFAULT 'pending',   -- pending | preparing | ready | served
  notes          text,
  created_at     timestamp NOT NULL DEFAULT now(),
  seat_no        integer NOT NULL DEFAULT 1,
  unit_price     numeric(10,2) NOT NULL DEFAULT 0,  -- the app should always set this
  modifier_total numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount     numeric(10,2) NOT NULL DEFAULT 0,
  version        integer NOT NULL DEFAULT 1,        -- bumped after the item has been sent to KOT
  is_locked      boolean NOT NULL DEFAULT false     -- set once the order is paid
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
  order_item_id integer NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_id   integer NOT NULL REFERENCES modifiers(id),
  price_delta   numeric(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (order_item_id, modifier_id)
);

CREATE TABLE IF NOT EXISTS kot (
  id           serial PRIMARY KEY,
  order_id     integer NOT NULL REFERENCES orders(id),
  kot_number   integer NOT NULL,
  station_id   integer REFERENCES stations(id),
  status       text NOT NULL DEFAULT 'pending',   -- pending | printed | ready | served | cancelled
  generated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (order_id, kot_number)
);

CREATE TABLE IF NOT EXISTS kot_items (
  kot_id        integer NOT NULL REFERENCES kot(id) ON DELETE CASCADE,
  order_item_id integer NOT NULL REFERENCES order_items(id),
  quantity      integer NOT NULL CHECK (quantity > 0),
  remarks       text,
  status        text NOT NULL DEFAULT 'pending',
  PRIMARY KEY (kot_id, order_item_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id                serial PRIMARY KEY,
  order_id          integer NOT NULL REFERENCES orders(id),
  payment_method_id integer REFERENCES payment_methods(id),
  payment_mode      text NOT NULL,               -- cash | card | upi | ...
  amount            numeric(10,2) NOT NULL CHECK (amount > 0),
  gateway_reference text UNIQUE,
  status            text NOT NULL DEFAULT 'completed', -- pending | completed | failed | refunded
  paid_at           timestamp NOT NULL DEFAULT now(),
  created_by        integer REFERENCES users(id),
  created_at        timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments (order_id);

CREATE TABLE IF NOT EXISTS receipts (
  id             serial PRIMARY KEY,
  receipt_number text NOT NULL UNIQUE DEFAULT ('RCP-' || nextval('receipt_number_seq')),
  order_id       integer NOT NULL REFERENCES orders(id),
  payment_id     integer REFERENCES payments(id),
  printed_at     timestamp NOT NULL DEFAULT now(),
  reprint_count  integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS refunds (
  id          serial PRIMARY KEY,
  order_id    integer NOT NULL REFERENCES orders(id),
  payment_id  integer REFERENCES payments(id),
  amount      numeric(10,2) NOT NULL CHECK (amount > 0),
  reason      text NOT NULL,
  approved_by integer NOT NULL REFERENCES users(id),
  refunded_at timestamp NOT NULL DEFAULT now(),
  created_at  timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 6. Inventory (product bible DB-INV-004)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_categories (
  id                 serial PRIMARY KEY,
  parent_category_id integer REFERENCES inventory_categories(id),
  code               text UNIQUE,
  name               text NOT NULL,
  description        text,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamp NOT NULL DEFAULT now(),
  updated_at         timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS unit_of_measure (
  id                serial PRIMARY KEY,
  code              text NOT NULL UNIQUE,
  name              text NOT NULL,
  conversion_factor numeric(14,6) NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
  base_unit         boolean NOT NULL DEFAULT false,
  base_uom_id       integer REFERENCES unit_of_measure(id)
);

CREATE TABLE IF NOT EXISTS warehouses (
  id         serial PRIMARY KEY,
  branch_id  text NOT NULL DEFAULT 'br-1' REFERENCES branches(branch_code),
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  address    text,
  is_default boolean NOT NULL DEFAULT false,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_one_default_per_branch ON warehouses (branch_id) WHERE is_default;

CREATE TABLE IF NOT EXISTS warehouse_bins (
  id           serial PRIMARY KEY,
  warehouse_id integer NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code         text NOT NULL,
  description  text,
  capacity     numeric(12,3),
  UNIQUE (warehouse_id, code)
);

-- Suppliers (product bible "suppliers"). The app's table name is kept.
CREATE TABLE IF NOT EXISTS suppliers (
  id                 serial PRIMARY KEY,
  name               text NOT NULL,
  contact_info       text,
  created_at         timestamp NOT NULL DEFAULT now(),
  supplier_code      text UNIQUE,
  gst_number         text,
  pan_number         text,
  payment_terms      text,
  credit_limit       numeric(14,2) NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  preferred_supplier boolean NOT NULL DEFAULT false,
  updated_at         timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_gst_unique ON suppliers (gst_number) WHERE gst_number IS NOT NULL;

-- Inventory items (product bible "inventory_items"). The app's table name is kept.
CREATE TABLE IF NOT EXISTS inventory (
  id               serial PRIMARY KEY,
  branch_id        text NOT NULL DEFAULT 'br-1' REFERENCES branches(branch_code),
  name             text NOT NULL,
  unit             text NOT NULL,                 -- kg | liter | piece (app)
  quantity         numeric(10,3) NOT NULL DEFAULT 0,
  min_quantity     numeric(10,3) NOT NULL DEFAULT 0,
  created_at       timestamp NOT NULL DEFAULT now(),
  sku              text UNIQUE,
  barcode          text UNIQUE,
  category_id      integer REFERENCES inventory_categories(id),
  uom_id           integer REFERENCES unit_of_measure(id),
  reorder_level    numeric(12,3) NOT NULL DEFAULT 0,
  reorder_quantity numeric(12,3) NOT NULL DEFAULT 0,
  track_batch      boolean NOT NULL DEFAULT false,
  track_expiry     boolean NOT NULL DEFAULT false,
  valuation_method text NOT NULL DEFAULT 'WAC' CHECK (valuation_method IN ('FIFO', 'WAC', 'LIFO')),
  avg_cost         numeric(12,2) NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  updated_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_branch_idx ON inventory (branch_id);

CREATE TABLE IF NOT EXISTS stock_batches (
  id                 serial PRIMARY KEY,
  inventory_id       integer NOT NULL REFERENCES inventory(id),
  warehouse_id       integer REFERENCES warehouses(id),
  batch_number       text NOT NULL,
  manufacture_date   date,
  expiry_date        date,
  quantity           numeric(12,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  remaining_quantity numeric(12,3) NOT NULL DEFAULT 0 CHECK (remaining_quantity >= 0),
  created_at         timestamp NOT NULL DEFAULT now(),
  UNIQUE (inventory_id, batch_number),
  CHECK (remaining_quantity <= quantity)
);
CREATE INDEX IF NOT EXISTS stock_batches_expiry_idx ON stock_batches (expiry_date);

CREATE TABLE IF NOT EXISTS recipe_bom (
  id           serial PRIMARY KEY,
  menu_item_id integer NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  inventory_id integer NOT NULL REFERENCES inventory(id),
  quantity     numeric(10,3) NOT NULL CHECK (quantity > 0),   -- inventory used per 1 menu item
  created_at   timestamp NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, inventory_id)
);

-- Immutable ledger (product bible: append only, partitioned by month).
CREATE TABLE IF NOT EXISTS inventory_ledger (
  id               bigserial,
  inventory_id     integer NOT NULL REFERENCES inventory(id),
  warehouse_id     integer REFERENCES warehouses(id),
  transaction_type text NOT NULL,              -- PURCHASE | SALE_CONSUMPTION | ADJUSTMENT | TRANSFER | COUNT
  reference_type   text,                       -- order | purchase_order | goods_receipt | stock_adjustment ...
  reference_id     text,
  quantity_change  numeric(12,3) NOT NULL,     -- signed (app column)
  quantity_in      numeric(12,3) NOT NULL DEFAULT 0,
  quantity_out     numeric(12,3) NOT NULL DEFAULT 0,
  running_balance  numeric(12,3) NOT NULL,
  average_cost     numeric(12,2),
  transaction_date timestamp NOT NULL DEFAULT now(),
  created_at       timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS inventory_ledger_item_wh_idx ON inventory_ledger (inventory_id, warehouse_id);
CREATE INDEX IF NOT EXISTS inventory_ledger_date_idx ON inventory_ledger (transaction_date);

CREATE TABLE IF NOT EXISTS consumption_history (
  id           bigserial PRIMARY KEY,
  menu_item_id integer NOT NULL REFERENCES menu_items(id),
  inventory_id integer NOT NULL REFERENCES inventory(id),
  consumed_qty numeric(12,3) NOT NULL,
  order_id     integer REFERENCES orders(id),
  consumed_at  timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id                       serial PRIMARY KEY,
  source_warehouse_id      integer NOT NULL REFERENCES warehouses(id),
  destination_warehouse_id integer NOT NULL REFERENCES warehouses(id),
  status                   text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'shipped', 'received', 'closed')),
  requested_by             integer REFERENCES users(id),
  approved_by              integer REFERENCES users(id),
  shipped_at               timestamp,
  received_at              timestamp,
  created_at               timestamp NOT NULL DEFAULT now(),
  CHECK (source_warehouse_id <> destination_warehouse_id)
);

CREATE TABLE IF NOT EXISTS transfer_items (
  id            serial PRIMARY KEY,
  transfer_id   integer NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  inventory_id  integer NOT NULL REFERENCES inventory(id),
  requested_qty numeric(12,3) NOT NULL CHECK (requested_qty > 0),
  shipped_qty   numeric(12,3) NOT NULL DEFAULT 0,
  received_qty  numeric(12,3) NOT NULL DEFAULT 0,
  UNIQUE (transfer_id, inventory_id),
  CHECK (received_qty <= shipped_qty)
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id              serial PRIMARY KEY,
  inventory_id    integer NOT NULL REFERENCES inventory(id),
  warehouse_id    integer REFERENCES warehouses(id),
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('damage', 'theft', 'expiry', 'wastage', 'manual_correction')),
  quantity        numeric(12,3) NOT NULL,      -- signed: negative removes stock
  reason          text,
  approved_by     integer REFERENCES users(id),
  created_by      integer REFERENCES users(id),
  created_at      timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_counts (
  id           serial PRIMARY KEY,
  warehouse_id integer NOT NULL REFERENCES warehouses(id),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'counting', 'submitted', 'approved', 'closed')),
  started_by   integer REFERENCES users(id),
  approved_by  integer REFERENCES users(id),
  started_at   timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);

CREATE TABLE IF NOT EXISTS stock_count_items (
  id             serial PRIMARY KEY,
  stock_count_id integer NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  inventory_id   integer NOT NULL REFERENCES inventory(id),
  system_qty     numeric(12,3) NOT NULL,
  physical_qty   numeric(12,3),
  variance       numeric(12,3) GENERATED ALWAYS AS (physical_qty - system_qty) STORED,  -- Physical - System
  UNIQUE (stock_count_id, inventory_id)
);

CREATE TABLE IF NOT EXISTS inventory_valuation (
  id             serial PRIMARY KEY,
  inventory_id   integer NOT NULL REFERENCES inventory(id),
  warehouse_id   integer REFERENCES warehouses(id),
  qty            numeric(12,3) NOT NULL DEFAULT 0,
  avg_cost       numeric(12,2) NOT NULL DEFAULT 0,
  total_value    numeric(14,2) GENERATED ALWAYS AS (qty * avg_cost) STORED,
  valuation_date date NOT NULL DEFAULT current_date,
  UNIQUE (inventory_id, warehouse_id, valuation_date)
);

-- ---------------------------------------------------------------------
-- 7. Procurement (product bible DB-PUR-005)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_contacts (
  id          serial PRIMARY KEY,
  supplier_id integer NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  phone       text,
  email       text,
  is_primary  boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS supplier_documents (
  id            serial PRIMARY KEY,
  supplier_id   integer NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  document_type text NOT NULL,                  -- gst_certificate | pan | agreement | other
  file_url      text NOT NULL,
  expires_at    date,
  uploaded_by   integer REFERENCES users(id),
  uploaded_at   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_price_history (
  id             bigserial PRIMARY KEY,
  supplier_id    integer NOT NULL REFERENCES suppliers(id),
  inventory_id   integer NOT NULL REFERENCES inventory(id),
  old_price      numeric(12,2),
  new_price      numeric(12,2) NOT NULL,
  effective_date date NOT NULL DEFAULT current_date
);
CREATE INDEX IF NOT EXISTS supplier_price_history_idx ON supplier_price_history (supplier_id, inventory_id, effective_date);

CREATE TABLE IF NOT EXISTS reorder_rules (
  id                    serial PRIMARY KEY,
  inventory_id          integer NOT NULL UNIQUE REFERENCES inventory(id),
  minimum_level         numeric(12,3) NOT NULL DEFAULT 0,
  reorder_qty           numeric(12,3) NOT NULL DEFAULT 0,
  preferred_supplier_id integer REFERENCES suppliers(id),
  auto_generate_po      boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS purchase_requests (
  id             serial PRIMARY KEY,
  request_number text UNIQUE DEFAULT ('PR-' || nextval('pr_number_seq')),
  branch_id      text NOT NULL DEFAULT 'br-1' REFERENCES branches(branch_code),
  supplier_id    integer REFERENCES suppliers(id),
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'converted', 'rejected', 'cancelled')),
  requested_by   integer REFERENCES users(id),
  approved_by    integer REFERENCES users(id),
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_request_items (
  id                  serial PRIMARY KEY,
  purchase_request_id integer NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  inventory_id        integer NOT NULL REFERENCES inventory(id),
  requested_qty       numeric(12,3) NOT NULL CHECK (requested_qty > 0),
  notes               text
);

-- Purchase orders. The app's table name is kept (the bible calls this purchases).
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                     serial PRIMARY KEY,
  branch_id              text NOT NULL DEFAULT 'br-1' REFERENCES branches(branch_code),
  supplier_id           integer NOT NULL REFERENCES suppliers(id),
  invoice_number         text,                   -- supplier invoice reference (app column)
  status                 text NOT NULL DEFAULT 'pending',  -- app: pending | received | cancelled
  total_amount           numeric(10,2) NOT NULL DEFAULT 0,
  created_at             timestamp NOT NULL DEFAULT now(),
  po_number              text UNIQUE DEFAULT ('PO-' || nextval('po_number_seq')),
  request_id             integer REFERENCES purchase_requests(id),
  warehouse_id           integer REFERENCES warehouses(id),
  currency               text NOT NULL DEFAULT 'INR',
  expected_delivery_date date,
  subtotal               numeric(12,2) NOT NULL DEFAULT 0,
  tax_total              numeric(12,2) NOT NULL DEFAULT 0,
  approved_by            integer REFERENCES users(id),
  approved_at            timestamp,
  created_by             integer REFERENCES users(id),
  updated_at             timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_orders_supplier_status_idx ON purchase_orders (supplier_id, status);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                serial PRIMARY KEY,
  purchase_order_id integer NOT NULL REFERENCES purchase_orders(id),
  inventory_id      integer NOT NULL REFERENCES inventory(id),
  quantity          numeric(10,3) NOT NULL,      -- ordered quantity (app column)
  unit_price        numeric(10,2) NOT NULL,
  created_at        timestamp NOT NULL DEFAULT now(),
  expiry_date       timestamp,                   -- app column
  received_qty      numeric(12,3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  tax_amount        numeric(12,2) NOT NULL DEFAULT 0,
  line_total        numeric(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS purchase_order_items_po_idx ON purchase_order_items (purchase_order_id);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id                serial PRIMARY KEY,
  grn_number        text UNIQUE DEFAULT ('GRN-' || nextval('grn_number_seq')),
  purchase_order_id integer REFERENCES purchase_orders(id),
  warehouse_id      integer REFERENCES warehouses(id),
  received_by       integer REFERENCES users(id),
  received_at       timestamp NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'received' CHECK (status IN ('draft', 'received', 'posted', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id                     serial PRIMARY KEY,
  goods_receipt_id       integer NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id integer REFERENCES purchase_order_items(id),
  inventory_id           integer NOT NULL REFERENCES inventory(id),
  received_qty           numeric(12,3) NOT NULL CHECK (received_qty > 0),
  batch_number           text,
  expiry_date            date,
  unit_cost              numeric(12,2)
);

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id                serial PRIMARY KEY,
  invoice_number    text NOT NULL,
  supplier_id       integer NOT NULL REFERENCES suppliers(id),
  purchase_order_id integer REFERENCES purchase_orders(id),
  goods_receipt_id  integer REFERENCES goods_receipts(id),
  invoice_date      date NOT NULL,
  due_date          date,
  currency          text NOT NULL DEFAULT 'INR',
  subtotal          numeric(12,2) NOT NULL DEFAULT 0,
  tax_total         numeric(12,2) NOT NULL DEFAULT 0,
  grand_total       numeric(12,2) NOT NULL DEFAULT 0,
  posting_status    text NOT NULL DEFAULT 'draft' CHECK (posting_status IN ('draft', 'posted', 'paid', 'cancelled')),
  created_at        timestamp NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, invoice_number)           -- duplicate invoices are blocked
);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id                  serial PRIMARY KEY,
  purchase_invoice_id integer NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  inventory_id        integer NOT NULL REFERENCES inventory(id),
  quantity            numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price          numeric(12,2) NOT NULL,
  tax_amount          numeric(12,2) NOT NULL DEFAULT 0,
  line_total          numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS landed_costs (
  id                  serial PRIMARY KEY,
  purchase_invoice_id integer REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  purchase_order_id   integer REFERENCES purchase_orders(id),
  cost_type           text NOT NULL CHECK (cost_type IN ('freight', 'insurance', 'customs', 'local_transport', 'handling')),
  amount              numeric(12,2) NOT NULL CHECK (amount >= 0),
  allocation_method   text NOT NULL DEFAULT 'by_value' CHECK (allocation_method IN ('by_value', 'by_quantity', 'by_weight', 'equal')),
  created_at          timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id                  serial PRIMARY KEY,
  supplier_id         integer NOT NULL REFERENCES suppliers(id),
  purchase_invoice_id integer REFERENCES purchase_invoices(id),
  amount              numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_mode        text NOT NULL,
  reference           text,
  paid_at             timestamp NOT NULL DEFAULT now(),
  created_by          integer REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id                  serial PRIMARY KEY,
  return_number       text UNIQUE DEFAULT ('PRT-' || nextval('return_number_seq')),
  supplier_id         integer NOT NULL REFERENCES suppliers(id),
  purchase_invoice_id integer REFERENCES purchase_invoices(id),
  reason              text NOT NULL CHECK (reason IN ('damaged', 'wrong_item', 'expired', 'excess_supply')),
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'returned', 'credit_note_received', 'closed')),
  created_by          integer REFERENCES users(id),
  approved_by         integer REFERENCES users(id),
  created_at          timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id                 serial PRIMARY KEY,
  purchase_return_id integer NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  inventory_id       integer NOT NULL REFERENCES inventory(id),
  quantity           numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price         numeric(12,2) NOT NULL DEFAULT 0,
  line_total         numeric(12,2) NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- 8. Integrations, notifications, versioning
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations (
  id               serial PRIMARY KEY,
  integration_name text NOT NULL UNIQUE,
  provider         text NOT NULL,              -- payment_gateway | accounting | sms | whatsapp ...
  integration_type text,
  status           text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
  retry_policy     jsonb NOT NULL DEFAULT '{"max_attempts": 3, "backoff_seconds": 30}',
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_credentials (
  id               serial PRIMARY KEY,
  integration_id   integer NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  client_id        text NOT NULL,
  encrypted_secret text NOT NULL,              -- encrypted by the application; never plaintext
  token_expiry     timestamp,
  last_rotated_at  timestamp,
  created_at       timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id            serial PRIMARY KEY,
  template_code text NOT NULL UNIQUE,
  channel       text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'push', 'webhook')),
  subject       text,
  body          text NOT NULL,
  language      text NOT NULL DEFAULT 'en',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_channels (
  id           serial PRIMARY KEY,
  channel_code text NOT NULL UNIQUE,
  channel      text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'push', 'webhook')),
  provider     text,
  template_id  integer REFERENCES notification_templates(id),
  config       jsonb NOT NULL DEFAULT '{}',
  is_active    boolean NOT NULL DEFAULT false,
  CHECK (NOT is_active OR template_id IS NOT NULL)   -- a template is required before activation
);

CREATE TABLE IF NOT EXISTS feature_history (
  id              bigserial PRIMARY KEY,
  feature_flag_id integer NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  previous_state  jsonb,
  new_state       jsonb NOT NULL,
  changed_by      integer REFERENCES users(id),
  changed_at      timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS configuration_versions (
  id                 serial PRIMARY KEY,
  version_number     integer NOT NULL UNIQUE,
  changed_by         integer REFERENCES users(id),
  published_at       timestamp NOT NULL DEFAULT now(),
  rollback_reference integer REFERENCES configuration_versions(id),
  snapshot           jsonb NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------
-- 9. Analytics and background work
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_jobs (
  id            serial PRIMARY KEY,
  report_code   text NOT NULL UNIQUE,
  title         text NOT NULL,
  schedule_cron text,
  parameters    jsonb NOT NULL DEFAULT '{}',
  recipients    text[] NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  created_by    integer REFERENCES users(id),
  created_at    timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_execution_logs (
  id            bigserial PRIMARY KEY,
  report_job_id integer REFERENCES report_jobs(id),
  report_code   text NOT NULL,
  requested_by  integer REFERENCES users(id),
  parameters    jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  row_count     integer,
  file_url      text,
  started_at    timestamp NOT NULL DEFAULT now(),
  finished_at   timestamp
);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id          serial PRIMARY KEY,
  user_id     integer REFERENCES users(id) ON DELETE CASCADE,
  widget_code text NOT NULL,
  title       text NOT NULL,
  config      jsonb NOT NULL DEFAULT '{}',
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS background_jobs (
  id           bigserial PRIMARY KEY,
  job_type     text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'retrying')),
  attempts     integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error   text,
  scheduled_at timestamp NOT NULL DEFAULT now(),
  started_at   timestamp,
  finished_at  timestamp,
  created_at   timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS background_jobs_status_idx ON background_jobs (status, scheduled_at);

-- ---------------------------------------------------------------------
-- 10. Audit, events and logs (product bible DB-AUD-007)
-- ---------------------------------------------------------------------
-- Append-only, partitioned by month.
CREATE TABLE IF NOT EXISTS audit_logs (
  id              bigserial,
  entity_type     text NOT NULL,
  entity_id       text NOT NULL,
  action          text NOT NULL,
  user_id         integer REFERENCES users(id),
  branch_id       text,
  before_snapshot jsonb,
  after_snapshot  jsonb,
  reason          text,
  ip_address      inet,
  device_id       integer REFERENCES devices(id),
  correlation_id  text,
  created_at      timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs (user_id);

CREATE TABLE IF NOT EXISTS audit_log_details (
  id           bigserial PRIMARY KEY,
  audit_log_id bigint NOT NULL,                 -- references audit_logs(id); not enforced because audit_logs is partitioned
  field_name   text NOT NULL,
  old_value    text,
  new_value    text
);

CREATE TABLE IF NOT EXISTS activity_timeline (
  id            bigserial PRIMARY KEY,
  user_id       integer REFERENCES users(id),
  branch_id     text REFERENCES branches(branch_code),
  activity_type text NOT NULL CHECK (activity_type IN ('login', 'order_created', 'payment', 'refund', 'stock_adjustment', 'purchase_approval', 'configuration_change', 'shift_opened', 'shift_closed', 'other')),
  summary       text NOT NULL,
  entity_type   text,
  entity_id     text,
  created_at    timestamp NOT NULL DEFAULT now()
);

-- Partitioned by month.
CREATE TABLE IF NOT EXISTS event_logs (
  id           bigserial,
  event_name   text NOT NULL,                   -- OrderCreated | KOTGenerated | PaymentCompleted | StockAdjusted | ShiftClosed ...
  payload      jsonb NOT NULL DEFAULT '{}',
  published_at timestamp,
  processed_at timestamp,
  retry_count  integer NOT NULL DEFAULT 0,
  created_at   timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE INDEX IF NOT EXISTS event_logs_name_idx ON event_logs (event_name);

-- Partitioned by month. 90 days online per the bible.
CREATE TABLE IF NOT EXISTS api_request_logs (
  id                 bigserial,
  request_id         text NOT NULL,
  endpoint           text NOT NULL,
  method             text NOT NULL,
  authenticated_user integer REFERENCES users(id),
  request_size       integer,
  latency_ms         integer,
  response_code     integer,
  correlation_id     text,
  created_at         timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS api_response_logs (
  id            bigserial PRIMARY KEY,
  request_id    text NOT NULL,
  response_size integer,
  response_hash text,
  body_excerpt  text,                           -- truncated; must never contain secrets
  created_at    timestamp NOT NULL DEFAULT now()
);

-- Partitioned by month.
CREATE TABLE IF NOT EXISTS notification_logs (
  id            bigserial,
  template_id   integer REFERENCES notification_templates(id),
  channel       text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'push', 'webhook')),
  recipient     text NOT NULL,
  status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'expired')),
  retry_count   integer NOT NULL DEFAULT 0,
  error_message text,
  created_at    timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS scheduler_logs (
  id              bigserial PRIMARY KEY,
  job_name        text NOT NULL,
  run_started_at  timestamp NOT NULL DEFAULT now(),
  run_finished_at timestamp,
  status          text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  error_message   text
);

CREATE TABLE IF NOT EXISTS integration_logs (
  id               bigserial PRIMARY KEY,
  integration_id   integer REFERENCES integrations(id),
  request_payload  jsonb,
  response_payload jsonb,
  status_code      integer,
  retry_count      integer NOT NULL DEFAULT 0,
  duration_ms      integer,
  failure_reason   text,
  created_at       timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id             bigserial PRIMARY KEY,
  integration_id integer REFERENCES integrations(id),
  direction      text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  endpoint       text NOT NULL,
  payload        jsonb,
  status_code    integer,
  delivered_at   timestamp,
  created_at     timestamp NOT NULL DEFAULT now()
);

-- Partitioned by month.
CREATE TABLE IF NOT EXISTS error_logs (
  id             bigserial,
  severity       text NOT NULL CHECK (severity IN ('INFO', 'WARN', 'ERROR', 'FATAL')),
  service_name   text NOT NULL,
  message        text NOT NULL,
  stack_trace    text,
  request_id     text,
  correlation_id text,
  created_at     timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS security_events (
  id         bigserial PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN ('failed_login', 'account_locked', 'password_reset', 'privilege_escalation', 'permission_change', 'token_revoked')),
  severity   text NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  user_id    integer REFERENCES users(id),
  device_id  integer REFERENCES devices(id),
  ip_address inet,
  details    jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_change_history (
  id          bigserial PRIMARY KEY,
  table_name  text NOT NULL,
  row_id      text NOT NULL,
  column_name text NOT NULL,
  old_value   text,
  new_value   text,
  changed_by  integer REFERENCES users(id),
  changed_at  timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 11. Monthly partitions (log and ledger tables)
-- ---------------------------------------------------------------------
-- 24 months from 2026-01, plus a DEFAULT partition that catches anything outside that range.
SELECT ensure_monthly_partitions('inventory_ledger', DATE '2026-01-01', 24);
SELECT ensure_monthly_partitions('audit_logs',       DATE '2026-01-01', 24);
SELECT ensure_monthly_partitions('event_logs',       DATE '2026-01-01', 24);
SELECT ensure_monthly_partitions('api_request_logs', DATE '2026-01-01', 24);
SELECT ensure_monthly_partitions('notification_logs',DATE '2026-01-01', 24);
SELECT ensure_monthly_partitions('error_logs',       DATE '2026-01-01', 24);

CREATE TABLE IF NOT EXISTS inventory_ledger_default PARTITION OF inventory_ledger DEFAULT;
CREATE TABLE IF NOT EXISTS audit_logs_default       PARTITION OF audit_logs       DEFAULT;
CREATE TABLE IF NOT EXISTS event_logs_default       PARTITION OF event_logs       DEFAULT;
CREATE TABLE IF NOT EXISTS api_request_logs_default PARTITION OF api_request_logs DEFAULT;
CREATE TABLE IF NOT EXISTS notification_logs_default PARTITION OF notification_logs DEFAULT;
CREATE TABLE IF NOT EXISTS error_logs_default       PARTITION OF error_logs       DEFAULT;

-- ---------------------------------------------------------------------
-- 12. Triggers: append-only enforcement and updated_at maintenance
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS inventory_ledger_append_only ON inventory_ledger;
CREATE TRIGGER inventory_ledger_append_only
  BEFORE UPDATE OR DELETE ON inventory_ledger
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches', 'users', 'user_profiles', 'inventory_categories', 'warehouses',
    'suppliers', 'inventory', 'orders', 'menu_items', 'categories',
    'purchase_orders', 'purchase_requests', 'business_profiles', 'integrations',
    'feature_flags', 'security_policies', 'system_settings'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 13. Row Level Security: on, with no policies (see header)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT c.relname
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 14. Reference data (safe to re-run)
-- ---------------------------------------------------------------------
INSERT INTO branches (branch_code, branch_name, timezone, currency)
VALUES ('br-1', 'Main Branch', 'Asia/Kolkata', 'INR')
ON CONFLICT (branch_code) DO NOTHING;

INSERT INTO warehouses (branch_id, code, name, is_default)
VALUES ('br-1', 'BR1-MAIN', 'Main Store', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles (role_code, role_name, description, is_system_role) VALUES
  ('owner',      'Owner',      'Full access, including user and role administration', true),
  ('manager',    'Manager',    'Refunds, inventory and purchase approvals',           true),
  ('cashier',    'Cashier',    'Creates orders and takes payments',                  true),
  ('waiter',     'Waiter',     'Takes orders and sends KOTs',                        true),
  ('kitchen',    'Kitchen',    'Kitchen display updates',                            true),
  ('inventory',  'Inventory',  'Stock, counts and goods receipt',                    true),
  ('accountant', 'Accountant', 'Reports, audit and financial review',                 true),
  ('admin',      'Admin',      'System configuration and user management',            true)
ON CONFLICT (role_code) DO NOTHING;

INSERT INTO permissions (permission_code, description) VALUES
  ('POS.VIEW',               'View POS screens'),
  ('POS.CREATE',             'Create orders'),
  ('POS.DISCOUNT',           'Apply discounts'),
  ('POS.REFUND',             'Refund payments'),
  ('KOT.CREATE',             'Send kitchen order tickets'),
  ('KITCHEN.VIEW',           'View kitchen display'),
  ('KITCHEN.UPDATE',         'Update item preparation status'),
  ('PAYMENT.CREATE',         'Take payments'),
  ('PAYMENT.VOID',           'Void payments'),
  ('SHIFT.OPEN',             'Open a shift'),
  ('SHIFT.CLOSE',            'Close a shift'),
  ('INVENTORY.VIEW',         'View inventory'),
  ('INVENTORY.ADJUST',       'Adjust stock'),
  ('INVENTORY.COUNT',        'Run stock counts'),
  ('PURCHASE.CREATE',        'Create purchase orders'),
  ('PURCHASE.APPROVE',       'Approve purchase orders'),
  ('PURCHASE.RECEIVE',       'Receive goods'),
  ('REPORT.VIEW',            'View reports'),
  ('REPORT.EXPORT',          'Export reports'),
  ('AUDIT.VIEW',             'View audit logs'),
  ('ADMIN.USER.CREATE',      'Create users'),
  ('ADMIN.USER.UPDATE',      'Update users'),
  ('ADMIN.ROLE.MANAGE',      'Manage roles and permissions'),
  ('ADMIN.SETTINGS.MANAGE',  'Manage settings and configuration')
ON CONFLICT (permission_code) DO NOTHING;

-- Owner gets every permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'owner'
ON CONFLICT DO NOTHING;

-- Other roles, per the bible permission matrix.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('cashier',    'POS.VIEW'), ('cashier',    'POS.CREATE'), ('cashier',    'KOT.CREATE'),
  ('cashier',    'PAYMENT.CREATE'), ('cashier', 'SHIFT.OPEN'), ('cashier', 'SHIFT.CLOSE'),
  ('waiter',     'POS.VIEW'), ('waiter',     'POS.CREATE'), ('waiter',     'KOT.CREATE'),
  ('kitchen',    'KITCHEN.VIEW'), ('kitchen', 'KITCHEN.UPDATE'),
  ('manager',    'POS.VIEW'), ('manager',    'POS.CREATE'), ('manager',    'POS.DISCOUNT'),
  ('manager',    'POS.REFUND'), ('manager',  'KOT.CREATE'), ('manager',    'PAYMENT.CREATE'),
  ('manager',    'PAYMENT.VOID'), ('manager', 'SHIFT.OPEN'), ('manager',    'SHIFT.CLOSE'),
  ('manager',    'INVENTORY.VIEW'), ('manager', 'INVENTORY.ADJUST'), ('manager', 'INVENTORY.COUNT'),
  ('manager',    'PURCHASE.CREATE'), ('manager', 'PURCHASE.APPROVE'), ('manager', 'PURCHASE.RECEIVE'),
  ('manager',    'REPORT.VIEW'), ('manager', 'REPORT.EXPORT'),
  ('inventory',  'INVENTORY.VIEW'), ('inventory', 'INVENTORY.ADJUST'), ('inventory', 'INVENTORY.COUNT'),
  ('inventory',  'PURCHASE.CREATE'), ('inventory', 'PURCHASE.RECEIVE'),
  ('accountant', 'REPORT.VIEW'), ('accountant', 'REPORT.EXPORT'), ('accountant', 'AUDIT.VIEW'),
  ('admin',      'ADMIN.USER.CREATE'), ('admin', 'ADMIN.USER.UPDATE'),
  ('admin',      'ADMIN.ROLE.MANAGE'), ('admin', 'ADMIN.SETTINGS.MANAGE')
) AS m(role_code, permission_code)
JOIN roles r ON r.role_code = m.role_code
JOIN permissions p ON p.permission_code = m.permission_code
ON CONFLICT DO NOTHING;

INSERT INTO unit_of_measure (code, name, conversion_factor, base_unit) VALUES
  ('KG',  'Kilogram', 1, true),
  ('L',   'Litre',    1, true),
  ('PC',  'Piece',    1, true),
  ('BOX', 'Box',      1, true),
  ('PKT', 'Packet',   1, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO unit_of_measure (code, name, conversion_factor, base_unit, base_uom_id)
SELECT v.code, v.name, v.factor, false, b.id
FROM (VALUES
  ('G',  'Gram',       0.001::numeric, 'KG'),
  ('ML', 'Millilitre', 0.001::numeric, 'L')
) AS v(code, name, factor, base_code)
JOIN unit_of_measure b ON b.code = v.base_code
ON CONFLICT (code) DO NOTHING;

INSERT INTO setting_groups (group_code, group_name, display_order) VALUES
  ('GENERAL',  'General',         1),
  ('POS',      'Point of sale',   2),
  ('KITCHEN',  'Kitchen',         3),
  ('TAX',      'Tax',             4),
  ('PRINTING', 'Printing',        5),
  ('SECURITY', 'Security',        6)
ON CONFLICT (group_code) DO NOTHING;

INSERT INTO security_policies (policy_key) VALUES ('default')
ON CONFLICT (policy_key) DO NOTHING;

COMMIT;
