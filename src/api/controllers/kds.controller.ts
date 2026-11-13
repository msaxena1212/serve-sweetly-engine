// API KDS & Shift Controllers: delegates strictly to Backend Services
import { KdsService } from '../../be/services/kds.service';
import { ShiftService } from '../../be/services/shift.service';
import type { UserSession } from '../../lib/auth.server';
import { jsonResponse, errorResponse } from './orders.controller';

export class KdsController {
  static async list(request: Request) {
    const url = new URL(request.url);
    const station = url.searchParams.get('station') || undefined;
    const tickets = await KdsService.getActiveTickets(station);
    return jsonResponse({ success: true, data: tickets });
  }

  static async updateStatus(request: Request, user: UserSession) {
    const body = await request.json().catch(() => ({}));
    if (!body.itemId || !body.status) return errorResponse('itemId and status are required');

    const result = await KdsService.updateItemStatus({
      itemId: parseInt(body.itemId),
      status: body.status,
      userId: user.id,
    });

    return jsonResponse(result);
  }
}

export class ShiftController {
  static async status() {
    const status = await ShiftService.getActiveShift();
    return jsonResponse({ success: true, data: status });
  }

  static async open(request: Request, user: UserSession) {
    const body = await request.json().catch(() => ({}));
    const openingCash = parseFloat(body.openingCash) || 0;

    const result = await ShiftService.openShift(user.id, openingCash, body.branchId);
    return jsonResponse({ success: true, data: result }, 201);
  }

  static async close(request: Request, user: UserSession) {
    const body = await request.json().catch(() => ({}));
    if (body.actualCashTotal === undefined) {
      return errorResponse('actualCashTotal is required');
    }

    const result = await ShiftService.closeShift({
      userId: user.id,
      actualCashTotal: parseFloat(body.actualCashTotal),
      denominations: body.denominations,
      notes: body.notes,
      branchId: body.branchId,
    });

    return jsonResponse(result);
  }
}
