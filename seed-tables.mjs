/**
 * seed-tables.mjs
 * Seeds the database with:
 *   - 3 table sections (Main, Patio, Bar)
 *   - 30 tables: 16 Main (T1–T16), 8 Patio (P1–P8), 6 Bar (B1–B6)
 * Run: node seed-tables.mjs
 */
import postgres from 'postgres';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_pos';
const sql = postgres(connectionString, { max: 1 });

async function seed() {
  console.log('Seeding table sections...');

  // Upsert sections
  const sections = [
    { name: 'Main',  prefix: 'T' },
    { name: 'Patio', prefix: 'P' },
    { name: 'Bar',   prefix: 'B' },
  ];

  const sectionRows = {};
  for (const s of sections) {
    const existing = await sql`SELECT id FROM table_sections WHERE name = ${s.name} LIMIT 1`;
    if (existing.length > 0) {
      sectionRows[s.name] = existing[0].id;
      console.log(`  Section "${s.name}" already exists (id=${existing[0].id})`);
    } else {
      const [row] = await sql`
        INSERT INTO table_sections (name, prefix, active)
        VALUES (${s.name}, ${s.prefix}, true)
        RETURNING id
      `;
      sectionRows[s.name] = row.id;
      console.log(`  Inserted section "${s.name}" (id=${row.id})`);
    }
  }

  console.log('\nSeeding tables...');


  const tableDefs = [
    // Main — 16 tables
    ...Array.from({ length: 16 }, (_, i) => ({
      number: `T${i + 1}`,
      section: 'Main',
      seats: i % 3 === 0 ? 6 : i % 2 === 0 ? 4 : 2,
    })),
    // Patio — 8 tables
    ...Array.from({ length: 8 }, (_, i) => ({
      number: `P${i + 1}`,
      section: 'Patio',
      seats: i < 4 ? 4 : 6,
    })),
    // Bar — 6 stools
    ...Array.from({ length: 6 }, (_, i) => ({
      number: `B${i + 1}`,
      section: 'Bar',
      seats: 2,
    })),
  ];

  // Upsert each table by number (avoids FK violation from existing orders)
  for (const t of tableDefs) {
    const existing = await sql`SELECT id FROM tables WHERE number = ${t.number} LIMIT 1`;
    if (existing.length > 0) {
      await sql`
        UPDATE tables SET section_id = ${sectionRows[t.section]}, status = 'available'
        WHERE number = ${t.number}
      `;
      console.log(`  Updated table ${t.number} → section ${t.section}`);
    } else {
      await sql`
        INSERT INTO tables (number, section_id, status)
        VALUES (${t.number}, ${sectionRows[t.section]}, 'available')
      `;
      console.log(`  Inserted table ${t.number} → section ${t.section}`);
    }
  }
  console.log(`  Done: ${tableDefs.length} tables processed.`);


  // Also seed default payment methods if empty
  const pmCount = await sql`SELECT COUNT(*) as cnt FROM payment_methods`;
  if (parseInt(pmCount[0].cnt) === 0) {
    console.log('\nSeeding default payment methods...');
    await sql`INSERT INTO payment_methods (name, type, active) VALUES ('Cash', 'cash', true)`;
    await sql`INSERT INTO payment_methods (name, type, active) VALUES ('Card', 'card', true)`;
    await sql`INSERT INTO payment_methods (name, type, active) VALUES ('UPI', 'upi', true)`;
    console.log('  Inserted 3 payment methods.');
  }

  // Also seed default stations if empty
  const stnCount = await sql`SELECT COUNT(*) as cnt FROM stations`;
  if (parseInt(stnCount[0].cnt) === 0) {
    console.log('\nSeeding default kitchen stations...');
    await sql`INSERT INTO stations (name, active) VALUES ('Kitchen', true)`;
    await sql`INSERT INTO stations (name, active) VALUES ('Tandoor', true)`;
    await sql`INSERT INTO stations (name, active) VALUES ('Bar', true)`;
    console.log('  Inserted 3 stations.');
  }

  // Seed default tax slabs if empty
  const taxCount = await sql`SELECT COUNT(*) as cnt FROM tax_slabs`;
  if (parseInt(taxCount[0].cnt) === 0) {
    console.log('\nSeeding default tax slabs...');
    await sql`INSERT INTO tax_slabs (name, rate, is_default, active) VALUES ('No Tax', 0, false, true)`;
    await sql`INSERT INTO tax_slabs (name, rate, is_default, active) VALUES ('GST 5%', 5, false, true)`;
    await sql`INSERT INTO tax_slabs (name, rate, is_default, active) VALUES ('GST 12%', 12, false, true)`;
    await sql`INSERT INTO tax_slabs (name, rate, is_default, active) VALUES ('GST 18%', 18, true, true)`;
    console.log('  Inserted 4 tax slabs.');
  }

  console.log('\n✅ Seed complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
