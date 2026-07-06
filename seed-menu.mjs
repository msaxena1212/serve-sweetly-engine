/**
 * seed-menu.mjs
 * Seeds the database with a full restaurant menu:
 * - 5 kitchen stations
 * - 8 categories
 * - 50 menu items across Indian and Continental cuisine
 * - Inventory items for raw ingredients
 * Run: node seed-menu.mjs
 */
import postgres from 'postgres';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_pos';
const sql = postgres(connectionString, { max: 1 });

const STATIONS = [
  { name: 'Kitchen' },
  { name: 'Tandoor' },
  { name: 'Bar' },
  { name: 'Live Counter' },
  { name: 'Bakery' },
];

const CATEGORIES = [
  'Starters',
  'Soups & Salads',
  'Mains - Indian',
  'Mains - Continental',
  'Breads',
  'Biryani & Rice',
  'Desserts',
  'Beverages',
];

const MENU_ITEMS = [
  // ── Starters ──────────────────────────────────────────────
  { name: 'Paneer Tikka', price: 280, category: 'Starters', station: 'Tandoor' },
  { name: 'Chicken Tikka', price: 320, category: 'Starters', station: 'Tandoor' },
  { name: 'Seekh Kebab', price: 350, category: 'Starters', station: 'Tandoor' },
  { name: 'Hara Bhara Kebab', price: 240, category: 'Starters', station: 'Kitchen' },
  { name: 'Crispy Calamari', price: 380, category: 'Starters', station: 'Kitchen' },
  { name: 'Bruschetta', price: 220, category: 'Starters', station: 'Kitchen' },
  { name: 'Spring Rolls (V)', price: 180, category: 'Starters', station: 'Kitchen' },
  { name: 'Chicken Wings', price: 360, category: 'Starters', station: 'Kitchen' },
  { name: 'Nachos with Salsa', price: 240, category: 'Starters', station: 'Kitchen' },
  { name: 'Stuffed Mushrooms', price: 260, category: 'Starters', station: 'Kitchen' },

  // ── Soups & Salads ─────────────────────────────────────────
  { name: 'Tomato Basil Soup', price: 160, category: 'Soups & Salads', station: 'Kitchen' },
  { name: 'Sweet Corn Soup', price: 150, category: 'Soups & Salads', station: 'Kitchen' },
  { name: 'Caesar Salad', price: 280, category: 'Soups & Salads', station: 'Kitchen' },
  { name: 'Greek Salad', price: 260, category: 'Soups & Salads', station: 'Kitchen' },
  { name: 'Mulligatawny Soup', price: 180, category: 'Soups & Salads', station: 'Kitchen' },

  // ── Mains — Indian ─────────────────────────────────────────
  { name: 'Butter Chicken', price: 380, category: 'Mains - Indian', station: 'Kitchen' },
  { name: 'Palak Paneer', price: 320, category: 'Mains - Indian', station: 'Kitchen' },
  { name: 'Dal Makhani', price: 280, category: 'Mains - Indian', station: 'Kitchen' },
  { name: 'Rogan Josh', price: 420, category: 'Mains - Indian', station: 'Kitchen' },
  { name: 'Chana Masala', price: 260, category: 'Mains - Indian', station: 'Kitchen' },
  { name: 'Mutton Korma', price: 480, category: 'Mains - Indian', station: 'Kitchen' },
  { name: 'Kadai Paneer', price: 340, category: 'Mains - Indian', station: 'Kitchen' },
  { name: 'Fish Curry (Goan)', price: 440, category: 'Mains - Indian', station: 'Kitchen' },
  { name: 'Egg Masala', price: 220, category: 'Mains - Indian', station: 'Kitchen' },
  { name: 'Aloo Gobi', price: 220, category: 'Mains - Indian', station: 'Kitchen' },

  // ── Mains — Continental ────────────────────────────────────
  { name: 'Margherita Pizza', price: 360, category: 'Mains - Continental', station: 'Bakery' },
  { name: 'BBQ Chicken Pizza', price: 420, category: 'Mains - Continental', station: 'Bakery' },
  { name: 'Truffle Pasta (V)', price: 380, category: 'Mains - Continental', station: 'Kitchen' },
  { name: 'Penne Arrabiata', price: 320, category: 'Mains - Continental', station: 'Kitchen' },
  { name: 'Grilled Salmon', price: 580, category: 'Mains - Continental', station: 'Kitchen' },
  { name: 'Beef Tenderloin', price: 680, category: 'Mains - Continental', station: 'Kitchen' },
  { name: 'Veggie Burger', price: 280, category: 'Mains - Continental', station: 'Kitchen' },
  { name: 'Club Sandwich', price: 320, category: 'Mains - Continental', station: 'Kitchen' },

  // ── Breads ─────────────────────────────────────────────────
  { name: 'Butter Naan', price: 60, category: 'Breads', station: 'Tandoor' },
  { name: 'Garlic Naan', price: 80, category: 'Breads', station: 'Tandoor' },
  { name: 'Tandoori Roti', price: 40, category: 'Breads', station: 'Tandoor' },
  { name: 'Paratha (Plain)', price: 60, category: 'Breads', station: 'Tandoor' },
  { name: 'Lachha Paratha', price: 80, category: 'Breads', station: 'Tandoor' },
  { name: 'Garlic Bread', price: 120, category: 'Breads', station: 'Bakery' },

  // ── Biryani & Rice ─────────────────────────────────────────
  { name: 'Chicken Biryani', price: 380, category: 'Biryani & Rice', station: 'Kitchen' },
  { name: 'Mutton Biryani', price: 450, category: 'Biryani & Rice', station: 'Kitchen' },
  { name: 'Veg Biryani', price: 280, category: 'Biryani & Rice', station: 'Kitchen' },
  { name: 'Egg Fried Rice', price: 220, category: 'Biryani & Rice', station: 'Kitchen' },
  { name: 'Jeera Rice', price: 150, category: 'Biryani & Rice', station: 'Kitchen' },

  // ── Desserts ───────────────────────────────────────────────
  { name: 'Gulab Jamun', price: 120, category: 'Desserts', station: 'Kitchen' },
  { name: 'Tiramisu', price: 220, category: 'Desserts', station: 'Bakery' },
  { name: 'Chocolate Lava Cake', price: 240, category: 'Desserts', station: 'Bakery' },
  { name: 'Mango Kulfi', price: 140, category: 'Desserts', station: 'Live Counter' },
  { name: 'Cheesecake', price: 200, category: 'Desserts', station: 'Bakery' },

  // ── Beverages ──────────────────────────────────────────────
  { name: 'Fresh Lime Soda', price: 80, category: 'Beverages', station: 'Bar' },
  { name: 'Mango Lassi', price: 120, category: 'Beverages', station: 'Bar' },
  { name: 'Masala Chai', price: 60, category: 'Beverages', station: 'Live Counter' },
  { name: 'Cold Coffee', price: 140, category: 'Beverages', station: 'Bar' },
  { name: 'House Red Wine (Gl)', price: 380, category: 'Beverages', station: 'Bar' },
  { name: 'Craft Lager', price: 220, category: 'Beverages', station: 'Bar' },
  { name: 'Espresso', price: 100, category: 'Beverages', station: 'Bar' },
  { name: 'Mineral Water', price: 40, category: 'Beverages', station: 'Bar' },
  { name: 'Pepsi / Coke', price: 60, category: 'Beverages', station: 'Bar' },
  { name: 'Fresh Orange Juice', price: 160, category: 'Beverages', station: 'Bar' },
];

