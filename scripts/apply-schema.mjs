// Applies sql/001_restaurant_pos_schema.sql to the database named in DATABASE_URL,
// then verifies the result. The URL must come from the environment; this script
// never reads .env, so it cannot silently point at the wrong project.
//
// Usage (the URL is passed on the command line and is not saved anywhere):
//   DATABASE_URL="postgresql://postgres.<ref>:<password>@<host>:6543/postgres" node scripts/apply-schema.mjs

import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaFile = path.join(here, '..', 'sql', '001_restaurant_pos_schema.sql');
const schemaSql = readFileSync(schemaFile, 'utf8');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Pass it on the command line; the script does not read .env.');
  process.exit(1);
}

// Print the target without the password.
const shown = new URL(url.replace(/^postgres(ql)?:/, 'http:'));
console.log(`Target: host=${shown.hostname} port=${shown.port || 5432} db=${shown.pathname.slice(1)} user=${decodeURIComponent(shown.username)}`);

// Logical tables the file declares (partition children are created by function calls and are not listed here).
const expected = [...schemaSql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(/g)].map((m) => m[1]);
const expectedSet = new Set(expected);

const sql = postgres(url, { prepare: false, ssl: 'require', max: 1, connect_timeout: 30, idle_timeout: 5 });

async function logicalTables() {
  const rows = await sql`
    select c.relname as name, c.relkind as kind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
    order by 1`;
  return rows;
}

let exitCode = 0;
try {
  const before = await logicalTables();
  const existing = new Set(before.map((r) => r.name));
  const foreign = [...existing].filter((n) => !expectedSet.has(n));
  console.log(`Existing public tables: ${existing.size} (schema declares ${expected.length})`);

  if (foreign.length > 0) {
    console.error('Refusing to apply: the database has tables this schema does not manage:');
    console.error('  ' + foreign.join(', '));
    console.error('Move or drop those tables first, or apply the schema to an empty database.');
    process.exit(3);
  }

  console.log('Applying schema (one transaction)...');
  // .simple() uses the simple query protocol, which allows many statements in one call.
  await sql.unsafe(schemaSql).simple();
  console.log('Schema applied.');

  // ---- verification ----
  const after = new Set((await logicalTables()).map((r) => r.name));
  const missing = expected.filter((n) => !after.has(n));
  const extra = [...after].filter((n) => !expectedSet.has(n));
  console.log(`Tables present: ${after.size}  expected: ${expected.length}  missing: ${missing.length}  unexpected: ${extra.length}`);
  if (missing.length) { console.error('MISSING: ' + missing.join(', ')); exitCode = 4; }
  if (extra.length) console.log('Unexpected (not from this file): ' + extra.join(', '));

  const rls = await sql`
    select count(*) filter (where c.relrowsecurity)::int as enabled, count(*)::int as total
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')`;
  console.log(`Row Level Security enabled on ${rls[0].enabled} of ${rls[0].total} relations`);
  if (rls[0].enabled !== rls[0].total) exitCode = 4;

  const trig = await sql`
    select tgname from pg_trigger where tgname in ('inventory_ledger_append_only','audit_logs_append_only','trg_touch_updated_at') and not tgisinternal`;
  console.log(`Triggers present: ${trig.length} (expect at least 2 append-only + 17 updated_at)`);

  const seeds = await sql`
    select (select count(*) from branches)::int as branches,
           (select count(*) from roles)::int as roles,
           (select count(*) from permissions)::int as permissions,
           (select count(*) from role_permissions)::int as role_permissions,
           (select count(*) from unit_of_measure)::int as units,
           (select count(*) from warehouses)::int as warehouses`;
  console.log('Reference data:', JSON.stringify(seeds[0]));

  const parts = await sql`
    select count(*)::int as n from pg_inherits i
    join pg_class p on p.oid = i.inhparent
    where p.relname in ('inventory_ledger','audit_logs','event_logs','api_request_logs','notification_logs','error_logs')`;
  console.log(`Monthly partitions attached: ${parts[0].n}`);
} catch (err) {
  console.error('FAILED:', err.message);
  if (err.position) console.error('At character offset:', err.position);
  exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

process.exit(exitCode);
