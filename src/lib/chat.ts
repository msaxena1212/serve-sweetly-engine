// POS assistant. Answers questions from live data, and proposes bookings, waitlist entries and
// checkouts. A proposal is only written to the database after the user confirms it.
import { createServerFn } from '@tanstack/react-start';
import { sql, eq, and } from 'drizzle-orm';
import { db } from './db/db';
import { getSessionServer } from './auth-rpc';
import { resolveCustomer } from './customers.server';
import { computeProfitability } from './profit.server';
import { menuItems, categories, tables, orders, orderItems, reservations, paymentMethods } from './db/schema';

type Pending = { kind: 'book_table' | 'waitlist' | 'seat_walkin' | 'checkout' | 'order_items'; params: Record<string, any>; summary: string };
type ChatTurn = { role: 'user' | 'assistant'; content: string };

async function requireStaff() {
  const session = await getSessionServer();
  if (!session) throw new Error('Please log in first');
  return session;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function extractJson(raw: string): any {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}

  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch {}
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {}
  }

  throw new Error(`Unparseable model JSON: ${trimmed.slice(0, 100)}`);
}

// Accepts "3", "T3", "t3" or "P3" and returns the table as stored (for example "T3").
function resolveTable<T extends { number: string }>(list: T[], input: string): T | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  return list.find((t) => t.number.toLowerCase() === s)
    ?? list.find((t) => t.number.toLowerCase() === 't' + s)
    ?? list.find((t) => t.number.toLowerCase() === 'p' + s)
    ?? list.find((t) => t.number.toLowerCase() === 'b' + s)
    ?? null;
}
const normPhone = (p: string) => {
  const d = p.replace(/\D/g, '');
  return d.length === 10 ? d : null;
};

function getOllamaKeys(): string[] {
  const k1 = process.env.OLLAMA_API_KEY?.trim();
  const k2 = process.env.OLLAMA_API_KEY2?.trim();
  const keys = [k1, k2].filter((k): k is string => Boolean(k));
  if (keys.length === 0) throw new Error('OLLAMA_API_KEY is not set in .env.local');
  return keys;
}

async function askModel(system: string, user: string, history: ChatTurn[]): Promise<string> {
  const host = process.env.OLLAMA_HOST || 'https://ollama.com';
  const keys = getOllamaKeys();
  const model = process.env.OLLAMA_MODEL || 'gemma4:31b-cloud';

  let lastError: Error | null = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const res = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: system },
            ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        throw new Error(`Assistant error with key #${i + 1} (${res.status})`);
      }

      const data = (await res.json()) as { message?: { content?: string } };
      const content = data.message?.content ?? '';
      if (!content.trim()) {
        throw new Error(`Assistant key #${i + 1} returned empty content`);
      }

      return content;
    } catch (err: any) {
      console.warn(`Assistant attempt with key #${i + 1} failed: ${err?.message || err}. Failing over to next key...`);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('Assistant unavailable across all keys');
}

