import { db } from './src/lib/db/db.ts';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    // Drop foreign keys
    await db.execute(sql`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_table_id_tables_id_fk;`);
    await db.execute(sql`ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_table_id_tables_id_fk;`);
    
    // Change column type
    await db.execute(sql`ALTER TABLE orders ALTER COLUMN table_id TYPE text;`);
    await db.execute(sql`ALTER TABLE reservations ALTER COLUMN table_id TYPE text;`);
    
    console.log('Successfully updated DB schema for table_id to text.');
  } catch (err) {
    console.error('Error altering schema:', err);
  }
}
run();
