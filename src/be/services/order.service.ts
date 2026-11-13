// Backend Order & Billing Domain Service
import { db } from '../../lib/db/db';
import { orders, orderItems, tables, menuItems, paymentMethods, recipeBom, inventory, inventoryLedger } from '../../lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { logAuditEvent } from './audit.service';
import { generateAsciiReceipt, generateHtmlReceipt, generateAsciiKot, type ReceiptData } from './receipt.service';

export interface CreateOrderParams {
  type: 'dine-in' | 'takeaway';
  tableId?: string | null;
  tableNumber?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  branchId?: string;
  userId?: number;
}

export interface AddOrderItemParams {
  orderId: number;
  items: Array<{
    menuItemId: number;
    quantity: number;
    notes?: string | null;
    modifiers?: string[];
  }>;
  userId?: number;
}

export interface SplitEqualParams {
  orderId: number;
  numberOfSplits: number;
}

export interface SettleOrderParams {
  orderId: number;
  paymentMethod: string;
  tenderAmount?: number;
  discountPct?: number;
  taxPct?: number;
  userId?: number;
}

export class OrderService {
  /**
   * Create a new order (Dine-in or Takeaway)
   */
  static async createOrder(params: CreateOrderParams) {
    let resolvedTableId = params.tableId;

    if (params.type === 'dine-in' && !resolvedTableId && params.tableNumber) {
      const t = await db.select().from(tables).where(eq(tables.number, params.tableNumber)).limit(1);
      if (t.length) {
        resolvedTableId = t[0].id.toString();
        await db.update(tables).set({ status: 'occupied' }).where(eq(tables.id, t[0].id));
      }
    } else if (resolvedTableId) {
      await db.update(tables).set({ status: 'occupied' }).where(eq(tables.id, parseInt(resolvedTableId)));
    }

    const [order] = await db
      .insert(orders)
      .values({
        type: params.type,
        tableId: resolvedTableId || null,
        customerName: params.customerName || (params.type === 'dine-in' ? 'Table Guest' : 'Takeaway Guest'),
        customerPhone: params.customerPhone || null,
        branchId: params.branchId || 'br-1',
        status: 'open',
        subtotal: '0.00',
        total: '0.00',
      })
      .returning();

    await logAuditEvent({
      entityType: 'order',
      entityId: order.id.toString(),
      action: 'create',
      userId: params.userId,
      afterSnapshot: order as any,
    });

    return order;
  }