async function snapshot() {
  const menu = await db
    .select({ name: menuItems.name, price: menuItems.price, available: menuItems.isAvailable, category: categories.name })
    .from(menuItems)
    .leftJoin(categories, eq(categories.id, menuItems.categoryId))
    .limit(200);
  const tbls = (await db.execute(sql`select id, number, status, capacity from tables order by number`)) as unknown as { id: number; number: string; status: string; capacity: number }[];
  const open = await db
    .select({ id: orders.id, tableId: orders.tableId, type: orders.type, total: orders.total })
    .from(orders)
    .where(eq(orders.status, 'open'))
    .limit(60);
  const methods = await db.select({ name: paymentMethods.name }).from(paymentMethods).where(eq(paymentMethods.active, true));

  // Live figures, read from the database only. Dates use the database's current date.
  const [today] = (await db.execute(sql`
    select
      (select count(*)::int from orders where status in ('paid','completed') and created_at::date = current_date) as orders_today,
      (select coalesce(sum(oi.quantity * oi.unit_price), 0)::float from order_items oi join orders o on o.id = oi.order_id
         where o.status in ('paid','completed') and o.created_at::date = current_date) as sales_today,
      (select coalesce(sum(oi.quantity * oi.unit_price), 0)::float from order_items oi join orders o on o.id = oi.order_id
         where o.status in ('paid','completed') and o.created_at::date between current_date - 6 and current_date) as sales_last_7_days,
      (select count(*)::int from orders where status = 'open') as open_orders,
      (select count(*)::int from reservations where status = 'waiting') as waiting_guests,
      (select count(*)::int from inventory where quantity <= min_quantity) as low_stock_items`)) as unknown as Record<string, number>[];
  const topToday = (await db.execute(sql`
    select m.name, sum(oi.quantity)::int as units, sum(oi.quantity * oi.unit_price)::float as sales
    from order_items oi join orders o on o.id = oi.order_id join menu_items m on m.id = oi.menu_item_id
    where o.status in ('paid','completed') and o.created_at::date = current_date
    group by m.name order by sales desc limit 5`)) as unknown as { name: string; units: number; sales: number }[];
  const paymentsToday = (await db.execute(sql`
    select payment_mode as method, count(*)::int as count, sum(amount)::float as amount
    from payments where status = 'completed' and paid_at::date = current_date group by payment_mode order by amount desc`)) as unknown as { method: string; count: number; amount: number }[];
  const lowStock = (await db.execute(sql`
    select name, quantity::float as on_hand, min_quantity::float as minimum from inventory
    where quantity <= min_quantity order by name limit 10`)) as unknown as { name: string; on_hand: number; minimum: number }[];
  // Profitability for the last 7 days, from the same calculation as the Profit report.
  const [range] = (await db.execute(sql`select (current_date - 6)::text as f, current_date::text as t`)) as unknown as { f: string; t: string }[];
  const profit7 = await computeProfitability(range.f, range.t);
  const reports = {
    ordersToday: Number(today?.orders_today ?? 0),
    salesToday: Math.round(Number(today?.sales_today ?? 0) * 100) / 100,
    salesLast7Days: Math.round(Number(today?.sales_last_7_days ?? 0) * 100) / 100,
    openOrders: Number(today?.open_orders ?? 0),
    waitingGuests: Number(today?.waiting_guests ?? 0),
    lowStockItems: Number(today?.low_stock_items ?? 0),
    lowStock,
    topItemsToday: topToday,
    paymentsToday,
    profitLast7Days: {
      revenue: profit7.summary.revenue,
      foodCost: profit7.summary.foodCost,
      grossProfit: profit7.summary.grossProfit,
      grossMarginPct: profit7.summary.marginPct,
      lowestMarginDishes: profit7.byDish.filter((d) => d.units > 0 && d.marginPct !== null).sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0)).slice(0, 5).map((d) => ({ dish: d.dish, marginPct: d.marginPct })),
      note: profit7.coverage.note,
    },
  };
  // Stock, recipes and purchasing, for questions about ingredients and orders.
  const inventory = (await db.execute(sql`
    select name, unit, quantity::float as qty, min_quantity::float as minimum from inventory order by name limit 250`)) as unknown as { name: string; unit: string; qty: number; minimum: number }[];
  const recipeRows = (await db.execute(sql`
    select m.name as dish, i.name as ingredient, i.unit, b.quantity::float as qty
    from recipe_bom b join menu_items m on m.id = b.menu_item_id join inventory i on i.id = b.inventory_id
    order by m.name, i.name`)) as unknown as { dish: string; ingredient: string; unit: string; qty: number }[];
  const recipes: Record<string, string[]> = {};
  for (const r of recipeRows) (recipes[r.dish] ??= []).push(`${r.ingredient} ${r.qty} ${r.unit}`);
  const purchases = (await db.execute(sql`
    select po.po_number, po.invoice_number, s.name as supplier, po.status, po.total_amount::float as total,
           (po.created_at)::date::text as date
    from purchase_orders po join suppliers s on s.id = po.supplier_id order by po.created_at desc limit 15`)) as unknown as Record<string, unknown>[];
  const [supplierCount] = (await db.execute(sql`select count(*)::int as n from suppliers`)) as unknown as { n: number }[];
  // Live POS state: open bills with their lines, the waiting list and bookings, the open shift, kitchen progress.
  const openBills = (await db.execute(sql`
    select o.id, o.type, o.total::float as total, o.customer_name, t.number as table_no,
           coalesce(string_agg(m.name || ' x' || oi.quantity || ' (' || oi.status || ')', ', ' order by m.name), '') as items
    from orders o
    left join tables t on t.id::text = o.table_id
    left join order_items oi on oi.order_id = o.id
    left join menu_items m on m.id = oi.menu_item_id
    where o.status = 'open'
    group by o.id, t.number order by o.created_at desc limit 60`)) as unknown as Record<string, unknown>[];
  const queue = (await db.execute(sql`
    select type, status, customer_name, customer_phone, pax, reservation_time, table_id, created_at::text as booked_at
    from reservations where status in ('waiting') order by created_at limit 60`)) as unknown as Record<string, unknown>[];
  const [shift] = (await db.execute(sql`
    select id, status, opening_cash::float as opening_cash, opened_at::text as opened_at
    from shifts where status = 'open' order by id desc limit 1`)) as unknown as Record<string, unknown>[];
  const kitchen = (await db.execute(sql`
    select oi.status, count(*)::int as items from order_items oi join orders o on o.id = oi.order_id
    where o.status = 'open' group by oi.status`)) as unknown as Record<string, unknown>[];
  return { menu, tbls, open, methods, reports, inventory, recipes, purchases, supplierCount: supplierCount.n, openBills, queue, shift: shift ?? null, kitchen };
}

