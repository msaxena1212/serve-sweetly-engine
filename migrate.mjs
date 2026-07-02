import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_pos';

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

async function run() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('Migrations complete');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
