import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import fs from 'fs';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_pos';
const sql = postgres(connectionString, { max: 1 });

async function run() {
  console.log('Running 0001 migration directly...');
  const query = fs.readFileSync('drizzle/0001_regular_blockbuster.sql', 'utf8');
  const stmts = query.split('--> statement-breakpoint');
  for (let s of stmts) {
    if (s.trim()) {
      await sql.unsafe(s.trim());
    }
  }
  console.log('Migration complete');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
