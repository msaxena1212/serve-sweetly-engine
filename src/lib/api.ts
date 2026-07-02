import { createServerFn } from '@tanstack/react-start';
import { db } from './db/db';
import { menuItems, categories, tables, orders, orderItems, inventory } from './db/schema';
import { eq } from 'drizzle-orm';
import { getSessionServer } from './auth-rpc';

export const getMenuFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session) throw new Error('Unauthorized');

  const items = await db.select({
    id: menuItems.id,
    name: menuItems.name,
    price: menuItems.price,
    categoryId: menuItems.categoryId,
    available: menuItems.isAvailable,
  }).from(menuItems);

  const cats = await db.select().from(categories);

  return items.map(item => ({
    id: item.id.toString(),
    name: item.name,
    price: parseFloat(item.price),
    category: cats.find(c => c.id === item.categoryId)?.name || 'Uncategorized',
    station: 'Kitchen', // Default to kitchen for now
    available: item.available,
    stock: 100, // Dummy stock for now until inventory is linked
  }));
});

export const getTablesFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session) throw new Error('Unauthorized');

  const allTables = await db.select().from(tables);
  return allTables.map(t => ({
    id: t.id.toString(),
    name: t.number,
    seats: 4,
    section: 'Main' as const,
  }));
});

export const addMenuItemFn = createServerFn({ method: 'POST' })
  .validator((data: { name: string; price: number; category: string; available: boolean }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    let cat = await db.select().from(categories).where(eq(categories.name, data.category)).limit(1);
    let categoryId = cat[0]?.id;

    if (!categoryId) {
      const newCat = await db.insert(categories).values({ name: data.category }).returning();
      categoryId = newCat[0].id;
    }

    const newItem = await db.insert(menuItems).values({
      name: data.name,
      price: data.price.toString(),
      categoryId: categoryId,
      isAvailable: data.available,
    }).returning();

    return { id: newItem[0].id.toString() };
  });

export const deleteMenuItemFn = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    await db.delete(menuItems).where(eq(menuItems.id, parseInt(data.id)));
    return { success: true };
  });

export const createOrderFn = createServerFn({ method: 'POST' })
  .validator((data: { type: string; tableId?: string; customerName?: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    const newOrder = await db.insert(orders).values({
      type: data.type,
      tableId: data.tableId ? parseInt(data.tableId) : null,
      status: 'open',
    }).returning();

    return { id: newOrder[0].id.toString() };
  });

export const updateOrderFn = createServerFn({ method: 'POST' })
  .validator((data: { orderId: string; status?: string; total?: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    await db.update(orders)
      .set({ 
        ...(data.status && { status: data.status }),
        ...(data.total && { total: data.total })
      })
      .where(eq(orders.id, parseInt(data.orderId)));
      
    return { success: true };
  });

export const addOrderItemFn = createServerFn({ method: 'POST' })
  .validator((data: { orderId: string; menuItemId: string; quantity: number; notes?: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    const newItem = await db.insert(orderItems).values({
      orderId: parseInt(data.orderId),
      menuItemId: parseInt(data.menuItemId),
      quantity: data.quantity,
      notes: data.notes,
      status: 'pending',
    }).returning();

    return { id: newItem[0].id.toString() };
  });

export const getActiveOrdersFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session) throw new Error('Unauthorized');

  const activeOrders = await db.select().from(orders).where(eq(orders.status, 'open'));
  const allItems = await db.select().from(orderItems);
  const allMenu = await db.select().from(menuItems);

  return activeOrders.map(o => {
    const items = allItems.filter(i => i.orderId === o.id).map(i => {
      const menuRef = allMenu.find(m => m.id === i.menuItemId);
      return {
        id: i.id.toString(),
        menuItemId: i.menuItemId.toString(),
        name: menuRef?.name || 'Unknown',
        price: menuRef ? parseFloat(menuRef.price) : 0,
        qty: i.quantity,
        station: 'Kitchen' as const, // Dummy station mapping
        status: i.status as 'new' | 'sent' | 'preparing' | 'ready' | 'served',
        notes: i.notes || undefined,
      };
    });

    return {
      id: o.id.toString(),
      type: o.type as 'dine-in' | 'takeaway',
      tableId: o.tableId?.toString(),
      customerName: undefined,
      items: items,
      status: o.status as 'open' | 'paid' | 'void',
      createdAt: o.createdAt ? o.createdAt.getTime() : Date.now(),
      discountPct: 0,
      taxPct: 8,
    };
  });
});

export const updateOrderItemStatusFn = createServerFn({ method: 'POST' })
  .validator((data: { itemId: string; status: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    await db.update(orderItems)
      .set({ status: data.status })
      .where(eq(orderItems.id, parseInt(data.itemId)));
      
    return { success: true };
  });

export const transferTableFn = createServerFn({ method: 'POST' })
  .validator((data: { orderId: string; newTableId: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');
    
    await db.update(orders)
      .set({ tableId: parseInt(data.newTableId) })
      .where(eq(orders.id, parseInt(data.orderId)));
      
    return { success: true };
  });

export const mergeTablesFn = createServerFn({ method: 'POST' })
  .validator((data: { sourceOrderId: string; targetOrderId: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');
    
    await db.update(orderItems)
      .set({ orderId: parseInt(data.targetOrderId) })
      .where(eq(orderItems.orderId, parseInt(data.sourceOrderId)));
      
    await db.update(orders)
      .set({ status: 'void' })
      .where(eq(orders.id, parseInt(data.sourceOrderId)));
      
    return { success: true };
  });

// --- INVENTORY API ---

export const getInventoryFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
  
  const items = await db.select().from(inventory);
  return items.map(i => ({
    id: i.id.toString(),
    name: i.name,
    unit: i.unit,
    quantity: parseFloat(i.quantity),
    minQuantity: parseFloat(i.minQuantity),
    status: parseFloat(i.quantity) <= parseFloat(i.minQuantity) ? 'low' : 'ok',
  }));
});

export const addInventoryItemFn = createServerFn({ method: 'POST' })
  .validator((data: { name: string; unit: string; quantity: number; minQuantity: number }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    const newItem = await db.insert(inventory).values({
      name: data.name,
      unit: data.unit,
      quantity: data.quantity.toString(),
      minQuantity: data.minQuantity.toString(),
    }).returning();

    return { id: newItem[0].id.toString() };
  });

export const updateInventoryItemFn = createServerFn({ method: 'POST' })
  .validator((data: { id: string; quantity?: number; minQuantity?: number }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    await db.update(inventory)
      .set({
        ...(data.quantity !== undefined && { quantity: data.quantity.toString() }),
        ...(data.minQuantity !== undefined && { minQuantity: data.minQuantity.toString() }),
      })
      .where(eq(inventory.id, parseInt(data.id)));
      
    return { success: true };
  });

export const deleteInventoryItemFn = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    
    await db.delete(inventory).where(eq(inventory.id, parseInt(data.id)));
    return { success: true };
  });