const INVENTORY_ITEMS = [
  { name: 'Chicken (whole)', unit: 'kg', minQuantity: 10 },
  { name: 'Mutton', unit: 'kg', minQuantity: 5 },
  { name: 'Fish (Salmon)', unit: 'kg', minQuantity: 5 },
  { name: 'Paneer', unit: 'kg', minQuantity: 8 },
  { name: 'Onions', unit: 'kg', minQuantity: 20 },
  { name: 'Tomatoes', unit: 'kg', minQuantity: 20 },
  { name: 'Refined Oil', unit: 'liter', minQuantity: 10 },
  { name: 'Basmati Rice', unit: 'kg', minQuantity: 15 },
  { name: 'Wheat Flour', unit: 'kg', minQuantity: 20 },
  { name: 'Milk', unit: 'liter', minQuantity: 10 },
  { name: 'Butter', unit: 'kg', minQuantity: 5 },
  { name: 'Cream', unit: 'liter', minQuantity: 5 },
  { name: 'Eggs', unit: 'piece', minQuantity: 50 },
  { name: 'Garlic', unit: 'kg', minQuantity: 5 },
  { name: 'Ginger', unit: 'kg', minQuantity: 5 },
  { name: 'Pasta (Penne)', unit: 'kg', minQuantity: 5 },
  { name: 'Pizza Dough', unit: 'kg', minQuantity: 10 },
  { name: 'Mozzarella Cheese', unit: 'kg', minQuantity: 5 },
  { name: 'Beer (Lager)', unit: 'bottle', minQuantity: 24 },
  { name: 'Wine (Red)', unit: 'bottle', minQuantity: 12 },
];

