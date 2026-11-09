import { db } from '../lib/db/db';
import {
  tables,
  tableSections,
  menuItems,
  categories,
  stations,
  orders,
  orderItems,
  shifts,
  reservations,
  paymentMethods,
  users,
} from '../lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { loginServer, verifyToken, type UserSession } from '../lib/auth.server';
import { getCustomerProfile, resolveCustomer } from '../lib/customers.server';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Branch-Id',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function errorJson(message: string, status = 400) {
  return json({ success: false, error: message }, status);
}

function parseCookie(cookieStr: string, name: string): string | null {
  const match = cookieStr.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

async function authenticate(request: Request): Promise<UserSession | null> {
  const authHeader = request.headers.get('authorization') || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    const cookieHeader = request.headers.get('cookie') || '';
    token = parseCookie(cookieHeader, 'session_token');
  }
  if (!token) return null;
  return await verifyToken(token);
}

export async function handleUnifiedApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, ''); // strip trailing slash
  const method = request.method.toUpperCase();

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 1. HEALTH / PING
  // ─────────────────────────────────────────────────────────────
  if (path === '/api/v1/ping') {
    return json({
      success: true,
      service: 'Forno Restaurant POS Unified API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 2. AUTHENTICATION
  // ─────────────────────────────────────────────────────────────
  if (path === '/api/v1/auth/login' && method === 'POST') {
    try {
      const body = (await request.json().catch(() => ({}))) as { pin?: string };
      if (!body.pin) return errorJson('Staff PIN is required', 400);

      const session = await loginServer(body.pin);
      return json({
        success: true,
        data: {
          token: session.token,
          user: session.user,
        },
      });
    } catch (err: any) {
      return errorJson(err.message || 'Authentication failed', 401);
    }
  }

  if (path === '/api/v1/auth/me' && method === 'GET') {
    const user = await authenticate(request);
    if (!user) return errorJson('Unauthorized', 401);
    return json({ success: true, data: user });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. PUBLIC MENU (For Table QR & Guest Scanning)
  // ─────────────────────────────────────────────────────────────
  if (path === '/api/v1/menu/public' && method === 'GET') {
    try {
      const items = await db
        .select({
          id: menuItems.id,
          name: menuItems.name,
          price: menuItems.price,
          categoryId: menuItems.categoryId,
          stationId: menuItems.stationId,
          available: menuItems.isAvailable,
        })
        .from(menuItems)
        .where(eq(menuItems.isAvailable, true));

      const cats = await db.select().from(categories).where(eq(categories.active, true));

      return json({
        success: true,
        data: {
          categories: cats.map((c) => c.name),
          items: items.map((i) => ({
            id: i.id.toString(),
            name: i.name,
            price: parseFloat(i.price),
            category: cats.find((c) => c.id === i.categoryId)?.name || 'General',
            available: i.available,
          })),
        },
      });
    } catch (err: any) {
      return errorJson(err.message || 'Failed to load public menu', 500);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // REQUIRE STAFF AUTHENTICATION FOR ALL INTERNAL POS OPERATIONS
  // ─────────────────────────────────────────────────────────────
  const sessionUser = await authenticate(request);
  if (!sessionUser) {
    return errorJson('Unauthorized: Please supply valid Authorization: Bearer <token>', 401);
  }

  try {
    // ───────────────────────────────────────────────────────────
    // 4. FULL MENU & CATEGORIES (Staff POS)
    // ───────────────────────────────────────────────────────────
    if (path === '/api/v1/menu' && method === 'GET') {
      const items = await db.select().from(menuItems);
      const cats = await db.select().from(categories);
      const stns = await db.select().from(stations);

      return json({
        success: true,
        data: {
          categories: cats,
          stations: stns,
          items: items.map((item) => ({
            id: item.id.toString(),
            name: item.name,
            price: parseFloat(item.price),
            category: cats.find((c) => c.id === item.categoryId)?.name || 'Uncategorized',
            station: stns.find((s) => s.id === item.stationId)?.name || 'Kitchen',
            available: item.isAvailable,
          })),
        },
      });
    }

    // ───────────────────────────────────────────────────────────
    // 5. TABLES & FLOOR MAP
    // ───────────────────────────────────────────────────────────
    if (path === '/api/v1/tables' && method === 'GET') {
      const branchId = url.searchParams.get('branchId') || 'br-1';
      const allTables = await db.select().from(tables).where(eq(tables.branchId, branchId));
      const sections = await db.select().from(tableSections).where(eq(tableSections.branchId, branchId));
      const activeOrders = await db.select().from(orders).where(eq(orders.status, 'open'));

      return json({
        success: true,
        data: allTables.map((t) => {
          const currentOrder = activeOrders.find((o) => o.tableId === t.id.toString());
          return {
            id: t.id.toString(),
            number: t.number,
            status: t.status,
            section: sections.find((s) => s.id === t.sectionId)?.name || 'Main',
            orderId: currentOrder ? currentOrder.id.toString() : null,
            customerName: currentOrder?.customerName || null,
          };
        }),
      });
    }

    // Table Transfer
    if (path === '/api/v1/tables/transfer' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { orderId: string; newTableNumber: string };
      if (!body.orderId || !body.newTableNumber) return errorJson('orderId and newTableNumber required');

      const target = await db.select().from(tables).where(eq(tables.number, body.newTableNumber)).limit(1);
      if (!target.length) return errorJson(`Table ${body.newTableNumber} not found`);

      const ord = await db.select().from(orders).where(eq(orders.id, parseInt(body.orderId))).limit(1);
      if (!ord.length) return errorJson('Order not found');

      // Free old table
      if (ord[0].tableId) {
        await db.update(tables).set({ status: 'available' }).where(eq(tables.id, parseInt(ord[0].tableId)));
      }
      // Occupy new table and point order
      await db.update(tables).set({ status: 'occupied' }).where(eq(tables.id, target[0].id));
      await db.update(orders).set({ tableId: target[0].id.toString() }).where(eq(orders.id, parseInt(body.orderId)));

      return json({ success: true, message: `Order transferred to Table ${body.newTableNumber}` });
    }

    // ───────────────────────────────────────────────────────────
    // 6. ORDERS & BILLING
    // ───────────────────────────────────────────────────────────
    // List Active Orders
    if (path === '/api/v1/orders/active' && method === 'GET') {
      const open = await db.select().from(orders).where(eq(orders.status, 'open')).orderBy(desc(orders.createdAt));
      return json({ success: true, data: open });
    }

    // Create New Order
    if (path === '/api/v1/orders' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as {
        type: 'dine-in' | 'takeaway';
        tableNumber?: string;
        customerName?: string;
        customerPhone?: string;
        branchId?: string;
      };

      let tableId: string | null = null;
      if (body.type === 'dine-in' && body.tableNumber) {
        const t = await db.select().from(tables).where(eq(tables.number, body.tableNumber)).limit(1);
        if (t.length) {
          tableId = t[0].id.toString();
          await db.update(tables).set({ status: 'occupied' }).where(eq(tables.id, t[0].id));
        }
      }

      const branchId = body.branchId || 'br-1';
      const customerId = await resolveCustomer(body.customerName, body.customerPhone, branchId);

      const [newOrder] = await db
        .insert(orders)
        .values({
          type: body.type || 'dine-in',
          tableId,
          customerName: body.customerName || 'Walk-in Guest',
          customerPhone: body.customerPhone || null,
          customerId,
          branchId,
          status: 'open',
          total: '0.00',
        })
        .returning();

      return json({ success: true, data: newOrder });
    }

    // Single Order Details with Lines
    const orderDetailsMatch = path.match(/^\/api\/v1\/orders\/(\d+)$/);
    if (orderDetailsMatch && method === 'GET') {
      const orderId = parseInt(orderDetailsMatch[1]);
      const ord = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!ord.length) return errorJson('Order not found', 404);

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

      return json({
        success: true,
        data: {
          ...ord[0],
          items,
        },
      });
    }

    // Append Dishes to Order
    const addItemsMatch = path.match(/^\/api\/v1\/orders\/(\d+)\/items$/);
    if (addItemsMatch && method === 'POST') {
      const orderId = parseInt(addItemsMatch[1]);
      const body = (await request.json().catch(() => ({}))) as {
        items: Array<{ menuItemId: number; quantity: number; notes?: string }>;
      };

      if (!body.items || !body.items.length) return errorJson('items array is required');

      for (const item of body.items) {
        const dish = await db.select().from(menuItems).where(eq(menuItems.id, item.menuItemId)).limit(1);
        if (dish.length) {
          await db.insert(orderItems).values({
            orderId,
            menuItemId: item.menuItemId,
            quantity: item.quantity || 1,
            unitPrice: dish[0].price,
            notes: item.notes || null,
            status: 'pending',
          });
        }
      }

      // Recalculate order total
      const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      const total = lines.reduce((acc, l) => acc + l.quantity * parseFloat(l.unitPrice), 0);
      await db.update(orders).set({ total: total.toFixed(2), subtotal: total.toFixed(2) }).where(eq(orders.id, orderId));

      return json({ success: true, message: 'Items added to order', newTotal: total });
    }

    // Settle / Pay Order
    const payOrderMatch = path.match(/^\/api\/v1\/orders\/(\d+)\/pay$/);
    if (payOrderMatch && method === 'POST') {
      const orderId = parseInt(payOrderMatch[1]);
      const body = (await request.json().catch(() => ({}))) as { paymentMethod: string }; // 'cash' | 'card' | 'upi'
      const ord = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!ord.length) return errorJson('Order not found', 404);

      const m = await db
        .select()
        .from(paymentMethods)
        .where(sql`lower(${paymentMethods.name}) = lower(${body.paymentMethod || 'cash'})`)
        .limit(1);
      const methodId = m.length ? m[0].id : 1;
      const methodType = m.length ? m[0].type : 'cash';

      const totalAmt = parseFloat(ord[0].total);

      await db.transaction(async (tx) => {
        await tx.update(orders).set({ status: 'paid', paymentMethodId: methodId }).where(eq(orders.id, orderId));

        if (ord[0].tableId) {
          await tx.update(tables).set({ status: 'available' }).where(eq(tables.id, parseInt(ord[0].tableId)));
        }
      });

      return json({
        success: true,
        message: 'Order successfully settled and closed',
        data: { orderId, amount: totalAmt, paymentMethod: body.paymentMethod || 'cash' },
      });
    }

    // ───────────────────────────────────────────────────────────
    // 7. KITCHEN DISPLAY SYSTEM (KDS)
    // ───────────────────────────────────────────────────────────
    if (path === '/api/v1/kds' && method === 'GET') {
      const activeTickets = await db
        .select({
          itemId: orderItems.id,
          orderId: orders.id,
          orderType: orders.type,
          tableId: orders.tableId,
          tableNumber: tables.number,
          dishName: menuItems.name,
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

      return json({ success: true, data: activeTickets });
    }

    if (path === '/api/v1/kds/status' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as {
        itemId: number;
        status: 'pending' | 'cooking' | 'ready' | 'served';
      };
      if (!body.itemId || !body.status) return errorJson('itemId and status required');

      await db.update(orderItems).set({ status: body.status }).where(eq(orderItems.id, body.itemId));
      return json({ success: true, message: `Item updated to ${body.status}` });
    }

    // ───────────────────────────────────────────────────────────
    // 8. SHIFT MANAGEMENT
    // ───────────────────────────────────────────────────────────
    if (path === '/api/v1/shift/status' && method === 'GET') {
      const branchId = url.searchParams.get('branchId') || 'br-1';
      const shift = await db
        .select()
        .from(shifts)
        .where(and(eq(shifts.branchId, branchId), eq(shifts.status, 'open')))
        .orderBy(desc(shifts.id))
        .limit(1);

      return json({
        success: true,
        data: {
          isActive: shift.length > 0,
          shift: shift[0] || null,
        },
      });
    }

    if (path === '/api/v1/shift/open' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { openingCash: number; branchId?: string };
      const branchId = body.branchId || 'br-1';

      const [newShift] = await db
        .insert(shifts)
        .values({
          branchId,
          openedBy: sessionUser.id,
          openingCash: (body.openingCash || 0).toString(),
          status: 'open',
        })
        .returning();

      return json({ success: true, data: newShift });
    }

    if (path === '/api/v1/shift/close' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as {
        closingCash: number;
        expectedCash: number;
        variance: number;
        branchId?: string;
      };
      const branchId = body.branchId || 'br-1';

      const open = await db
        .select()
        .from(shifts)
        .where(and(eq(shifts.branchId, branchId), eq(shifts.status, 'open')))
        .orderBy(desc(shifts.id))
        .limit(1);

      if (!open.length) return errorJson('No active shift found');

      await db
        .update(shifts)
        .set({
          status: 'closed',
          closedAt: new Date(),
          closingCash: (body.closingCash || 0).toString(),
          expectedCash: (body.expectedCash || 0).toString(),
          variance: (body.variance || 0).toString(),
        })
        .where(eq(shifts.id, open[0].id));

      return json({ success: true, message: 'Shift closed successfully' });
    }

    // ───────────────────────────────────────────────────────────
    // 9. CUSTOMER VIP CRM
    // ───────────────────────────────────────────────────────────
    if (path === '/api/v1/customers/lookup' && method === 'GET') {
      const query = url.searchParams.get('query') || '';
      if (!query) return errorJson('query parameter is required');
      const profile = await getCustomerProfile(query);
      return json({ success: true, data: profile });
    }

    // ───────────────────────────────────────────────────────────
    // 10. AI ASSISTANT & VOICE ORDERING
    // ───────────────────────────────────────────────────────────
    if (path === '/api/v1/ai/chat' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { message: string; history?: any[] };
      if (!body.message) return errorJson('message is required');

      // Call internal chat function
      const { chatFn } = await import('../lib/chat');
      const result = await chatFn({ data: { message: body.message, history: body.history } });
      return json({ success: true, data: result });
    }

    return errorJson(`API Endpoint '${method} ${path}' not found`, 404);
  } catch (err: any) {
    console.error('Unified API Error:', err);
    return errorJson(err.message || 'Internal Server Error', 500);
  }
}