const SYSTEM = (ctx: string) => `You are the assistant for a restaurant POS. Staff and managers talk to you.
Answer only from the data below. Never invent dishes, prices, table states, bookings, sales or stock figures.
For sales, orders, revenue, payments, top items and waiting guests, answer from the "reports" object and quote the figures exactly.
For stock and ingredients use "inventory" (inStock, minimum, low). For how a dish is made use "recipes". For suppliers and purchase orders use "recentPurchases" and "suppliers". For menu items and prices use "menu". For open bills, what is on them and their status use "openBillDetails" (table_no is the table name, items lists each line and its kitchen status). "openBills" is a short summary of the same bills. For walk-ins and bookings use "waitingListAndBookings" (type waitlist or advance). For the shift use "openShift". For kitchen progress use "kitchenItemsByStatus". Quote exact names and figures. If a figure is not in the data, say it is not available yet.
Format replies with short paragraphs, and "-" bullets for lists.
Reply with a JSON object: {"reply": string, "intent": "answer"|"book_table"|"waitlist"|"seat_walkin"|"checkout"|"order_items", "params": object}.
- Questions about the menu, prices, availability, tables or open orders: intent "answer", params {}.
- Seating a walk-in guest at a table right now (e.g. "Seat walk-in party of 4", "Walk-in 2 guests", "Walk-in customer needs a table", "Seat walk-in at Table 2", "Walk-in booking for Table T3"): intent "seat_walkin", params {"table"?: string, "pax": number, "name"?: string, "phone"?: string}. If no table is specified, pick the best free available table from tables.
- Booking a table for a later time: intent "book_table", params {"name","phone","pax","time" (HH:MM, 24h),"table" (optional table number)}.
- Adding a guest to the walk-in waitlist (e.g. "I want a table now", "add to waitlist", "put on waitlist"): intent "waitlist", params {"name","phone","pax"}.
- Taking payment for a table's open bill: intent "checkout", params {"table","method" (one of the payment methods below)}.
- Ordering or adding dishes to a table (e.g. "Add 2 Margheritas and 1 Coke to Table 4", "Table T2 wants 1 Iced Latte with oat milk and half sweet", "Order 2 Tiramisu for T5"): intent "order_items", params {"table": string, "items": [{"name": string, "qty": number, "notes"?: string}]}. Match dish names to the menu, and ALWAYS extract modifiers, beverage customizations, allergies, or spice levels (e.g. "oat milk", "almond milk", "extra spicy", "less ice", "no onion", "half sweet", "extra cheese") into the item's "notes" field.
Support English, Hindi, and Hinglish phrasing seamlessly. Waitstaff often say:
- "Table 2 pe 2 butter naan aur ek dal daal do" -> intent "order_items" for table 2
- "Table 3 ka bill cash se settle karo" -> intent "checkout" for table 3 with cash
- "T1 pe ek coke aur ek burger add karo" -> intent "order_items" for table 1
- "Table khali hai kya?" / "Kaunse table free hain?" -> intent "answer", list available tables
- "Walk-in 4 log ke liye table do" -> intent "seat_walkin", params: {"pax": 4}
Map Hindi number words to integers (ek=1, do=2, teen=3, chaar=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, dus=10).
If a detail is missing, or if the user confirms with "yes do it", "sure", "proceed", or requests a walk-in table, generate the "seat_walkin" or "waitlist" intent with sensible defaults so a 1-click confirmation card is provided.
Keep replies short and friendly.

DATA:
${ctx}`;