async function seed() {
  console.log('🌱 Seeding full restaurant menu...\n');

  try {
    // ── 1. Stations ───────────────────────────────────────────
    console.log('Creating stations...');
    const stationMap = {};
    for (const s of STATIONS) {
      const existing = await sql`SELECT id FROM stations WHERE name = ${s.name} LIMIT 1`;
      if (existing.length > 0) {
        stationMap[s.name] = existing[0].id;
      } else {
        const [row] = await sql`INSERT INTO stations (name) VALUES (${s.name}) RETURNING id`;
        stationMap[s.name] = row.id;
      }
      console.log(`  ✓ Station: ${s.name} (id=${stationMap[s.name]})`);
    }

    // ── 2. Categories ─────────────────────────────────────────
    console.log('\nCreating categories...');
    const categoryMap = {};
    for (const c of CATEGORIES) {
      const existing = await sql`SELECT id FROM categories WHERE name = ${c} LIMIT 1`;
      if (existing.length > 0) {
        categoryMap[c] = existing[0].id;
      } else {
        const [row] = await sql`INSERT INTO categories (name) VALUES (${c}) RETURNING id`;
        categoryMap[c] = row.id;
      }
      console.log(`  ✓ Category: ${c} (id=${categoryMap[c]})`);
    }

    // ── 3. Menu Items ─────────────────────────────────────────
    console.log('\nCreating menu items...');
    let created = 0, skipped = 0;
    for (const item of MENU_ITEMS) {
      const catId = categoryMap[item.category];
      const stnId = stationMap[item.station];
      if (!catId || !stnId) {
        console.warn(`  ⚠ Skipping ${item.name} — missing category or station`);
        continue;
      }

      const existing = await sql`SELECT id FROM menu_items WHERE name = ${item.name} LIMIT 1`;
      if (existing.length > 0) {
        // Update price
        await sql`UPDATE menu_items SET price = ${item.price}, category_id = ${catId}, station_id = ${stnId} WHERE id = ${existing[0].id}`;
        skipped++;
      } else {
        await sql`INSERT INTO menu_items (name, price, category_id, station_id, is_available) VALUES (${item.name}, ${item.price}, ${catId}, ${stnId}, true)`;
        created++;
      }
    }
    console.log(`  ✓ ${created} created, ${skipped} updated`);

    // ── 4. Inventory ─────────────────────────────────────────
    console.log('\nCreating inventory items...');
    let invCreated = 0;
    for (const inv of INVENTORY_ITEMS) {
      const existing = await sql`SELECT id FROM inventory WHERE name = ${inv.name} LIMIT 1`;
      if (existing.length === 0) {
        await sql`INSERT INTO inventory (name, unit, quantity, min_quantity) VALUES (${inv.name}, ${inv.unit}, 50, ${inv.minQuantity})`;
        invCreated++;
      }
    }
    console.log(`  ✓ ${invCreated} inventory items created`);

    // ── 5. Show summary ────────────────────────────────────────
    const [menuCount] = await sql`SELECT COUNT(*) as count FROM menu_items WHERE is_available = true`;
    const [catCount] = await sql`SELECT COUNT(*) as count FROM categories`;
    console.log(`\n✅ Done!`);
    console.log(`   Menu Items: ${menuCount.count}`);
    console.log(`   Categories: ${catCount.count}`);

  } catch (error) {
    console.error('❌ Seed failed:', error);
  } finally {
    process.exit(0);
  }
}

seed();
