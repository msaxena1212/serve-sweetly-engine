import postgres from 'postgres';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_pos';
const sql = postgres(connectionString, { max: 1 });

async function migrate() {
  console.log('Running manual migrations for Phase 6...');

  try {
    // 1. Update orders table
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name text`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone text`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift_id integer`;
    console.log('✅ Updated orders table');

    // 2. Create shifts table
    await sql`
      CREATE TABLE IF NOT EXISTS shifts (
        id serial PRIMARY KEY,
        opened_by integer NOT NULL REFERENCES users(id),
        closed_by integer REFERENCES users(id),
        opening_cash numeric(10,2) NOT NULL,
        closing_cash numeric(10,2),
        expected_cash numeric(10,2),
        variance numeric(10,2),
        status text NOT NULL DEFAULT 'open',
        opened_at timestamp NOT NULL DEFAULT now(),
        closed_at timestamp
      )
    `;
    console.log('✅ Created shifts table');

    // 3. Create refunds table
    await sql`
      CREATE TABLE IF NOT EXISTS refunds (
        id serial PRIMARY KEY,
        order_id integer NOT NULL REFERENCES orders(id),
        amount numeric(10,2) NOT NULL,
        reason text NOT NULL,
        approved_by integer NOT NULL REFERENCES users(id),
        created_at timestamp NOT NULL DEFAULT now()
      )
    `;
    console.log('✅ Created refunds table');

    // Add shift_id foreign key constraint if not exists
    try {
      await sql`
        ALTER TABLE orders 
        ADD CONSTRAINT orders_shift_id_fkey 
        FOREIGN KEY (shift_id) REFERENCES shifts(id)
      `;
      console.log('✅ Added foreign key for shift_id on orders');
    } catch (e) {
      if (e.code === '42710') {
        // constraint already exists
      } else {
        console.warn('⚠️ Could not add FK for shift_id:', e.message);
      }
    }

    console.log('\nMigration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit(0);
  }
}

migrate();
