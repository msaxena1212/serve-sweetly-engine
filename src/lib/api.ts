import { createServerFn } from '@tanstack/react-start';
import { db } from './db/db';
import {
  menuItems, categories, tables, orders, orderItems, inventory,
  stations, tableSections, paymentMethods, taxSlabs, systemConfig,
  suppliers, purchaseOrders, shifts, refunds, users
} from './db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getSessionServer } from './auth-rpc';

// ──────────────────────────────────────────────────────────────
// MENU APIS
// ──────────────────────────────────────────────────────────────

export const getMenuFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session) throw new Error('Unauthorized');

  const items = await db.select({
    id: menuItems.id,
    name: menuItems.name,
    price: menuItems.price,
    categoryId: menuItems.categoryId,
    stationId: menuItems.stationId,
    available: menuItems.isAvailable,
  }).from(menuItems);

  const cats = await db.select().from(categories);
  const stns = await db.select().from(stations);

  return items.map(item => ({
    id: item.id.toString(),
    name: item.name,
    price: parseFloat(item.price),
    category: cats.find(c => c.id === item.categoryId)?.name || 'Uncategorized',
    station: stns.find(s => s.id === item.stationId)?.name || 'Kitchen',
    available: item.available,
    stock: 100,
  }));
});

export const addMenuItemFn = createServerFn({ method: 'POST' })
  .validator((data: { name: string; price: number; category: string; station?: string; available: boolean }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    let cat = await db.select().from(categories).where(eq(categories.name, data.category)).limit(1);
    let categoryId = cat[0]?.id;
    if (!categoryId) {
      const newCat = await db.insert(categories).values({ name: data.category }).returning();
      categoryId = newCat[0].id;
    }

    let stationId: number | null = null;
    if (data.station) {
      const stn = await db.select().from(stations).where(eq(stations.name, data.station)).limit(1);
      stationId = stn[0]?.id ?? null;
    }

    const newItem = await db.insert(menuItems).values({
      name: data.name,
      price: data.price.toString(),
      categoryId,
      stationId,
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

// ──────────────────────────────────────────────────────────────
// TABLE APIS
// ──────────────────────────────────────────────────────────────

export const getTablesFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session) throw new Error('Unauthorized');

  const allTables = await db.select().from(tables);
  const secs = await db.select().from(tableSections);

  return allTables.map(t => ({
    id: t.id.toString(),
    name: t.number,
    seats: 4,
    section: secs.find(s => s.id === t.sectionId)?.name || 'Main',
  }));
});

// ──────────────────────────────────────────────────────────────
// ORDER APIS
// ──────────────────────────────────────────────────────────────

export const createOrderFn = createServerFn({ method: 'POST' })
  .validator((data: { type: string; tableId?: string; customerName?: string; taxPct?: number; discountPct?: number }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    const newOrder = await db.insert(orders).values({
      type: data.type,
      tableId: data.tableId ? parseInt(data.tableId) : null,
      status: 'open',
      taxPct: (data.taxPct ?? 0).toString(),
      discountPct: (data.discountPct ?? 0).toString(),
    }).returning();

    return { id: newOrder[0].id.toString() };
  });

export const updateOrderFn = createServerFn({ method: 'POST' })
  .validator((data: { orderId: string; status?: string; total?: string; paymentMethodId?: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    await db.update(orders)
      .set({
        ...(data.status && { status: data.status }),
        ...(data.total && { total: data.total }),
        ...(data.paymentMethodId && { paymentMethodId: parseInt(data.paymentMethodId) }),
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
  const stns = await db.select().from(stations);

  return activeOrders.map(o => {
    const items = allItems.filter(i => i.orderId === o.id).map(i => {
      const menuRef = allMenu.find(m => m.id === i.menuItemId);
      const stn = stns.find(s => s.id === menuRef?.stationId);
      return {
        id: i.id.toString(),
        menuItemId: i.menuItemId.toString(),
        name: menuRef?.name || 'Unknown',
        price: menuRef ? parseFloat(menuRef.price) : 0,
        qty: i.quantity,
        station: stn?.name || 'Kitchen',
        status: i.status as 'new' | 'sent' | 'preparing' | 'ready' | 'served',
        notes: i.notes || undefined,
      };
    });

    return {
      id: o.id.toString(),
      type: o.type as 'dine-in' | 'takeaway',
      tableId: o.tableId?.toString(),
      customerName: undefined,
      items,
      status: o.status as 'open' | 'paid' | 'void',
      createdAt: o.createdAt ? o.createdAt.getTime() : Date.now(),
      discountPct: parseFloat(o.discountPct),
      taxPct: parseFloat(o.taxPct),
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

// ──────────────────────────────────────────────────────────────
// INVENTORY APIS
// ──────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────
// MASTERS — STATIONS
// ──────────────────────────────────────────────────────────────

export const getStationsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session) throw new Error('Unauthorized');
  const rows = await db.select().from(stations);
  return rows.map(r => ({ id: r.id.toString(), name: r.name, active: r.active }));
});

export const upsertStationFn = createServerFn({ method: 'POST' })
  .validator((data: { id?: string; name: string; active: boolean }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    if (data.id) {
      await db.update(stations).set({ name: data.name, active: data.active }).where(eq(stations.id, parseInt(data.id)));
      return { id: data.id };
    } else {
      const row = await db.insert(stations).values({ name: data.name, active: data.active }).returning();
      return { id: row[0].id.toString() };
    }
  });

export const deleteStationFn = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    await db.delete(stations).where(eq(stations.id, parseInt(data.id)));
    return { success: true };
  });

// ──────────────────────────────────────────────────────────────
// MASTERS — TABLE SECTIONS
// ──────────────────────────────────────────────────────────────

export const getTableSectionsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session) throw new Error('Unauthorized');
  const rows = await db.select().from(tableSections);
  return rows.map(r => ({ id: r.id.toString(), name: r.name, prefix: r.prefix, active: r.active }));
});

export const upsertTableSectionFn = createServerFn({ method: 'POST' })
  .validator((data: { id?: string; name: string; prefix: string; active: boolean }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    if (data.id) {
      await db.update(tableSections).set({ name: data.name, prefix: data.prefix, active: data.active }).where(eq(tableSections.id, parseInt(data.id)));
      return { id: data.id };
    } else {
      const row = await db.insert(tableSections).values({ name: data.name, prefix: data.prefix, active: data.active }).returning();
      return { id: row[0].id.toString() };
    }
  });

export const deleteTableSectionFn = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    await db.delete(tableSections).where(eq(tableSections.id, parseInt(data.id)));
    return { success: true };
  });