export const chatFn = createServerFn({ method: 'POST' })
  .validator((d: { message: string; history?: ChatTurn[] }) => d)
  .handler(async ({ data }) => {
    const session = await requireStaff();
    const message = (data.message ?? '').trim().slice(0, 1000);
    if (!message) throw new Error('Type a message first');

    const snap = await snapshot();
    const ctx = JSON.stringify({
      menu: snap.menu.map((m) => ({ name: m.name, price: Number(m.price), category: m.category, available: m.available })),
      tables: snap.tbls.map((t) => ({ table: t.number, status: t.status, seats: t.capacity })),
      openBills: snap.open.map((o) => ({ table: snap.tbls.find((t) => String(t.id) === o.tableId)?.number ?? null, type: o.type, total: Number(o.total) })),
      paymentMethods: snap.methods.map((m) => m.name),
      reports: snap.reports,
      inventory: snap.inventory.map((i) => ({ item: i.name, unit: i.unit, inStock: i.qty, minimum: i.minimum, low: i.qty <= i.minimum })),
      recipes: snap.recipes,
      recentPurchases: snap.purchases,
      suppliers: snap.supplierCount,
      openBillDetails: snap.openBills,
      waitingListAndBookings: snap.queue,
      openShift: snap.shift,
      kitchenItemsByStatus: snap.kitchen,
    });

    let parsed: { reply?: string; intent?: string; params?: Record<string, string | number> } = {};
    try {
      const raw = await askModel(SYSTEM(ctx), message, data.history ?? []);
      parsed = extractJson(raw);
    } catch (err) {
      console.warn('Chat askModel / parse fallback:', err);
      const lowerMsg = message.toLowerCase().trim();
      const isAffirmative = /^(yes|yes do it|do it|sure|ok|okay|please|confirm|add me|book it|reserve it|i want it now)$/i.test(lowerMsg);
      const lastBotMsg = (data.history ?? []).slice(-1)[0]?.content?.toLowerCase() ?? '';
      if (isAffirmative && (lastBotMsg.includes('waitlist') || lastBotMsg.includes('table'))) {
        parsed = {
          reply: "I've set up your walk-in waitlist request.",
          intent: 'waitlist',
          params: { name: session?.name || 'Walk-in Guest', pax: 2, phone: '9800000000' },
        };
      } else {
        return { reply: 'Sorry, I could not work that out. Try rephrasing, or use the screen for this.', pending: null as Pending | null };
      }
    }
    const reply = String(parsed.reply ?? 'Done.');
    const p = parsed.params ?? {};

    if (parsed.intent === 'book_table' || parsed.intent === 'waitlist') {
      let name = String(p.name ?? '').trim();
      let phone = normPhone(String(p.phone ?? ''));
      let pax = Number(p.pax);

      if (!name || name === 'undefined' || name === 'null' || name.toLowerCase() === 'you') {
        name = session?.name ? session.name : 'Walk-in Guest';
      }
      if (!pax || isNaN(pax) || pax < 1 || pax > 50) {
        pax = 2;
      }
      if (!phone) {
        const histPhone = (data.history ?? []).map((h) => h.content).join(' ').match(/\b\d{10}\b/);
        phone = histPhone ? histPhone[0] : '9800000000';
      }

      if (parsed.intent === 'book_table') {
        let time = String(p.time ?? '');
        if (!TIME.test(time)) {
          const d = new Date();
          d.setHours(d.getHours() + 1);
          time = `${String(d.getHours()).padStart(2, '0')}:00`;
        }
        const resolved = p.table ? resolveTable(snap.tbls, String(p.table)) : null;
        if (p.table && !resolved) return { reply: `There is no table ${p.table}.`, pending: null };
        const table = resolved?.number ?? '';
        const pending: Pending = {
          kind: 'book_table',
          params: { name, phone, pax, time, table },
          summary: `Book a table for ${pax} guest(s) at ${time} for ${name} (${phone})${table ? `, table ${table}` : ''}.`,
        };
        return { reply: `${reply}\n\nPlease confirm the reservation below:`, pending };
      }
      const pending: Pending = {
        kind: 'waitlist',
        params: { name, phone, pax },
        summary: `Add ${name} (${pax} guest${pax > 1 ? 's' : ''}, ph: ${phone}) to the walk-in waitlist.`,
      };
      return { reply: `${reply}\n\nPlease confirm adding to waitlist below:`, pending };
    }

    if (parsed.intent === 'seat_walkin') {
      let name = String(p.name ?? '').trim();
      let phone = normPhone(String(p.phone ?? ''));
      let pax = Math.max(1, Math.min(20, Number(p.pax) || 2));

      if (!name || name === 'undefined' || name === 'null' || name.toLowerCase() === 'you') {
        name = session?.name ? session.name : 'Walk-in Guest';
      }
      if (!phone) {
        const histPhone = (data.history ?? []).map((h) => h.content).join(' ').match(/\b\d{10}\b/);
        phone = histPhone ? histPhone[0] : '9800000000';
      }

      let targetTable = p.table ? resolveTable(snap.tbls, String(p.table)) : null;
      if (!targetTable) {
        const availableTables = snap.tbls.filter((t) => t.status === 'available');
        if (availableTables.length === 0) {
          const pendingWaitlist: Pending = {
            kind: 'waitlist',
            params: { name, phone, pax },
            summary: `All tables are currently occupied. Add ${name} (${pax} guests) to the walk-in waitlist.`,
          };
          return {
            reply: `All tables are currently occupied right now. Would you like me to add ${name} (${pax} guests) to our walk-in waitlist instead?`,
            pending: pendingWaitlist,
          };
        }
        targetTable = availableTables.find((t) => t.capacity >= pax) || availableTables[0];
      }

      const pending: Pending = {
        kind: 'seat_walkin',
        params: {
          table: targetTable.number,
          tableId: targetTable.id,
          name,
          phone,
          pax,
        },
        summary: `Seat walk-in party of ${pax} (Guest: ${name}) at Table ${targetTable.number} right now.`,
      };
      return {
        reply: `${reply}\n\nPlease confirm seating the walk-in party at Table ${targetTable.number}:`,
        pending,
      };
    }

    if (parsed.intent === 'checkout') {
      const table = String(p.table ?? '');
      const method = String(p.method ?? '');
      const found = resolveTable(snap.tbls, table);
      if (!found) return { reply: 'Which table should I settle?', pending: null };
      const m = snap.methods.find((x) => x.name.toLowerCase() === method.toLowerCase());
      if (!m) return { reply: `Which payment method? Options: ${snap.methods.map((x) => x.name).join(', ')}.`, pending: null };
      const bill = snap.open.find((o) => o.tableId === String(found.id));
      if (!bill) return { reply: `Table ${table} has no open bill.`, pending: null };
      const pending: Pending = {
        kind: 'checkout',
        params: { table: found.number, method: m.name },
        summary: `Settle the bill on table ${table} (${Number(bill.total).toFixed(2)}) by ${m.name}.`,
      };
      return { reply: `${reply}\n\nPlease confirm the payment below.`, pending };
    }

    if (parsed.intent === 'order_items') {
      const table = String(p.table ?? '');
      const found = resolveTable(snap.tbls, table);
      if (!found) return { reply: 'Which table should I place or add the order for? (e.g. T1, P2)', pending: null };
      const rawItems = Array.isArray(p.items) ? p.items : [];
      if (!rawItems.length) return { reply: `Which dishes should I add to table ${found.number}?`, pending: null };

      const matchedItems: Array<{ name: string; price: number; qty: number; notes?: string }> = [];
      const missing: string[] = [];
      for (const item of rawItems) {
        const dishName = String(item.name ?? '').trim().toLowerCase();
        const qty = Math.max(1, Math.min(50, Number(item.qty) || 1));
        const notes = item.notes ? String(item.notes).trim() : undefined;
        const matched = snap.menu.find((m) => m.name.toLowerCase() === dishName)
          ?? snap.menu.find((m) => m.name.toLowerCase().includes(dishName) || dishName.includes(m.name.toLowerCase()));
        if (matched) {
          matchedItems.push({ name: matched.name, price: Number(matched.price), qty, notes });
        } else {
          missing.push(String(item.name ?? ''));
        }
      }

      if (matchedItems.length === 0) {
        return { reply: `I couldn't match those dishes on the menu. Could you check the names?`, pending: null };
      }

      const totalCost = matchedItems.reduce((acc, i) => acc + i.price * i.qty, 0);
      const itemsList = matchedItems.map((i) => `${i.qty}x ${i.name}${i.notes ? ` (${i.notes})` : ''}`).join(', ');
      const pending: Pending = {
        kind: 'order_items',
        params: { table: found.number, items: matchedItems, totalCost },
        summary: `Add to Table ${found.number}: ${itemsList} (Est: ₹${totalCost.toFixed(2)}).`,
      };
      const note = missing.length ? ` (Could not match: ${missing.join(', ')}).` : '';
      return { reply: `${reply}${note}\n\nPlease confirm sending this order to the kitchen.`, pending };
    }

    return { reply, pending: null as Pending | null };
  });

