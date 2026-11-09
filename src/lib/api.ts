import { createServerFn } from '@tanstack/react-start';
import { db } from './db/db';
import {
  menuItems, categories, tables, orders, orderItems, inventory,
  stations, tableSections, paymentMethods, taxSlabs, systemConfig,
  suppliers, purchaseOrders, purchaseOrderItems, shifts, refunds, users,
  recipeBom, inventoryLedger, reservations, customers
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

    const stationName = data.station ?? 'Kitchen';
    return {
      id: newItem[0].id.toString(),
      name: data.name,
      price: data.price,
      category: data.category,
      station: stationName,
      available: data.available,
      stock: 100,
    };
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

export const getTablesFn = createServerFn({ method: 'GET' })
  .validator((data: { branchId?: string } | void) => data || {})
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    let allTables;
    let secs;

    if (data.branchId) {
      allTables = await db.select().from(tables).where(eq(tables.branchId, data.branchId));
      secs = await db.select().from(tableSections).where(eq(tableSections.branchId, data.branchId));
    } else {
      allTables = await db.select().from(tables);
      secs = await db.select().from(tableSections);
    }

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
  .validator((data: { type: string; tableId?: string; customerName?: string; customerPhone?: string; taxPct?: number; discountPct?: number; branchId?: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    const customerId = await (await import('./customers.server')).resolveCustomer(data.customerName, data.customerPhone, data.branchId);
    const newOrder = await db.insert(orders).values({
      type: data.type,
      customerName: data.customerName,
      customerId,
      customerPhone: data.customerPhone?.trim() || null,
      branchId: data.branchId,
      tableId: data.tableId || null,
      status: 'open',
      taxPct: (data.taxPct ?? 0).toString(),
      discountPct: (data.discountPct ?? 0).toString(),
    }).returning();

    return { id: newOrder[0].id.toString() };
  });

export const updateOrderFn = createServerFn({ method: 'POST' })
  .validator((data: { orderId: string; status?: string; total?: string; paymentMethodId?: string; tableId?: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    const orderId = parseInt(data.orderId);

    // If order is transitioning to paid/completed, deduct inventory
    if (data.status === 'completed' || data.status === 'paid') {
      const orderList = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (orderList.length > 0 && orderList[0].status !== 'completed' && orderList[0].status !== 'paid') {
        const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        for (const item of items) {
          const bom = await db.select().from(recipeBom).where(eq(recipeBom.menuItemId, item.menuItemId));
          for (const b of bom) {
            const consumed = parseFloat(b.quantity) * item.quantity;
            const inv = await db.select().from(inventory).where(eq(inventory.id, b.inventoryId)).limit(1);
            if (inv.length > 0) {
              const newQty = parseFloat(inv[0].quantity) - consumed;
              await db.update(inventory).set({ quantity: newQty.toString() }).where(eq(inventory.id, b.inventoryId));
              
              await db.insert(inventoryLedger).values({
                inventoryId: b.inventoryId,
                transactionType: 'SALE_CONSUMPTION',
                referenceId: orderId.toString(),
                quantityChange: (-consumed).toString(),
                runningBalance: newQty.toString(),
              });
            }
          }
        }
      }
    }

    await db.update(orders)
      .set({
        ...(data.status && { status: data.status }),
        ...(data.total && { total: data.total }),
        ...(data.paymentMethodId && { paymentMethodId: parseInt(data.paymentMethodId) }),
        ...(data.tableId && { tableId: data.tableId }),
      })
      .where(eq(orders.id, orderId));

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
      status: 'sent',
    }).returning();

    return { id: newItem[0].id.toString() };
  });

export const getActiveOrdersFn = createServerFn({ method: 'GET' })
  .validator((data: { branchId?: string } | void) => data || {})
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    let query = db.select().from(orders).where(eq(orders.status, 'open'));
    const activeOrders = await query;
    // In memory filter for simplicity if branchId exists
    const filteredOrders = data.branchId ? activeOrders.filter(o => o.branchId === data.branchId) : activeOrders;

  const allItems = await db.select().from(orderItems);
  const allMenu = await db.select().from(menuItems);
  const stns = await db.select().from(stations);

  return filteredOrders.map(o => {
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
      customerName: o.customerName || undefined,
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
      .set({ tableId: data.newTableId })
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
// INVENTORY & BOM APIS
// ──────────────────────────────────────────────────────────────

export const getRecipeBomFn = createServerFn({ method: 'GET' })
  .validator((data: { menuItemId: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    const bom = await db.select({
      id: recipeBom.id,
      inventoryId: recipeBom.inventoryId,
      quantity: recipeBom.quantity,
      name: inventory.name,
      unit: inventory.unit,
    }).from(recipeBom)
      .leftJoin(inventory, eq(inventory.id, recipeBom.inventoryId))
      .where(eq(recipeBom.menuItemId, parseInt(data.menuItemId)));

    return bom.map(b => ({
      id: b.id.toString(),
      inventoryId: b.inventoryId.toString(),
      name: b.name || 'Unknown',
      unit: b.unit || '',
      quantity: parseFloat(b.quantity),
    }));
  });

export const upsertRecipeBomFn = createServerFn({ method: 'POST' })
  .validator((data: { menuItemId: string; items: { inventoryId: string; quantity: number }[] }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    const menuItemId = parseInt(data.menuItemId);
    await db.delete(recipeBom).where(eq(recipeBom.menuItemId, menuItemId));

    if (data.items.length > 0) {
      await db.insert(recipeBom).values(
        data.items.map(i => ({
          menuItemId,
          inventoryId: parseInt(i.inventoryId),
          quantity: i.quantity.toString(),
        }))
      );
    }

    return { success: true };
  });

export const getInventoryLedgerFn = createServerFn({ method: 'GET' })
  .validator((data: { inventoryId: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    const ledger = await db.select().from(inventoryLedger)
      .where(eq(inventoryLedger.inventoryId, parseInt(data.inventoryId)))
      .orderBy(desc(inventoryLedger.createdAt))
      .limit(100);

    return ledger.map(l => ({
      id: l.id.toString(),
      transactionType: l.transactionType,
      referenceId: l.referenceId,
      quantityChange: parseFloat(l.quantityChange),
      runningBalance: parseFloat(l.runningBalance),
      createdAt: l.createdAt.getTime(),
    }));
  });

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

export const getShiftStatusFn = createServerFn({ method: 'GET' })
  .validator((data: { branchId?: string } | void) => data || {})
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');
    if (!data.branchId) throw new Error('branchId is required');

    const currentShift = await db.select()
      .from(shifts)
      .where(eq(shifts.branchId, data.branchId))
      .orderBy(desc(shifts.openedAt))
      .limit(1);

    if (currentShift.length === 0 || currentShift[0].status === 'closed') {
      return { isActive: false, shift: null };
    }
    return { isActive: true, shift: currentShift[0] };
  });

export const openShiftFn = createServerFn({ method: 'POST' })
  .validator((data: { openingCash: number; branchId: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager', 'cashier'].includes(session.role)) {
      throw new Error('Unauthorized');
    }

    const currentShift = await db.select().from(shifts).where(eq(shifts.branchId, data.branchId)).orderBy(desc(shifts.openedAt)).limit(1);
    if (currentShift.length > 0 && currentShift[0].status === 'open') {
      throw new Error('A shift is already open for this branch.');
    }

    const [newShift] = await db.insert(shifts).values({
      openedBy: session.id,
      branchId: data.branchId,
      openingCash: data.openingCash.toString(),
      status: 'open',
    }).returning();

    return { success: true, shift: newShift };
  });

export const closeShiftFn = createServerFn({ method: 'POST' })
  .validator((data: { closingCash: number, expectedCash: number, variance: number, branchId: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager', 'cashier'].includes(session.role)) {
      throw new Error('Unauthorized');
    }

    const currentShift = await db.select().from(shifts).where(eq(shifts.branchId, data.branchId)).orderBy(desc(shifts.openedAt)).limit(1);
    if (currentShift.length === 0 || currentShift[0].status === 'closed') {
      throw new Error('No active shift to close for this branch.');
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

export const getPurchaseOrdersFn = createServerFn({ method: 'GET' })
  .validator((data: { branchId?: string } | void) => data || {})
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    const posQuery = data.branchId
      ? db.select({ id: purchaseOrders.id, supplierId: purchaseOrders.supplierId, invoiceNumber: purchaseOrders.invoiceNumber, status: purchaseOrders.status, totalAmount: purchaseOrders.totalAmount, createdAt: purchaseOrders.createdAt }).from(purchaseOrders).where(eq(purchaseOrders.branchId, data.branchId)).orderBy(desc(purchaseOrders.createdAt))
      : db.select({ id: purchaseOrders.id, supplierId: purchaseOrders.supplierId, invoiceNumber: purchaseOrders.invoiceNumber, status: purchaseOrders.status, totalAmount: purchaseOrders.totalAmount, createdAt: purchaseOrders.createdAt }).from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt));

    const pos = await posQuery;

  const sups = await db.select().from(suppliers);

  const items = await db.select({
    purchaseOrderId: purchaseOrderItems.purchaseOrderId,
    inventoryId: purchaseOrderItems.inventoryId,
    qty: purchaseOrderItems.quantity,
    unitPrice: purchaseOrderItems.unitPrice,
    expiryDate: purchaseOrderItems.expiryDate,
    name: inventory.name,
    unit: inventory.unit,
  }).from(purchaseOrderItems).leftJoin(inventory, eq(inventory.id, purchaseOrderItems.inventoryId));

  const itemsByOrder = items.reduce<Record<string, Array<{ inventoryId: string; name: string; qty: number; unitPrice: number; unit: string; expiryDate: number | null }>>>((acc, item) => {
    const key = item.purchaseOrderId.toString();
    const entry = {
      inventoryId: item.inventoryId.toString(),
      name: item.name || 'Unknown',
      qty: parseFloat(item.qty),
      unitPrice: parseFloat(item.unitPrice),
      unit: item.unit || '',
      expiryDate: item.expiryDate?.getTime() ?? null,
    };
    acc[key] = acc[key] ? [...acc[key], entry] : [entry];
    return acc;
  }, {});

  return pos.map(po => ({
    id: po.id.toString(),
    supplierId: po.supplierId.toString(),
    invoiceNumber: po.invoiceNumber || `PO-${po.id}`,
    supplierName: sups.find(s => s.id === po.supplierId)?.name || 'Unknown',
    status: po.status,
    totalAmount: parseFloat(po.totalAmount),
    createdAt: po.createdAt.getTime(),
    items: itemsByOrder[po.id.toString()] || [],
  }));
});

export const createPurchaseOrderFn = createServerFn({ method: 'POST' })
  .validator((data: { supplierId: string; branchId: string; invoiceNumber?: string; items: { inventoryId: string; qty: number; unitPrice: number; expiryDate?: string }[] }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    if (!data.items.length) throw new Error('At least one purchase order item is required.');

    const total = data.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

    const result = await db.transaction(async (tx) => {
      const [po] = await tx.insert(purchaseOrders).values({
        supplierId: parseInt(data.supplierId),
        branchId: data.branchId,
        invoiceNumber: data.invoiceNumber?.trim() || null,
        status: 'pending',
        totalAmount: total.toString(),
      }).returning();

      await tx.insert(purchaseOrderItems).values(
        data.items.map((item) => ({
          purchaseOrderId: po.id,
          inventoryId: parseInt(item.inventoryId),
          quantity: item.qty.toString(),
          unitPrice: item.unitPrice.toString(),
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
        }))
      );

      return { id: po.id.toString(), total };
    });

    return result;
  });

export const receivePurchaseOrderFn = createServerFn({ method: 'POST' })
  .validator((data: { poId: string; items: { inventoryId: string; qty: number }[] }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    const poId = parseInt(data.poId);

    const orderItems = data.items.length
      ? data.items
      : await db.select({ inventoryId: purchaseOrderItems.inventoryId, qty: purchaseOrderItems.quantity })
          .from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.purchaseOrderId, poId));

    await db.update(purchaseOrders).set({ status: 'received' }).where(eq(purchaseOrders.id, poId));

    for (const item of orderItems) {
      const invId = parseInt(item.inventoryId.toString());
      const inv = await db.select().from(inventory).where(eq(inventory.id, invId)).limit(1);
      if (inv.length > 0) {
        const qty = typeof item.qty === 'string' ? parseFloat(item.qty) : item.qty;
        const newQty = parseFloat(inv[0].quantity) + qty;
        await db.update(inventory).set({ quantity: newQty.toString() }).where(eq(inventory.id, inv[0].id));
        
        await db.insert(inventoryLedger).values({
          inventoryId: invId,
          transactionType: 'PURCHASE',
          referenceId: poId.toString(),
          quantityChange: qty.toString(),
          runningBalance: newQty.toString(),
        });
      }
    }

    return { success: true };
  });

