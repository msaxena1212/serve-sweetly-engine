// Backend Shift & Cash Register Service
import { db } from '../../lib/db/db';
import { shifts, orders, payments } from '../../lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { logAuditEvent } from './audit.service';

export interface DenominationCount {
  denomination: number;
  count: number;
  total: number;
}

export interface CloseShiftParams {
  userId: number;
  branchId?: string;
  denominations?: DenominationCount[];
  actualCashTotal: number;
  notes?: string;
}

export class ShiftService {
  /**
   * Get current active shift status
   */
  static async getActiveShift(branchId = 'br-1') {
    const active = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.branchId, branchId), eq(shifts.status, 'open')))
      .orderBy(desc(shifts.id))
      .limit(1);

    if (!active.length) {
      return { isActive: false, shift: null, summary: null };
    }

    const shift = active[0];

    // Compute live sales during this shift
    const stats = (await db.execute(sql`
      SELECT
        count(*)::int as total_orders,
        coalesce(sum(total), 0)::float as total_sales
      FROM orders
      WHERE branch_id = ${branchId}
        AND status = 'paid'
        AND created_at >= ${shift.openedAt}
    `)) as any[];

    const openingCash = parseFloat(shift.openingCash);
    const totalSales = stats[0]?.total_sales || 0;
    const expectedCash = openingCash + totalSales;

    return {
      isActive: true,
      shift,
      summary: {
        openingCash,
        ordersCount: stats[0]?.total_orders || 0,
        salesInShift: totalSales,
        expectedCash,
      },
    };
  }

  /**
   * Open a new cashier shift with starting float
   */
  static async openShift(userId: number, openingCash: number, branchId = 'br-1') {
    const existing = await this.getActiveShift(branchId);
    if (existing.isActive) {
      throw new Error('A shift is already open. Please close the active shift first.');
    }

    const [newShift] = await db
      .insert(shifts)
      .values({
        branchId,
        openedBy: userId,
        openingCash: openingCash.toFixed(2),
        status: 'open',
      })
      .returning();

    await logAuditEvent({
      entityType: 'shift',
      entityId: newShift.id.toString(),
      action: 'create',
      userId,
      reason: `Cashier shift opened with starting float: ₹${openingCash.toFixed(2)}`,
    });

    return newShift;
  }

  /**
   * Close active shift with denomination verification and variance auditing
   */
  static async closeShift(params: CloseShiftParams) {
    const { userId, branchId = 'br-1', actualCashTotal, notes } = params;

    const current = await this.getActiveShift(branchId);
    if (!current.isActive || !current.shift || !current.summary) {
      throw new Error('No active shift found to close');
    }

    const expectedCash = current.summary.expectedCash;
    const variance = actualCashTotal - expectedCash;

    await db
      .update(shifts)
      .set({
        closedBy: userId,
        status: 'closed',
        closedAt: new Date(),
        closingCash: actualCashTotal.toFixed(2),
        expectedCash: expectedCash.toFixed(2),
        variance: variance.toFixed(2),
      })
      .where(eq(shifts.id, current.shift.id));

    await logAuditEvent({
      entityType: 'shift',
      entityId: current.shift.id.toString(),
      action: 'update',
      userId,
      reason: `Shift #${current.shift.id} closed. Expected: ₹${expectedCash.toFixed(2)}, Actual: ₹${actualCashTotal.toFixed(2)}, Variance: ₹${variance.toFixed(2)}`,
    });

    return {
      success: true,
      shiftId: current.shift.id,
      openingCash: current.summary.openingCash,
      salesInShift: current.summary.salesInShift,
      expectedCash,
      actualCashTotal,
      variance,
      isBalanced: Math.abs(variance) < 0.01,
      notes,
    };
  }
}
