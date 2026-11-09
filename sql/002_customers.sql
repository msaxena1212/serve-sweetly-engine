-- Customers: one record per guest, matched by phone number.
-- Idempotent. Run after sql/001_restaurant_pos_schema.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS customers (
  id          serial PRIMARY KEY,
  full_name   text NOT NULL,
  phone       text NOT NULL UNIQUE,            -- primary match key at the till
  email       text,
  city        text,
  branch_id   text REFERENCES branches(branch_code),
  loyalty_tier text,                           -- e.g. Silver, Gold (not enforced yet)
  is_sample   boolean NOT NULL DEFAULT false,  -- true for demo data, so it can be removed
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id integer REFERENCES customers(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS customer_id integer REFERENCES customers(id);

CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders (customer_id);
CREATE INDEX IF NOT EXISTS reservations_customer_idx ON reservations (customer_id);

DROP TRIGGER IF EXISTS trg_touch_updated_at ON customers;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

COMMIT;