  /**
   * Get active orders
   */
  static async getActiveOrders(branchId = 'br-1') {
    return await db
      .select({
        id: orders.id,
        tableId: orders.tableId,
        type: orders.type,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        status: orders.status,
        subtotal: orders.subtotal,
        total: orders.total,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(and(eq(orders.status, 'open'), eq(orders.branchId, branchId)))
      .orderBy(desc(orders.createdAt));
  }

  /**
   * Get order details with items
   */
  static async getOrderDetails(orderId: number) {
    const [ord] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!ord) throw new Error(`Order #${orderId} not found`);

    const items = await db
      .select({
        id: orderItems.id,
        menuItemId: orderItems.menuItemId,
        name: menuItems.name,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        status: orderItems.status,
        notes: orderItems.notes,
      })
      .from(orderItems)
      .leftJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
      .where(eq(orderItems.orderId, orderId));

    let tableNumber: string | null = null;
    if (ord.tableId) {
      const [tbl] = await db.select().from(tables).where(eq(tables.id, parseInt(ord.tableId))).limit(1);
      if (tbl) tableNumber = tbl.number;
    }

    return {
      ...ord,
      tableNumber,
      items: items.map((i) => ({
        ...i,
        name: i.name || 'Unknown Item',
        totalPrice: i.quantity * parseFloat(i.unitPrice),
      })),
    };
  }

  /**
   * Add items to order and generate KOT slip
   */
  static async addItems(params: AddOrderItemParams) {
    const { orderId, items, userId } = params;
    const [ord] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!ord) throw new Error(`Order #${orderId} not found`);
    if (ord.status !== 'open') throw new Error(`Cannot add items to ${ord.status} order`);

    const insertedLines: Array<{ name: string; quantity: number; unitPrice: number; notes?: string | null }> = [];

    for (const item of items) {
      const [dish] = await db.select().from(menuItems).where(eq(menuItems.id, item.menuItemId)).limit(1);
      if (!dish) continue;

      let combinedNotes = item.notes || '';
      if (item.modifiers?.length) {
        combinedNotes = combinedNotes ? `${combinedNotes} [${item.modifiers.join(', ')}]` : `[${item.modifiers.join(', ')}]`;
      }

      await db.insert(orderItems).values({
        orderId,
        menuItemId: item.menuItemId,
        quantity: item.quantity || 1,
        unitPrice: dish.price,
        notes: combinedNotes || null,
        status: 'pending',
      });

      insertedLines.push({
        name: dish.name,
        quantity: item.quantity || 1,
        unitPrice: parseFloat(dish.price),
        notes: combinedNotes || null,
      });
    }

    // Recalculate order subtotal and total
    const allLines = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const subtotal = allLines.reduce((acc, l) => acc + l.quantity * parseFloat(l.unitPrice), 0);
    const discPct = parseFloat(ord.discountPct) || 0;
    const taxPct = parseFloat(ord.taxPct) || 0;
    const discountAmt = subtotal * (discPct / 100);
    const taxable = subtotal - discountAmt;
    const taxAmt = taxable * (taxPct / 100);
    const finalTotal = taxable + taxAmt;

    await db
      .update(orders)
      .set({
        subtotal: subtotal.toFixed(2),
        total: finalTotal.toFixed(2),
      })
      .where(eq(orders.id, orderId));

    // Resolve table number for KOT
    let tableNumber: string | null = null;
    if (ord.tableId) {
      const [t] = await db.select().from(tables).where(eq(tables.id, parseInt(ord.tableId))).limit(1);
      if (t) tableNumber = t.number;
    }

    // Generate KOT Ticket
    const kotSlip = generateAsciiKot({
      kotNumber: `KOT-${orderId}-${Date.now().toString().slice(-4)}`,
      orderId,
      tableNumber,
      orderType: ord.type as 'dine-in' | 'takeaway',
      createdAt: new Date(),
      items: insertedLines,
    });

    await logAuditEvent({
      entityType: 'order',
      entityId: orderId.toString(),
      action: 'update',
      userId,
      reason: `Added ${items.length} items to order. New total: ${finalTotal.toFixed(2)}`,
    });

    return {
      orderId,
      subtotal,
      total: finalTotal,
      addedItemsCount: insertedLines.length,
      kotSlip,
    };
  }

  /**
   * Split bill equally into N sub-bills
   */
  static async splitEqually(params: SplitEqualParams) {
    const { orderId, numberOfSplits } = params;
    if (numberOfSplits < 2) throw new Error('Splits must be at least 2');

    const order = await this.getOrderDetails(orderId);
    const totalAmount = parseFloat(order.total);
    const splitAmount = Math.round((totalAmount / numberOfSplits) * 100) / 100;

    const splits = [];
    let running = 0;
    for (let i = 1; i <= numberOfSplits; i++) {
      const amt = i === numberOfSplits ? Math.round((totalAmount - running) * 100) / 100 : splitAmount;
      running += amt;
      splits.push({
        splitNumber: i,
        ofTotal: numberOfSplits,
        amount: amt,
        status: 'unpaid',
      });
    }

    await logAuditEvent({
      entityType: 'order',
      entityId: orderId.toString(),
      action: 'split',
      reason: `Split equally into ${numberOfSplits} portions of ~${splitAmount} each`,
    });

    return {
      orderId,
      totalAmount,
      numberOfSplits,
      splits,
    };
  }

