import postgres from 'postgres';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_pos';
const sql = postgres(connectionString, { max: 1 });

async function run() {
  console.log('Running Phase 7 migration: Recipe BOM and Inventory Ledger');
  
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "recipe_bom" (
      "id" serial PRIMARY KEY NOT NULL,
      "menu_item_id" integer NOT NULL,
      "inventory_id" integer NOT NULL,
      "quantity" numeric(10, 3) NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  console.log('Created recipe_bom');

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "inventory_ledger" (
      "id" serial PRIMARY KEY NOT NULL,
      "inventory_id" integer NOT NULL,
      "transaction_type" text NOT NULL,
      "reference_id" text,
      "quantity_change" numeric(10, 3) NOT NULL,
      "running_balance" numeric(10, 3) NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  console.log('Created inventory_ledger');

  try {
    await sql.unsafe(`
      DO $$ BEGIN
       ALTER TABLE "recipe_bom" ADD CONSTRAINT "recipe_bom_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;
      EXCEPTION
       WHEN duplicate_object THEN null;
      END $$;
    `);
    await sql.unsafe(`
      DO $$ BEGIN
       ALTER TABLE "recipe_bom" ADD CONSTRAINT "recipe_bom_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE no action ON UPDATE no action;
      EXCEPTION
       WHEN duplicate_object THEN null;
      END $$;
    `);
    await sql.unsafe(`
      DO $$ BEGIN
       ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_inventory_id_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory"("id") ON DELETE no action ON UPDATE no action;
      EXCEPTION
       WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('Added foreign keys');
  } catch (e) {
    console.log('FKs may already exist or error:', e.message);
  }

  console.log('Migration complete');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
