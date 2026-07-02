import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_pos';

// Supabase uses transaction pooler — prepare:false is required
// SSL is auto-detected from the connection string
const client = postgres(connectionString, { 
  prepare: false,
  ssl: connectionString.includes('supabase.co') ? 'require' : false,
});
export const db = drizzle(client, { schema });