// ──────────────────────────────────────────────────────────────
// REPORTING — PURCHASES & EXPIRY
// ──────────────────────────────────────────────────────────────

type PurchaseReportFilters = { from?: string; to?: string; supplierId?: string; inventoryId?: string; branchId?: string };

async function purchaseReportRows(filters: PurchaseReportFilters) {
  const orders = filters.branchId
    ? await db.select().from(purchaseOrders).where(eq(purchaseOrders.branchId, filters.branchId))
    : await db.select().from(purchaseOrders);
  const supplierRows = await db.select().from(suppliers);
  const itemRows = await db.select({
    purchaseOrderId: purchaseOrderItems.purchaseOrderId,
    inventoryId: purchaseOrderItems.inventoryId,
    quantity: purchaseOrderItems.quantity,
    unitPrice: purchaseOrderItems.unitPrice,
    expiryDate: purchaseOrderItems.expiryDate,
    productName: inventory.name,
  }).from(purchaseOrderItems).leftJoin(inventory, eq(inventory.id, purchaseOrderItems.inventoryId));
  const from = filters.from ? new Date(`${filters.from}T00:00:00`) : undefined;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`) : undefined;

  return orders.filter(order => {
    const supplierMatches = !filters.supplierId || order.supplierId.toString() === filters.supplierId;
    const dateMatches = (!from || order.createdAt >= from) && (!to || order.createdAt <= to);
    return supplierMatches && dateMatches;
  }).flatMap(order => itemRows.filter(item => item.purchaseOrderId === order.id && (!filters.inventoryId || item.inventoryId.toString() === filters.inventoryId)).map(item => {
    const quantity = parseFloat(item.quantity);
    const unitPrice = parseFloat(item.unitPrice);
    return {
      id: `${order.id}-${item.inventoryId}`,
      invoiceNumber: order.invoiceNumber || `PO-${order.id}`,
      status: order.status,
      supplierId: order.supplierId.toString(),
      supplierName: supplierRows.find(s => s.id === order.supplierId)?.name || 'Unknown',
      inventoryId: item.inventoryId.toString(),
      productName: item.productName || 'Unknown',
      quantity,
      unitPrice,
      total: quantity * unitPrice,
      purchaseDate: order.createdAt.getTime(),
      expiryDate: item.expiryDate?.getTime() ?? null,
    };
  }));
}

export const getPurchaseReportFn = createServerFn({ method: 'GET' })
  .validator((data: PurchaseReportFilters | void) => data || {})
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    return purchaseReportRows(data);
  });

export const getExpiringInventoryReportFn = createServerFn({ method: 'GET' })
  .validator((data: { days?: number; branchId?: string } | void) => data || {})
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const through = new Date(today);
    through.setDate(through.getDate() + (data.days ?? 30));
    return (await purchaseReportRows({ branchId: data.branchId })).filter(row => row.status === 'received' && row.expiryDate !== null && new Date(row.expiryDate) <= through);
  });

export const getPurchasePriceTrendFn = createServerFn({ method: 'GET' })
  .validator((data: PurchaseReportFilters | void) => data || {})
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    return (await purchaseReportRows(data)).sort((a, b) => a.purchaseDate - b.purchaseDate);
  });

// ──────────────────────────────────────────────────────────────
// INVENTORY — PHYSICAL STOCK COUNT
// ──────────────────────────────────────────────────────────────

export const getInventoryItemsFn = createServerFn({ method: 'GET' })
  .validator((data: { branchId?: string } | void) => data || {})
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    const rows = data.branchId
      ? await db.select().from(inventory).where(eq(inventory.branchId, data.branchId)).orderBy(inventory.name)
      : await db.select().from(inventory).orderBy(inventory.name);

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
  .validator((data: { id?: string; name: string; unit: string; minQuantity: number; branchId?: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');

    if (data.id) {
      await db.update(inventory).set({ name: data.name, unit: data.unit, minQuantity: data.minQuantity.toString() })
        .where(eq(inventory.id, parseInt(data.id)));
      return { id: data.id };
    }
    const [row] = await db.insert(inventory).values({
      name: data.name,
      unit: data.unit,
      minQuantity: data.minQuantity.toString(),
      branchId: data.branchId || 'br-1',
    }).returning();
    return { id: row.id.toString() };
  });
// ──────────────────────────────────────────────────────────────
// RESERVATION APIS
// ──────────────────────────────────────────────────────────────

export const getTopWaitlistFn = createServerFn({ method: 'GET' })
  .validator((data: { branchId: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    const res = await db.select().from(reservations).where(
      and(
        eq(reservations.branchId, data.branchId),
        eq(reservations.status, 'waiting'),
        eq(reservations.type, 'waitlist')
      )
    ).orderBy(reservations.createdAt).limit(1);
    
    return res[0] || null;
  });

export const getReservationsFn = createServerFn({ method: 'GET' })
  .validator((data: { branchId?: string, _t?: number }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    const waiting = eq(reservations.status, 'waiting');
    const res = await db.select().from(reservations).where(
      data.branchId ? and(eq(reservations.branchId, data.branchId), waiting) : waiting
    ).orderBy(reservations.createdAt);
    
    return res;
  });

export const createReservationFn = createServerFn({ method: 'POST' })
  .validator((data: { branchId: string; type: string; customerName: string; customerPhone: string; pax: number; reservationTime?: string; tableId?: string; notes?: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    const customerId = await (await import('./customers.server')).resolveCustomer(data.customerName, data.customerPhone, data.branchId);
    const newRes = await db.insert(reservations).values({
      customerId,
      branchId: data.branchId,
      type: data.type,
      status: 'waiting',
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      pax: data.pax,
      reservationTime: data.reservationTime ?? null,
      tableId: data.tableId ?? null,
      notes: data.notes ?? null,
    }).returning();

    return newRes[0];
  });

export const updateReservationStatusFn = createServerFn({ method: 'POST' })
  .validator((data: { id: number; status: string; tableId?: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    const valuesToUpdate: any = { status: data.status };
    if (data.tableId !== undefined) valuesToUpdate.tableId = data.tableId;

    const updated = await db.update(reservations)
      .set(valuesToUpdate)
      .where(eq(reservations.id, data.id))
      .returning();

    return updated[0];
  });

// ──────────────────────────────────────────────────────────────
// AI & INVENTORY ENHANCEMENT APIS
// ──────────────────────────────────────────────────────────────

export const createPoFromAiRecommendationsFn = createServerFn({ method: 'POST' })
  .validator((data: { items: { inventoryId: number; qty: number; unitPrice: number | null }[]; branchId?: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager'].includes(session.role)) throw new Error('Unauthorized');
    if (!data.items.length) throw new Error('No items to order');

    let sup = await db.select().from(suppliers).limit(1);
    let supplierId: number;
    if (!sup.length) {
      const [newSup] = await db.insert(suppliers).values({
        name: 'General Wholesale Supplier',
        contactInfo: 'orders@supplier.internal',
      }).returning();
      supplierId = newSup.id;
    } else {
      supplierId = sup[0].id;
    }

    const branchId = data.branchId || 'br-1';
    const poNumber = `PO-AI-${Date.now().toString().slice(-6)}`;
    const total = data.items.reduce((sum, item) => sum + (item.qty * (item.unitPrice ?? 50)), 0);

    const [po] = await db.insert(purchaseOrders).values({
      supplierId,
      branchId,
      invoiceNumber: poNumber,
      status: 'pending',
      totalAmount: total.toFixed(2),
    }).returning();

    await db.insert(purchaseOrderItems).values(
      data.items.map((item) => ({
        purchaseOrderId: po.id,
        inventoryId: item.inventoryId,
        quantity: item.qty.toString(),
        unitPrice: (item.unitPrice ?? 50).toString(),
      }))
    );

    return { id: po.id.toString(), invoiceNumber: poNumber, total, itemsCount: data.items.length };
  });

export const recordWastageFn = createServerFn({ method: 'POST' })
  .validator((data: { inventoryId: string; quantity: number; reason: string; notes?: string; branchId?: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session || !['owner', 'manager', 'kitchen'].includes(session.role)) throw new Error('Unauthorized');
    const invId = parseInt(data.inventoryId);
    const qty = Number(data.quantity);
    if (!invId || isNaN(invId)) throw new Error('Invalid inventory item');
    if (!(qty > 0)) throw new Error('Quantity must be greater than zero');

    const inv = await db.select().from(inventory).where(eq(inventory.id, invId)).limit(1);
    if (!inv.length) throw new Error('Item not found in inventory');

    const currentQty = parseFloat(inv[0].quantity);
    const newQty = Math.max(0, currentQty - qty);

    await db.update(inventory).set({ quantity: newQty.toString() }).where(eq(inventory.id, invId));
    await db.insert(inventoryLedger).values({
      inventoryId: invId,
      transactionType: 'WASTAGE',
      referenceId: `WASTE-${data.reason.toUpperCase().replace(/\s+/g, '_')}${data.notes ? ` (${data.notes})` : ''}`,
      quantityChange: (-qty).toString(),
      runningBalance: newQty.toString(),
    });

    return { success: true, newQuantity: newQty, itemName: inv[0].name };
  });

export const getWastageLogsFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');

    const logs = await db.select({
      id: inventoryLedger.id,
      inventoryId: inventoryLedger.inventoryId,
      itemName: inventory.name,
      unit: inventory.unit,
      quantityChange: inventoryLedger.quantityChange,
      referenceId: inventoryLedger.referenceId,
      runningBalance: inventoryLedger.runningBalance,
      createdAt: inventoryLedger.createdAt,
    })
    .from(inventoryLedger)
    .leftJoin(inventory, eq(inventory.id, inventoryLedger.inventoryId))
    .where(eq(inventoryLedger.transactionType, 'WASTAGE'))
    .orderBy(desc(inventoryLedger.createdAt))
    .limit(50);

    return logs.map((l) => ({
      id: l.id.toString(),
      inventoryId: l.inventoryId.toString(),
      itemName: l.itemName || 'Unknown Item',
      unit: l.unit || 'units',
      quantity: Math.abs(parseFloat(l.quantityChange)),
      reason: l.referenceId || 'Unspecified',
      runningBalance: parseFloat(l.runningBalance),
      createdAt: l.createdAt.getTime(),
    }));
  });

export const getCustomerProfileFn = createServerFn({ method: 'POST' })
  .validator((data: { phoneOrName: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSessionServer();
    if (!session) throw new Error('Unauthorized');
    const { getCustomerProfile } = await import('./customers.server');
    return await getCustomerProfile(data.phoneOrName);
  });
