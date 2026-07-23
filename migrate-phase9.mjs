/**
 * migrate-phase9.mjs
 * Syncs the live DB with schema additions that were never migrated:
 *  - orders: customer_name, customer_phone, branch_id, shift_id, table_id type change TEXT
 *  - tables: branch_id
 *  - table_sections: branch_id
 *  - inventory: branch_id
 *  - purchase_orders: branch_id, invoice_number
 *  - purchase_order_items: expiry_date
 *  - shifts table (new)
 *  - refunds table (new)
 *  - recipe_bom table (new)
 *  - inventory_ledger table (new)
 *  - reservations table (new)
 *  - users: created_at
 */
import 'dotenv/config';
import postgres from 'postgres';

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  console.log('Connecting to Supabase…');
  const sql = postgres(connectionString, {
    prepare: false,
    ssl: 'require',
  });

  try {
    console.log('\n1. Patching orders table…');
    await sql`ALTER TABLE orders ALTER COLUMN table_id TYPE text USING table_id::text`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name text`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone text`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id text`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift_id integer`;

    // Drop old FK on table_id if it exists (old FK was int, now text)
    await sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'orders_table_id_tables_id_fk'
        ) THEN
          ALTER TABLE orders DROP CONSTRAINT orders_table_id_tables_id_fk;
        END IF;
      END
      $$;
    `;

    console.log('2. Patching tables table…');
    await sql`ALTER TABLE tables ADD COLUMN IF NOT EXISTS branch_id text DEFAULT 'br-1' NOT NULL`;

    console.log('3. Patching table_sections table…');
    await sql`ALTER TABLE table_sections ADD COLUMN IF NOT EXISTS branch_id text DEFAULT 'br-1' NOT NULL`;

    console.log('4. Patching inventory table…');
    await sql`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS branch_id text DEFAULT 'br-1' NOT NULL`;

    console.log('5. Patching purchase_orders table…');
    await sql`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS branch_id text DEFAULT 'br-1' NOT NULL`;
    await sql`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS invoice_number text`;

    console.log('6. Patching purchase_order_items table…');
    await sql`ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS expiry_date timestamp`;

    console.log('7. Creating shifts table…');
    await sql`
      CREATE TABLE IF NOT EXISTS shifts (
        id serial PRIMARY KEY NOT NULL,
        branch_id text DEFAULT 'br-1' NOT NULL,
        opened_by integer NOT NULL REFERENCES users(id),
        closed_by integer REFERENCES users(id),
        opening_cash numeric(10, 2) NOT NULL,
        closing_cash numeric(10, 2),
        expected_cash numeric(10, 2),
        variance numeric(10, 2),
        status text DEFAULT 'open' NOT NULL,
        opened_at timestamp DEFAULT now() NOT NULL,
        closed_at timestamp
      )
    `;

    console.log('8. Creating refunds table…');
    await sql`
      CREATE TABLE IF NOT EXISTS refunds (
        id serial PRIMARY KEY NOT NULL,
        order_id integer NOT NULL REFERENCES orders(id),
        amount numeric(10, 2) NOT NULL,
        reason text NOT NULL,
        approved_by integer NOT NULL REFERENCES users(id),
        created_at timestamp DEFAULT now() NOT NULL
      )
    `;

    console.log('9. Creating recipe_bom table…');
    await sql`
      CREATE TABLE IF NOT EXISTS recipe_bom (
        id serial PRIMARY KEY NOT NULL,
        menu_item_id integer NOT NULL REFERENCES menu_items(id),
        inventory_id integer NOT NULL REFERENCES inventory(id),
        quantity numeric(10, 3) NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL
      )
    `;

    console.log('10. Creating inventory_ledger table…');
    await sql`
      CREATE TABLE IF NOT EXISTS inventory_ledger (
        id serial PRIMARY KEY NOT NULL,
        inventory_id integer NOT NULL REFERENCES inventory(id),
        transaction_type text NOT NULL,
        reference_id text,
        quantity_change numeric(10, 3) NOT NULL,
        running_balance numeric(10, 3) NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL
      )
    `;

    console.log('11. Creating reservations table…');
    await sql`
      CREATE TABLE IF NOT EXISTS reservations (
        id serial PRIMARY KEY NOT NULL,
        branch_id text DEFAULT 'br-1' NOT NULL,
        type text NOT NULL,
        status text DEFAULT 'waiting' NOT NULL,
        customer_name text NOT NULL,
        customer_phone text NOT NULL,
        pax integer NOT NULL,
        reservation_time text,
        table_id text,
        notes text,
        created_at timestamp DEFAULT now() NOT NULL
      )
    `;

    console.log('\n✅ All migrations completed successfully!');
  } catch (e) {
    console.error('\n❌ Migration error:', e.message);
    process.exit(1);
  }

  process.exit(0);
}

migrate();
