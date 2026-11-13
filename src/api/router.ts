// Standalone Unified REST API Router for /api/v1/*
import { authenticateApiRequest } from './middleware/auth';
import { OrdersController, jsonResponse, errorResponse } from './controllers/orders.controller';
import { TablesController } from './controllers/tables.controller';
import { KdsController, ShiftController } from './controllers/kds.controller';
import { loginServer } from '../lib/auth.server';

export async function handleApiV1Request(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();

  // 1. CORS Preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Branch-Id',
      },
    });
  }

  // 2. Health & Ping
  if (path === '/api/v1/ping') {
    return jsonResponse({
      success: true,
      service: 'Forno Restaurant POS Modular API',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
    });
  }

  // 3. Auth Login (Public)
  if (path === '/api/v1/auth/login' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { pin?: string };
    if (!body.pin) return errorResponse('Staff PIN is required', 400);
    try {
      const session = await loginServer(body.pin);
      return jsonResponse({
        success: true,
        data: { token: session.token, user: session.user },
      });
    } catch (err: any) {
      return errorResponse(err.message || 'Login failed', 401);
    }
  }

  // 4. Require Authentication for Protected Endpoints
  const user = await authenticateApiRequest(request);
  if (!user) {
    return errorResponse('Unauthorized: Please supply Authorization: Bearer <token>', 401);
  }

  // 5. Auth Me
  if (path === '/api/v1/auth/me' && method === 'GET') {
    return jsonResponse({ success: true, data: user });
  }

  try {
    // 6. Orders Endpoints
    if (path === '/api/v1/orders/active' && method === 'GET') {
      return await OrdersController.listActive(user);
    }
    if (path === '/api/v1/orders' && method === 'POST') {
      return await OrdersController.create(request, user);
    }

    const orderIdMatch = path.match(/^\/api\/v1\/orders\/(\d+)$/);
    if (orderIdMatch && method === 'GET') {
      return await OrdersController.getDetails(parseInt(orderIdMatch[1]));
    }

    const addItemsMatch = path.match(/^\/api\/v1\/orders\/(\d+)\/items$/);
    if (addItemsMatch && method === 'POST') {
      return await OrdersController.addItems(parseInt(addItemsMatch[1]), request, user);
    }

    const splitMatch = path.match(/^\/api\/v1\/orders\/(\d+)\/split$/);
    if (splitMatch && method === 'POST') {
      return await OrdersController.splitEqually(parseInt(splitMatch[1]), request, user);
    }

    const payMatch = path.match(/^\/api\/v1\/orders\/(\d+)\/pay$/);
    if (payMatch && method === 'POST') {
      return await OrdersController.settle(parseInt(payMatch[1]), request, user);
    }

    const voidMatch = path.match(/^\/api\/v1\/orders\/(\d+)\/void$/);
    if (voidMatch && method === 'POST') {
      return await OrdersController.void(parseInt(voidMatch[1]), request, user);
    }

    // 7. Tables Endpoints
    if (path === '/api/v1/tables' && method === 'GET') {
      return await TablesController.list();
    }
    if (path === '/api/v1/tables/seat' && method === 'POST') {
      return await TablesController.seatWalkIn(request, user);
    }
    if (path === '/api/v1/tables/transfer' && method === 'POST') {
      return await TablesController.transfer(request, user);
    }
    if (path === '/api/v1/tables/merge' && method === 'POST') {
      return await TablesController.merge(request, user);
    }
    if (path === '/api/v1/tables/queue' && method === 'GET') {
      return await TablesController.queue();
    }

    // 8. Kitchen Display System (KDS) Endpoints
    if (path === '/api/v1/kds' && method === 'GET') {
      return await KdsController.list(request);
    }
    if (path === '/api/v1/kds/status' && method === 'POST') {
      return await KdsController.updateStatus(request, user);
    }

    // 9. Cashier Shift Endpoints
    if (path === '/api/v1/shift/status' && method === 'GET') {
      return await ShiftController.status();
    }
    if (path === '/api/v1/shift/open' && method === 'POST') {
      return await ShiftController.open(request, user);
    }
    if (path === '/api/v1/shift/close' && method === 'POST') {
      return await ShiftController.close(request, user);
    }

    // 10. AI Assistant & Bots Endpoints
    if (path === '/api/v1/ai/chat' && method === 'POST') {
      const { AiController } = await import('./controllers/ai.controller');
      return await AiController.chat(request);
    }
    if (path === '/api/v1/ai/reorder' && method === 'POST') {
      const { AiController } = await import('./controllers/ai.controller');
      return await AiController.runAutonomousReorder(user);
    }
    if (path === '/api/v1/ai/briefing' && method === 'GET') {
      const { AiController } = await import('./controllers/ai.controller');
      return await AiController.getOwnerBriefing(user);
    }
    if (path === '/api/v1/ai/upsell' && method === 'POST') {
      const { AiController } = await import('./controllers/ai.controller');
      return await AiController.getBasketUpsell(request);
    }

    return errorResponse(`API endpoint '${method} ${path}' not found`, 404);
  } catch (err: any) {
    console.error('API Error:', err);
    return errorResponse(err.message || 'Internal Server Error', 500);
  }
}
