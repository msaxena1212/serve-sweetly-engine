import postgres from 'postgres';
import 'dotenv/config';

const sql = postgres(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_pos');

async function run() {
  await sql`
    CREATE TABLE IF NOT EXISTS reservations (
      id SERIAL PRIMARY KEY,
      branch_id TEXT NOT NULL DEFAULT 'br-1',
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      pax INTEGER NOT NULL,
      reservation_time TEXT,
      table_id INTEGER REFERENCES tables(id),
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;
  console.log('Table reservations created.');
  process.exit(0);
}
run();