// ──────────────────────────────────────────────────────────────
// MASTERS — PAYMENT METHODS
// ──────────────────────────────────────────────────────────────

export const getPaymentMethodsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session) throw new Error('Unauthorized');
  const rows = await db.select().from(paymentMethods);
  return rows.map(r => ({ id: r.id.toString(), name: r.name, type: r.type, active: r.active }));
});

export const upsertPaymentMethodFn = createServerFn({ method: 'POST' })
  .validator((data: { id?: string; name: string; type: string; active: boolean }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    if (data.id) {
      await db.update(paymentMethods).set({ name: data.name, type: data.type, active: data.active }).where(eq(paymentMethods.id, parseInt(data.id)));
      return { id: data.id };
    } else {
      const row = await db.insert(paymentMethods).values({ name: data.name, type: data.type, active: data.active }).returning();
      return { id: row[0].id.toString() };
    }
  });

export const deletePaymentMethodFn = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    await db.delete(paymentMethods).where(eq(paymentMethods.id, parseInt(data.id)));
    return { success: true };
  });

// ──────────────────────────────────────────────────────────────
// MASTERS — TAX SLABS
// ──────────────────────────────────────────────────────────────

export const getTaxSlabsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session) throw new Error('Unauthorized');
  const rows = await db.select().from(taxSlabs);
  return rows.map(r => ({ id: r.id.toString(), name: r.name, rate: parseFloat(r.rate), isDefault: r.isDefault, active: r.active }));
});

export const upsertTaxSlabFn = createServerFn({ method: 'POST' })
  .validator((data: { id?: string; name: string; rate: number; isDefault: boolean; active: boolean }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    // If setting this as default, clear all others first
    if (data.isDefault) {
      await db.update(taxSlabs).set({ isDefault: false });
    }

    if (data.id) {
      await db.update(taxSlabs).set({ name: data.name, rate: data.rate.toString(), isDefault: data.isDefault, active: data.active }).where(eq(taxSlabs.id, parseInt(data.id)));
      return { id: data.id };
    } else {
      const row = await db.insert(taxSlabs).values({ name: data.name, rate: data.rate.toString(), isDefault: data.isDefault, active: data.active }).returning();
      return { id: row[0].id.toString() };
    }
  });

export const deleteTaxSlabFn = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    await db.delete(taxSlabs).where(eq(taxSlabs.id, parseInt(data.id)));
    return { success: true };
  });

// ──────────────────────────────────────────────────────────────
// MASTERS — CATEGORIES
// ──────────────────────────────────────────────────────────────

export const getCategoriesFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session) throw new Error('Unauthorized');
  const rows = await db.select().from(categories);
  return rows.map(r => ({ id: r.id.toString(), name: r.name, active: r.active }));
});

