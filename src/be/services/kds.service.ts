// Backend Kitchen Display System (KDS) Service
import { db } from '../../lib/db/db';
import { orderItems, orders, menuItems, stations, tables } from '../../lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logAuditEvent } from './audit.service';

export interface UpdateKdsItemStatusParams {
  itemId: number;
  status: 'pending' | 'preparing' | 'ready' | 'served';
  userId?: number;
}

export class KdsService {
  /**
   * Get active kitchen tickets with station filtering and elapsed prep time
   */
  static async getActiveTickets(stationName?: string) {
    const rawTickets = await db
      .select({
        itemId: orderItems.id,
        orderId: orders.id,
        orderType: orders.type,
        tableId: orders.tableId,
        tableNumber: tables.number,
        dishName: menuItems.name,
        stationId: menuItems.stationId,
        quantity: orderItems.quantity,
        notes: orderItems.notes,
        status: orderItems.status,
        createdAt: orderItems.createdAt,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(tables, sql`${tables.id}::text = ${orders.tableId}`)
      .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
      .where(and(eq(orders.status, 'open'), sql`${orderItems.status} != 'served'`))
      .orderBy(orderItems.createdAt);

    const stns = await db.select().from(stations);

    const now = Date.now();
    const tickets = rawTickets.map((t) => {
      const station = stns.find((s) => s.id === t.stationId)?.name || 'Kitchen';
      const elapsedMinutes = Math.floor((now - new Date(t.createdAt).getTime()) / 60000);
      return {
        ...t,
        station,
        elapsedMinutes,
        isOverdue: elapsedMinutes >= 15,
      };
    });

    if (stationName && stationName.toLowerCase() !== 'all') {
      return tickets.filter((t) => t.station.toLowerCase() === stationName.toLowerCase());
    }

    return tickets;
  }

  /**
   * Update line item preparation status
   */
  static async updateItemStatus(params: UpdateKdsItemStatusParams) {
    const { itemId, status, userId } = params;

    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, itemId)).limit(1);
    if (!item) throw new Error(`Item #${itemId} not found`);

    await db.update(orderItems).set({ status }).where(eq(orderItems.id, itemId));

    await logAuditEvent({
      entityType: 'order',
      entityId: item.orderId.toString(),
      action: 'update',
      userId,
      reason: `KDS: Line item #${itemId} transitioned from ${item.status} to ${status}`,
    });

    return {
      success: true,
      itemId,
      orderId: item.orderId,
      newStatus: status,
    };
  }
}
