import { db } from './db/db';
import { menuItems, categories } from './db/schema';
import { eq } from 'drizzle-orm';

export async function getPublicMenuServer() {
  const items = await db.select({
    id: menuItems.id,
    name: menuItems.name,
    price: menuItems.price,
    categoryId: menuItems.categoryId,
    stationId: menuItems.stationId,
    available: menuItems.isAvailable,
  }).from(menuItems).where(eq(menuItems.isAvailable, true));

  const cats = await db.select().from(categories).where(eq(categories.active, true));

  return {
    items: items.map((item) => ({
      id: item.id.toString(),
      name: item.name,
      price: parseFloat(item.price),
      category: cats.find((c) => c.id === item.categoryId)?.name || 'General',
      available: item.available,
    })),
    categories: cats.map((c) => c.name),
  };
}

