// API Orders Controller: delegates strictly to Backend OrderService
import { OrderService } from '../../be/services/order.service';
import type { UserSession } from '../../lib/auth.server';

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Branch-Id',
    },
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ success: false, error: message }, status);
}

export class OrdersController {
  static async listActive(user: UserSession) {
    const active = await OrderService.getActiveOrders();
    return jsonResponse({ success: true, data: active });
  }

  static async create(request: Request, user: UserSession) {
    const body = await request.json().catch(() => ({}));
    if (!body.type) return errorResponse('type ("dine-in" | "takeaway") is required');

    const order = await OrderService.createOrder({
      type: body.type,
      tableNumber: body.tableNumber,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      branchId: body.branchId,
      userId: user.id,
    });

    return jsonResponse({ success: true, data: order }, 201);
  }

  static async getDetails(orderId: number) {
    const details = await OrderService.getOrderDetails(orderId);
    return jsonResponse({ success: true, data: details });
  }

  static async addItems(orderId: number, request: Request, user: UserSession) {
    const body = await request.json().catch(() => ({}));
    if (!body.items || !Array.isArray(body.items) || !body.items.length) {
      return errorResponse('items array is required');
    }

    const result = await OrderService.addItems({
      orderId,
      items: body.items,
      userId: user.id,
    });

    return jsonResponse({ success: true, data: result });
  }

  static async splitEqually(orderId: number, request: Request, user: UserSession) {
    const body = await request.json().catch(() => ({}));
    const numberOfSplits = parseInt(body.numberOfSplits) || 2;

    const result = await OrderService.splitEqually({
      orderId,
      numberOfSplits,
    });

    return jsonResponse({ success: true, data: result });
  }

  static async settle(orderId: number, request: Request, user: UserSession) {
    const body = await request.json().catch(() => ({}));
    const paymentMethod = body.paymentMethod || 'cash';
    const tenderAmount = body.tenderAmount ? parseFloat(body.tenderAmount) : undefined;

    const result = await OrderService.settleOrder({
      orderId,
      paymentMethod,
      tenderAmount,
      userId: user.id,
    });

    return jsonResponse({ success: true, data: result });
  }

  static async void(orderId: number, request: Request, user: UserSession) {
    const body = await request.json().catch(() => ({}));
    if (!body.reason) return errorResponse('Void reason is mandatory');

    const result = await OrderService.voidOrder(orderId, body.reason, user.id);
    return jsonResponse(result);
  }
}
