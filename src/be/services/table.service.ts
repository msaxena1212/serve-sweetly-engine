// Backend Table & Reservation Domain Service
import { db } from '../../lib/db/db';
import { tables, tableSections, orders, reservations } from '../../lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logAuditEvent } from './audit.service';

export interface TableTransferParams {
  orderId: number;
  fromTableNumber: string;
  toTableNumber: string;
  userId?: number;
}

export interface TableMergeParams {
  primaryTableNumber: string;
  secondaryTableNumber: string;
  userId?: number;
}

export interface WalkInSeatingParams {
  tableNumber: string;
  pax: number;
  customerName?: string;
  customerPhone?: string;
  branchId?: string;
  userId?: number;
}

export class TableService {
  /**
   * Get all tables with floor section, current active order and status
   */
  static async getFloorLayout(branchId = 'br-1') {
    const allTables = await db.select().from(tables).where(eq(tables.branchId, branchId));
    const sections = await db.select().from(tableSections).where(eq(tableSections.branchId, branchId));
    const activeOrders = await db.select().from(orders).where(and(eq(orders.status, 'open'), eq(orders.branchId, branchId)));

    return allTables.map((t) => {
      const currentOrder = activeOrders.find((o) => o.tableId === t.id.toString());
      const section = sections.find((s) => s.id === t.sectionId);
      return {
        id: t.id,
        number: t.number,
        status: t.status,
        sectionId: t.sectionId,
        sectionName: section ? section.name : 'Main Dining',
        activeOrderId: currentOrder ? currentOrder.id : null,
        customerName: currentOrder?.customerName || null,
        orderTotal: currentOrder ? parseFloat(currentOrder.total) : 0,
      };
    });
  }

  /**
   * Seat walk-in guest at a table
   */
  static async seatWalkIn(params: WalkInSeatingParams) {
    const { tableNumber, pax, customerName, customerPhone, branchId = 'br-1', userId } = params;

    const [t] = await db.select().from(tables).where(eq(tables.number, tableNumber)).limit(1);
    if (!t) throw new Error(`Table ${tableNumber} not found`);
    if (t.status === 'occupied') throw new Error(`Table ${tableNumber} is already occupied`);

    // 1. Mark table occupied
    await db.update(tables).set({ status: 'occupied' }).where(eq(tables.id, t.id));

    // 2. Create initial open order for the table
    const [newOrder] = await db
      .insert(orders)
      .values({
        tableId: t.id.toString(),
        type: 'dine-in',
        customerName: customerName || `Walk-in Party (${pax}p)`,
        customerPhone: customerPhone || null,
        branchId,
        status: 'open',
        subtotal: '0.00',
        total: '0.00',
      })
      .returning();

    await logAuditEvent({
      entityType: 'table',
      entityId: tableNumber,
      action: 'update',
      userId,
      reason: `Seated walk-in party of ${pax} (Order #${newOrder.id})`,
    });

    return {
      success: true,
      tableNumber,
      orderId: newOrder.id,
      status: 'occupied',
    };
  }

  /**
   * Transfer order from Table A to Table B
   */
  static async transferTable(params: TableTransferParams) {
    const { orderId, fromTableNumber, toTableNumber, userId } = params;

    const [fromTbl] = await db.select().from(tables).where(eq(tables.number, fromTableNumber)).limit(1);
    const [toTbl] = await db.select().from(tables).where(eq(tables.number, toTableNumber)).limit(1);
    const [ord] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);

    if (!fromTbl) throw new Error(`Source table ${fromTableNumber} not found`);
    if (!toTbl) throw new Error(`Destination table ${toTableNumber} not found`);
    if (!ord) throw new Error(`Order #${orderId} not found`);
    if (toTbl.status === 'occupied') {
      throw new Error(`Cannot transfer: Table ${toTableNumber} is already occupied`);
    }

    await db.transaction(async (tx) => {
      // 1. Free old table
      await tx.update(tables).set({ status: 'available' }).where(eq(tables.id, fromTbl.id));
      // 2. Occupy new table
      await tx.update(tables).set({ status: 'occupied' }).where(eq(tables.id, toTbl.id));
      // 3. Point order to new table
      await tx.update(orders).set({ tableId: toTbl.id.toString() }).where(eq(orders.id, orderId));
    });

    await logAuditEvent({
      entityType: 'table',
      entityId: `${fromTableNumber} -> ${toTableNumber}`,
      action: 'transfer',
      userId,
      reason: `Transferred order #${orderId} from ${fromTableNumber} to ${toTableNumber}`,
    });

    return {
      success: true,
      message: `Order #${orderId} transferred from ${fromTableNumber} to ${toTableNumber}`,
      fromTableNumber,
      toTableNumber,
    };
  }

  /**
   * Merge two tables into one combined order
   */
  static async mergeTables(params: TableMergeParams) {
    const { primaryTableNumber, secondaryTableNumber, userId } = params;

    const [primTbl] = await db.select().from(tables).where(eq(tables.number, primaryTableNumber)).limit(1);
    const [secTbl] = await db.select().from(tables).where(eq(tables.number, secondaryTableNumber)).limit(1);

    if (!primTbl) throw new Error(`Primary table ${primaryTableNumber} not found`);
    if (!secTbl) throw new Error(`Secondary table ${secondaryTableNumber} not found`);

    const [primOrder] = await db.select().from(orders).where(and(eq(orders.tableId, primTbl.id.toString()), eq(orders.status, 'open'))).limit(1);
    const [secOrder] = await db.select().from(orders).where(and(eq(orders.tableId, secTbl.id.toString()), eq(orders.status, 'open'))).limit(1);

    if (!primOrder) throw new Error(`No active order on primary table ${primaryTableNumber}`);

    await db.transaction(async (tx) => {
      if (secOrder) {
        // Move all items from secondary order to primary order
        await tx.execute(sql`
          UPDATE order_items
          SET order_id = ${primOrder.id}
          WHERE order_id = ${secOrder.id}
        `);
        // Cancel secondary order
        await tx.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, secOrder.id));
      }

      // Keep secondary table as occupied or linked to primary
      await tx.update(tables).set({ status: 'occupied' }).where(eq(tables.id, secTbl.id));

      // Recalculate primary order total
      const lines = (await tx.execute(sql`
        SELECT coalesce(sum(quantity * unit_price), 0)::float as total
        FROM order_items WHERE order_id = ${primOrder.id}
      `)) as any[];
      const newTotal = lines[0]?.total || 0;

      await tx.update(orders).set({
        subtotal: newTotal.toFixed(2),
        total: newTotal.toFixed(2),
        customerName: `${primOrder.customerName} & Table ${secondaryTableNumber}`,
      }).where(eq(orders.id, primOrder.id));
    });

    await logAuditEvent({
      entityType: 'table',
      entityId: `${primaryTableNumber} + ${secondaryTableNumber}`,
      action: 'merge',
      userId,
      reason: `Merged table ${secondaryTableNumber} into table ${primaryTableNumber}`,
    });

    return {
      success: true,
      message: `Tables ${primaryTableNumber} and ${secondaryTableNumber} merged successfully`,
      primaryOrderId: primOrder.id,
    };
  }

  /**
   * Get active reservations and waitlist
   */
  static async getQueue(branchId = 'br-1') {
    const list = await db
      .select()
      .from(reservations)
      .where(and(eq(reservations.branchId, branchId), eq(reservations.status, 'waiting')))
      .orderBy(reservations.createdAt);

    return list;
  }
}