// Writes the proposal. Re-validates everything, because the browser could send anything.
export const confirmChatActionFn = createServerFn({ method: 'POST' })
  .validator((d: { pending: Pending }) => d)
  .handler(async ({ data }) => {
    await requireStaff();
    const pending = data.pending;
    const p = pending.params;
    const name = String(p.name ?? '').trim().slice(0, 60) || 'Walk-in Guest';
    const phone = normPhone(String(p.phone ?? '')) || '9800000000';
    const pax = Math.max(1, Math.min(20, Number(p.pax) || 2));

    if (pending.kind === 'waitlist' || pending.kind === 'book_table') {
      const customerId = await resolveCustomer(name, phone, 'br-1');
      if (pending.kind === 'waitlist') {
        await db.insert(reservations).values({ branchId: 'br-1', type: 'waitlist', status: 'waiting', customerName: name, customerPhone: phone, pax, customerId });
        return { message: `${name} is on the waitlist for ${pax}.` };
      }
      const time = String(p.time ?? '');
      if (!TIME.test(time)) throw new Error('Booking time is invalid');
      const table = p.table ? String(p.table) : '';
      let tableId: string | null = null;
      if (table) {
        const t = await db.select({ id: tables.id }).from(tables).where(eq(tables.number, table)).limit(1);
        if (!t.length) throw new Error(`No table ${table}`);
        tableId = String(t[0].id);
      }
      await db.insert(reservations).values({ branchId: 'br-1', type: 'advance', status: 'waiting', customerName: name, customerPhone: phone, pax, reservationTime: time, tableId, customerId });
      return { message: `Booked ${pax} guests for ${time} under ${name}.` };
    }

    // seat_walkin
    if (pending.kind === 'seat_walkin') {
      const tableNumber = String(p.table ?? '');
      const t = await db.select({ id: tables.id, number: tables.number }).from(tables).where(eq(tables.number, tableNumber)).limit(1);
      if (!t.length) throw new Error(`Table ${tableNumber} does not exist`);
      const tableId = String(t[0].id);

      await db.update(tables).set({ status: 'occupied' }).where(eq(tables.id, t[0].id));
      const customerId = await resolveCustomer(name, phone, 'br-1');

      const open = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.tableId, tableId), eq(orders.status, 'open'))).limit(1);
      if (!open.length) {
        await db.insert(orders).values({
          tableId,
          type: 'dine-in',
          status: 'open',
          customerName: name,
          customerId,
          customerPhone: phone,
          branchId: 'br-1',
          total: '0.00',
        });
      } else {
        await db.update(orders).set({ customerName: name, customerId, customerPhone: phone }).where(eq(orders.id, open[0].id));
      }

      await db.insert(reservations).values({
        branchId: 'br-1',
        type: 'walkin',
        status: 'seated',
        customerName: name,
        customerPhone: phone,
        pax,
        tableId,
        customerId,
      });

      return { message: `Table ${tableNumber} is now occupied and assigned to ${name} (${pax} guests).` };
    }

    // checkout
    if (pending.kind === 'checkout') {
      const table = String(p.table ?? '');
      const method = String(p.method ?? '');
      const t = await db.select({ id: tables.id, number: tables.number }).from(tables).where(eq(tables.number, table)).limit(1);
      if (!t.length) throw new Error(`No table ${table}`);
      const m = await db.select().from(paymentMethods).where(sql`lower(${paymentMethods.name}) = lower(${method})`).limit(1);
      if (!m.length) throw new Error('Unknown payment method');
      const open = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.tableId, String(t[0].id)), eq(orders.status, 'open'))).limit(1);
      if (!open.length) throw new Error(`Table ${table} has no open bill`);
      const orderId = open[0].id;

      await db.transaction(async (tx) => {
        const lines = (await tx.execute(sql`select coalesce(sum(quantity * unit_price), 0)::text as total from order_items where order_id = ${orderId}`)) as unknown as { total: string }[];
        const amount = Number(lines[0].total);
        if (!(amount > 0)) throw new Error('This bill has no items to pay');
        await tx.execute(sql`update orders set subtotal = ${amount}, total = ${amount}, status = 'paid', payment_method_id = ${m[0].id} where id = ${orderId}`);
        await tx.execute(sql`update order_items set is_locked = true where order_id = ${orderId}`);
        await tx.update(tables).set({ status: 'available' }).where(eq(tables.id, t[0].id));
        await tx.execute(sql`insert into payments (order_id, payment_method_id, payment_mode, amount, gateway_reference, status)
          values (${orderId}, ${m[0].id}, ${m[0].type}, ${amount}, ${'TXN-' + Date.now() + '-' + orderId}, 'completed')`);
        const pay = await tx.execute(sql`select id from payments where order_id = ${orderId} order by id desc limit 1`);
        await tx.execute(sql`insert into receipts (order_id, payment_id) values (${orderId}, ${(pay[0] as { id: number }).id})`);
      });
      return { message: `Table ${table} is paid and the receipt is printed.` };
    }

    if (pending.kind === 'order_items') {
      const tableNumber = String(p.table ?? '');
      const t = await db.select({ id: tables.id, number: tables.number }).from(tables).where(eq(tables.number, tableNumber)).limit(1);
      if (!t.length) throw new Error(`Table ${tableNumber} does not exist`);
      const tableId = String(t[0].id);

      const open = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.tableId, tableId), eq(orders.status, 'open'))).limit(1);
      let orderId: number;
      if (!open.length) {
        const [newOrd] = await db.insert(orders).values({
          tableId,
          type: 'dine-in',
          status: 'open',
          branchId: 'br-1',
          total: '0.00',
        }).returning({ id: orders.id });
        orderId = newOrd.id;
        await db.update(tables).set({ status: 'occupied' }).where(eq(tables.id, t[0].id));
      } else {
        orderId = open[0].id;
      }

      const items = Array.isArray(p.items) ? p.items : [];
      let addedCount = 0;
      for (const item of items) {
        const m = await db.select({ id: menuItems.id, price: menuItems.price }).from(menuItems).where(sql`lower(${menuItems.name}) = lower(${String(item.name)})`).limit(1);
        if (m.length) {
          await db.insert(orderItems).values({
            orderId,
            menuItemId: m[0].id,
            quantity: Math.max(1, Number(item.qty) || 1),
            status: 'pending',
            notes: item.notes ? String(item.notes) : null,
          });
          addedCount++;
        }
      }

      const lines = (await db.execute(sql`
        select coalesce(sum(oi.quantity * m.price), 0)::float as total
        from order_items oi
        join menu_items m on m.id = oi.menu_item_id
        where oi.order_id = ${orderId}
      `)) as unknown as { total: number }[];
      const total = Number(lines[0]?.total ?? 0);
      await db.update(orders).set({ total: total.toFixed(2) }).where(eq(orders.id, orderId));

      return { message: `Order added to Table ${tableNumber} (${addedCount} items). Total: ₹${total.toFixed(2)}.` };
    }

    throw new Error('Unknown action');
  });
