import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './src/lib/db/schema.js';
import { eq } from 'drizzle-orm';

async function test() {
  const connectionString = process.env.DATABASE_URL;
  const client = postgres(connectionString, { prepare: false, ssl: 'require' });
  const db = drizzle(client, { schema });

  try {
    const orders = await db.select().from(schema.orders).limit(3);
    console.log('✅ orders:', orders.length, 'rows');
    const items = await db.select().from(schema.orderItems).limit(3);
    console.log('✅ order_items:', items.length, 'rows');
    const reservations = await db.select().from(schema.reservations).limit(3);
    console.log('✅ reservations:', reservations.length, 'rows');
    const shifts = await db.select().from(schema.shifts).limit(3);
    console.log('✅ shifts:', shifts.length, 'rows');
    console.log('\n✅ All tables OK!');
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
  process.exit(0);
}
test();