  /**
   * Settle / Pay Order and generate Thermal Receipt
   */
  static async settleOrder(params: SettleOrderParams) {
    const { orderId, paymentMethod, tenderAmount, userId } = params;
    const order = await this.getOrderDetails(orderId);
    if (order.status === 'completed' || order.status === 'paid') {
      throw new Error(`Order #${orderId} is already paid`);
    }

    // Resolve payment method ID
    const [pm] = await db
      .select()
      .from(paymentMethods)
      .where(sql`lower(${paymentMethods.name}) = lower(${paymentMethod || 'cash'})`)
      .limit(1);

    const methodId = pm?.id ?? 1;
    const grandTotal = parseFloat(order.total);
    const tendered = tenderAmount ?? grandTotal;
    const changeDue = Math.max(0, tendered - grandTotal);

    await db.transaction(async (tx) => {
      // 1. Mark order paid
      await tx
        .update(orders)
        .set({
          status: 'paid',
          paymentMethodId: methodId,
        })
        .where(eq(orders.id, orderId));

      // 2. Free table if dine-in
      if (order.tableId) {
        await tx.update(tables).set({ status: 'available' }).where(eq(tables.id, parseInt(order.tableId)));
      }

      // 3. Auto-deduct inventory using Recipe BOM
      for (const item of order.items) {
        const boms = await tx.select().from(recipeBom).where(eq(recipeBom.menuItemId, item.menuItemId));
        for (const bom of boms) {
          const deduction = parseFloat(bom.quantity) * item.quantity;
          const [inv] = await tx.select().from(inventory).where(eq(inventory.id, bom.inventoryId)).limit(1);
          if (inv) {
            const currentQty = parseFloat(inv.quantity);
            const newQty = Math.max(0, currentQty - deduction);
            await tx.update(inventory).set({ quantity: newQty.toFixed(3) }).where(eq(inventory.id, inv.id));
            await tx.insert(inventoryLedger).values({
              inventoryId: inv.id,
              transactionType: 'SALE_CONSUMPTION',
              referenceId: `Order #${orderId}`,
              quantityChange: (-deduction).toFixed(3),
              runningBalance: newQty.toFixed(3),
            });
          }
        }
      }
    });

    const receiptPayload: ReceiptData = {
      restaurantName: 'Forno Restaurant & Cafe',
      branchName: 'Main Branch',
      orderId,
      invoiceNumber: `INV-${orderId}`,
      tableNumber: order.tableNumber,
      orderType: order.type as 'dine-in' | 'takeaway',
      cashierName: 'Staff',
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      createdAt: order.createdAt,
      items: order.items,
      subtotal: parseFloat(order.subtotal),
      discountPct: parseFloat(order.discountPct),
      discountAmount: parseFloat(order.subtotal) * (parseFloat(order.discountPct) / 100),
      taxPct: parseFloat(order.taxPct),
      taxAmount: parseFloat(order.total) - parseFloat(order.subtotal) + (parseFloat(order.subtotal) * (parseFloat(order.discountPct) / 100)),
      total: grandTotal,
      paymentMethod,
      tenderAmount: tendered,
      changeDue,
    };

    const asciiReceipt = generateAsciiReceipt(receiptPayload);
    const htmlReceipt = generateHtmlReceipt(receiptPayload);

    await logAuditEvent({
      entityType: 'payment',
      entityId: orderId.toString(),
      action: 'settle',
      userId,
      reason: `Settled ${order.type} order #${orderId} via ${paymentMethod} (${grandTotal.toFixed(2)})`,
    });

    return {
      success: true,
      orderId,
      amountPaid: grandTotal,
      paymentMethod,
      changeDue,
      receipt: {
        text: asciiReceipt,
        html: htmlReceipt,
      },
    };
  }

  /**
   * Void order with mandatory reason
   */
  static async voidOrder(orderId: number, reason: string, userId?: number) {
    if (!reason || reason.trim().length < 3) throw new Error('A valid reason is required to void an order');

    const [ord] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!ord) throw new Error(`Order #${orderId} not found`);

    await db.transaction(async (tx) => {
      await tx.update(orders).set({ status: 'void' }).where(eq(orders.id, orderId));
      if (ord.tableId) {
        await tx.update(tables).set({ status: 'available' }).where(eq(tables.id, parseInt(ord.tableId)));
      }
    });

    await logAuditEvent({
      entityType: 'order',
      entityId: orderId.toString(),
      action: 'void',
      userId,
      reason,
      beforeSnapshot: ord as any,
    });

    return { success: true, message: `Order #${orderId} voided successfully` };
  }
}