export const upsertCategoryFn = createServerFn({ method: 'POST' })
  .validator((data: { id?: string; name: string; active: boolean }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    if (data.id) {
      await db.update(categories).set({ name: data.name, active: data.active }).where(eq(categories.id, parseInt(data.id)));
      return { id: data.id };
    } else {
      const row = await db.insert(categories).values({ name: data.name, active: data.active }).returning();
      return { id: row[0].id.toString() };
    }
  });

export const deleteCategoryFn = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    await db.delete(categories).where(eq(categories.id, parseInt(data.id)));
    return { success: true };
  });

// ──────────────────────────────────────────────────────────────
// MASTERS — SYSTEM CONFIG (key-value store for KDS/billing settings)
// ──────────────────────────────────────────────────────────────

export const getSystemConfigFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session) throw new Error('Unauthorized');
  const rows = await db.select().from(systemConfig);
  return Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]));
});

export const setSystemConfigFn = createServerFn({ method: 'POST' })
  .validator((data: { key: string; value: unknown }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    await db
      .insert(systemConfig)
      .values({ key: data.key, value: JSON.stringify(data.value) })
      .onConflictDoUpdate({ target: systemConfig.key, set: { value: JSON.stringify(data.value) } });

    return { success: true };
  });

// ──────────────────────────────────────────────────────────────
// SHIFTS & REFUNDS
// ──────────────────────────────────────────────────────────────

export const getShiftStatusFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session) throw new Error('Unauthorized');

  const currentShift = await db.select()
    .from(shifts)
    .orderBy(desc(shifts.openedAt))
    .limit(1);

  if (currentShift.length === 0 || currentShift[0].status === 'closed') {
    return { isActive: false, shift: null };
  }
  return { isActive: true, shift: currentShift[0] };
});

export const openShiftFn = createServerFn({ method: 'POST' })
  .validator((data: { openingCash: number }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager', 'cashier'].includes(session.role)) {
      throw new Error('Unauthorized');
    }

    const currentShift = await db.select().from(shifts).orderBy(desc(shifts.openedAt)).limit(1);
    if (currentShift.length > 0 && currentShift[0].status === 'open') {
      throw new Error('A shift is already open.');
    }

    const [newShift] = await db.insert(shifts).values({
      openedBy: session.id,
      openingCash: data.openingCash.toString(),
      status: 'open',
    }).returning();

    return { success: true, shift: newShift };
  });

export const closeShiftFn = createServerFn({ method: 'POST' })
  .validator((data: { closingCash: number, expectedCash: number, variance: number }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager', 'cashier'].includes(session.role)) {
      throw new Error('Unauthorized');
    }

    const currentShift = await db.select().from(shifts).orderBy(desc(shifts.openedAt)).limit(1);
    if (currentShift.length === 0 || currentShift[0].status === 'closed') {
      throw new Error('No active shift to close.');
    }

    if (Math.abs(data.variance) > 100 && session.role !== 'owner' && session.role !== 'manager') {
      throw new Error('Variance too high. Manager approval required.');
    }

    await db.update(shifts).set({
      closedBy: session.id,
      closingCash: data.closingCash.toString(),
      expectedCash: data.expectedCash.toString(),
      variance: data.variance.toString(),
      status: 'closed',
      closedAt: new Date(),
    }).where(eq(shifts.id, currentShift[0].id));

    return { success: true };
  });

export const processRefundFn = createServerFn({ method: 'POST' })
  .validator((data: { orderId: number, amount: number, reason: string, managerPin: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    // Verify Manager PIN
    const managerList = await db.select().from(users).where(eq(users.pin, data.managerPin)).limit(1);
    if (managerList.length === 0 || !['owner', 'manager'].includes(managerList[0].role)) {
      throw new Error('Invalid Manager PIN or insufficient permissions.');
    }
    const manager = managerList[0];

    const orderList = await db.select().from(orders).where(eq(orders.id, data.orderId)).limit(1);
    if (orderList.length === 0) throw new Error('Order not found.');
    const order = orderList[0];

    if (order.status !== 'completed' && order.status !== 'paid') {
      throw new Error('Can only refund completed/paid orders.');
    }

    const totalOrderAmount = parseFloat(order.total);
    if (data.amount > totalOrderAmount) {
      throw new Error('Refund amount cannot exceed total order amount.');
    }

    const existingRefunds = await db.select().from(refunds).where(eq(refunds.orderId, data.orderId));
    const totalRefunded = existingRefunds.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    if (totalRefunded + data.amount > totalOrderAmount) {
      throw new Error('Total refunded amount cannot exceed order total.');
    }

    await db.insert(refunds).values({
      orderId: data.orderId,
      amount: data.amount.toString(),
      reason: data.reason,
      approvedBy: manager.id,
    });

    return { success: true };
  });

// ──────────────────────────────────────────────────────────────
// SUPPLIERS
// ──────────────────────────────────────────────────────────────

export const getSuppliersFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
  const rows = await db.select().from(suppliers).orderBy(suppliers.name);
  return rows.map(s => ({ id: s.id.toString(), name: s.name, contactInfo: s.contactInfo || '' }));
});

