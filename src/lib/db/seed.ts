import { db } from './db';
import { users, categories, menuItems, tables, inventory } from './schema';

async function main() {
  console.log('Seeding database...');
  
  // Seed Users
  await db.insert(users).values([
    { name: 'Admin Owner', pin: '1010', role: 'owner' },
    { name: 'Manager John', pin: '1010', role: 'manager' },
    { name: 'Cashier Jane', pin: '1010', role: 'cashier' },
    { name: 'Waiter Bob', pin: '1010', role: 'waiter' },
    { name: 'Chef Mike', pin: '1010', role: 'kitchen' },
  ]);

  // Seed Categories
  const insertedCategories = await db.insert(categories).values([
    { name: 'Main Course' },
    { name: 'Appetizers' },
    { name: 'Beverages' },
  ]).returning({ id: categories.id });

  // Seed Menu Items
  await db.insert(menuItems).values([
    { name: 'Burger', price: '12.99', categoryId: insertedCategories[0].id },
    { name: 'Fries', price: '4.99', categoryId: insertedCategories[1].id },
    { name: 'Cola', price: '1.99', categoryId: insertedCategories[2].id },
  ]);

  // Seed Tables
  await db.insert(tables).values([
    { number: 'T1' },
    { number: 'T2' },
    { number: 'T3' },
    { number: 'T4' },
    { number: 'T5' },
  ]);

  // Seed Inventory
  await db.insert(inventory).values([
    { name: 'Beef Patties', unit: 'piece', quantity: '100.000', minQuantity: '20.000' },
    { name: 'Burger Buns', unit: 'piece', quantity: '200.000', minQuantity: '50.000' },
    { name: 'Potatoes', unit: 'kg', quantity: '50.000', minQuantity: '10.000' },
  ]);

  console.log('Database seeded successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error seeding database:', err);
  process.exit(1);
});
