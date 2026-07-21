import postgres from 'postgres';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_pos';
const sql = postgres(connectionString, { max: 1 });

async function migrate() {
  console.log('Running manual migrations for Phase 8 (Multi-Branch)...');

  try {
    // 1. Update tables
    await sql`ALTER TABLE tables ADD COLUMN IF NOT EXISTS branch_id text NOT NULL DEFAULT 'br-1'`;
    console.log('✅ Updated tables table');

    // 2. Update table_sections
    await sql`ALTER TABLE table_sections ADD COLUMN IF NOT EXISTS branch_id text NOT NULL DEFAULT 'br-1'`;
    console.log('✅ Updated table_sections table');

    // 3. Update inventory
    await sql`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS branch_id text NOT NULL DEFAULT 'br-1'`;
    console.log('✅ Updated inventory table');

    // 4. Update purchase_orders
    await sql`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS branch_id text NOT NULL DEFAULT 'br-1'`;
    console.log('✅ Updated purchase_orders table');

    // 5. Update shifts
    await sql`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS branch_id text NOT NULL DEFAULT 'br-1'`;
    console.log('✅ Updated shifts table');

    console.log('🎉 Phase 8 migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await sql.end();
  }
}

migrate();