export const upsertSupplierFn = createServerFn({ method: 'POST' })
  .validator((data: { id?: string; name: string; contactInfo?: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    if (data.id) {
      await db.update(suppliers).set({ name: data.name, contactInfo: data.contactInfo || '' }).where(eq(suppliers.id, parseInt(data.id)));
      return { id: data.id };
    }
    const [row] = await db.insert(suppliers).values({ name: data.name, contactInfo: data.contactInfo || '' }).returning();
    return { id: row.id.toString() };
  });

export const deleteSupplierFn = createServerFn({ method: 'POST' })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    await db.delete(suppliers).where(eq(suppliers.id, parseInt(data.id)));
    return { success: true };
  });

// ──────────────────────────────────────────────────────────────
// PURCHASE ORDERS
// ──────────────────────────────────────────────────────────────

export const getPurchaseOrdersFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

  const pos = await db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt));
  const sups = await db.select().from(suppliers);

  return pos.map(po => ({
    id: po.id.toString(),
    supplierId: po.supplierId.toString(),
    supplierName: sups.find(s => s.id === po.supplierId)?.name || 'Unknown',
    status: po.status,
    totalAmount: parseFloat(po.totalAmount),
    createdAt: po.createdAt.getTime(),
  }));
});

export const createPurchaseOrderFn = createServerFn({ method: 'POST' })
  .validator((data: { supplierId: string; items: { inventoryId: string; qty: number; unitPrice: number }[] }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    const total = data.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

    const [po] = await db.insert(purchaseOrders).values({
      supplierId: parseInt(data.supplierId),
      status: 'pending',
      totalAmount: total.toString(),
    }).returning();

    return { id: po.id.toString(), total };
  });

export const receivePurchaseOrderFn = createServerFn({ method: 'POST' })
  .validator((data: { poId: string; items: { inventoryId: string; qty: number }[] }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    // Mark PO as received
    await db.update(purchaseOrders).set({ status: 'received' }).where(eq(purchaseOrders.id, parseInt(data.poId)));

    // Increase inventory qty for each item
    for (const item of data.items) {
      const inv = await db.select().from(inventory).where(eq(inventory.id, parseInt(item.inventoryId))).limit(1);
      if (inv.length > 0) {
        const newQty = parseFloat(inv[0].quantity) + item.qty;
        await db.update(inventory).set({ quantity: newQty.toString() }).where(eq(inventory.id, parseInt(item.inventoryId)));
      }
    }

    return { success: true };
  });

// ──────────────────────────────────────────────────────────────
// INVENTORY — PHYSICAL STOCK COUNT
// ──────────────────────────────────────────────────────────────

export const getInventoryItemsFn = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getSessionServer();
  if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

  const rows = await db.select().from(inventory).orderBy(inventory.name);
  return rows.map(r => ({
    id: r.id.toString(),
    name: r.name,
    unit: r.unit,
    quantity: parseFloat(r.quantity),
    minQuantity: parseFloat(r.minQuantity),
  }));
});

export const physicalStockCountFn = createServerFn({ method: 'POST' })
  .validator((data: { counts: { id: string; actualQty: number }[] }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    const results = [];
    for (const item of data.counts) {
      const inv = await db.select().from(inventory).where(eq(inventory.id, parseInt(item.id))).limit(1);
      if (inv.length > 0) {
        const systemQty = parseFloat(inv[0].quantity);
        const variance = item.actualQty - systemQty;
        await db.update(inventory).set({ quantity: item.actualQty.toString() }).where(eq(inventory.id, parseInt(item.id)));
        results.push({ id: item.id, systemQty, actualQty: item.actualQty, variance });
      }
    }

    return { success: true, results };
  });

export const upsertInventoryItemFn = createServerFn({ method: 'POST' })
  .validator((data: { id?: string; name: string; unit: string; minQuantity: number }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    if (data.id) {
      await db.update(inventory).set({ name: data.name, unit: data.unit, minQuantity: data.minQuantity.toString() })
        .where(eq(inventory.id, parseInt(data.id)));
      return { id: data.id };
    }
    const [row] = await db.insert(inventory).values({ name: data.name, unit: data.unit, minQuantity: data.minQuantity.toString() }).returning();
    return { id: row.id.toString() };
  });
