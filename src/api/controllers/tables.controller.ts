// API Tables Controller: delegates strictly to Backend TableService
import { TableService } from '../../be/services/table.service';
import type { UserSession } from '../../lib/auth.server';
import { jsonResponse, errorResponse } from './orders.controller';

export class TablesController {
  static async list() {
    const layout = await TableService.getFloorLayout();
    return jsonResponse({ success: true, data: layout });
  }

  static async seatWalkIn(request: Request, user: UserSession) {
    const body = await request.json().catch(() => ({}));
    if (!body.tableNumber) return errorResponse('tableNumber is required');

    const result = await TableService.seatWalkIn({
      tableNumber: body.tableNumber,
      pax: parseInt(body.pax) || 2,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      branchId: body.branchId,
      userId: user.id,
    });

    return jsonResponse(result);
  }

  static async transfer(request: Request, user: UserSession) {
    const body = await request.json().catch(() => ({}));
    if (!body.orderId || !body.fromTableNumber || !body.toTableNumber) {
      return errorResponse('orderId, fromTableNumber and toTableNumber are required');
    }

    const result = await TableService.transferTable({
      orderId: parseInt(body.orderId),
      fromTableNumber: body.fromTableNumber,
      toTableNumber: body.toTableNumber,
      userId: user.id,
    });

    return jsonResponse(result);
  }

  static async merge(request: Request, user: UserSession) {
    const body = await request.json().catch(() => ({}));
    if (!body.primaryTableNumber || !body.secondaryTableNumber) {
      return errorResponse('primaryTableNumber and secondaryTableNumber are required');
    }

    const result = await TableService.mergeTables({
      primaryTableNumber: body.primaryTableNumber,
      secondaryTableNumber: body.secondaryTableNumber,
      userId: user.id,
    });

    return jsonResponse(result);
  }

  static async queue() {
    const queue = await TableService.getQueue();
    return jsonResponse({ success: true, data: queue });
  }
}
