// Live report queries (server only). Each builder returns rows for a date range (inclusive).
// Reports that need data the app does not record yet return available: false with a reason.
import { createServerFn } from '@tanstack/react-start';
import { sql, type SQL } from 'drizzle-orm';
import { db } from './db/db';
import { getSessionServer } from './auth-rpc';
import { EXTRA_BUILDERS } from './reports-extra';
import { computeProfitability } from './profit.server';

export type ColType = 'text' | 'int' | 'money' | 'pct' | 'date';
export type ReportColumn = { key: string; label: string; type: ColType };
export type ReportRow = Record<string, string | number | null>;
export type ReportSummary = { label: string; value: number; type: ColType };
export type ReportResult = {
  title: string;
  from: string;
  to: string;
  available: boolean;
  message?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: ReportSummary[];
};
type Built = Omit<ReportResult, 'title' | 'from' | 'to'>;
type Row = Record<string, unknown>;

const n = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const share = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);
const run = async (q: SQL) => (await db.execute(q)) as unknown as Row[];

// Paid or completed orders whose order date falls in the range.
const inRange = (from: string, to: string): SQL =>
  sql`o.status in ('paid', 'completed') and (o.created_at)::date between ${from}::date and ${to}::date`;

const col = (key: string, label: string, type: ColType): ReportColumn => ({ key, label, type });
const unavailable = (message: string): Built => ({ available: false, message, columns: [], rows: [], summary: [] });

async function productRows(from: string, to: string) {
  const rows = await run(sql`
    select m.name as product, count(distinct o.id)::int as orders,
           coalesce(sum(oi.quantity), 0)::int as units,
           coalesce(sum(oi.quantity * oi.unit_price), 0)::float as revenue
    from order_items oi
    join orders o on o.id = oi.order_id
    join menu_items m on m.id = oi.menu_item_id
    where ${inRange(from, to)}
    group by m.name order by revenue desc`);
  const total = rows.reduce((a, r) => a + n(r.revenue), 0);
  return rows.map((r) => ({
    product: str(r.product), orders: n(r.orders), units: n(r.units),
    revenue: round2(n(r.revenue)), share: share(n(r.revenue), total),
  }));
}

const PRODUCT_COLS = [col('product', 'Product', 'text'), col('orders', 'Orders', 'int'), col('units', 'Units', 'int'), col('revenue', 'Revenue', 'money')];

const BASE_BUILDERS: Record<string, (from: string, to: string) => Promise<Built>> = {
  'Sales Summary': async (from, to) => {
    const rows = await run(sql`
      select (o.created_at)::date::text as date, count(distinct o.id)::int as orders,
             coalesce(sum(oi.quantity), 0)::int as units,
             coalesce(sum(oi.quantity * oi.unit_price), 0)::float as sales
      from orders o left join order_items oi on oi.order_id = o.id
      where ${inRange(from, to)} group by 1 order by 1`);
    const out = rows.map((r) => ({ date: str(r.date), orders: n(r.orders), units: n(r.units), sales: round2(n(r.sales)) }));
    const total = out.reduce((a, r) => a + r.sales, 0);
    return {
      available: true,
      columns: [col('date', 'Date', 'date'), col('orders', 'Orders', 'int'), col('units', 'Units', 'int'), col('sales', 'Sales', 'money')],
      rows: out,
      summary: [
        { label: 'Orders', value: out.reduce((a, r) => a + r.orders, 0), type: 'int' },
        { label: 'Sales', value: round2(total), type: 'money' },
        { label: 'Average per day', value: out.length ? round2(total / out.length) : 0, type: 'money' },
      ],
    };
  },

  'Sales Trend': async (from, to) => {
    const rows = await run(sql`
      select to_char(date_trunc('month', o.created_at), 'YYYY-MM') as month,
             count(distinct o.id)::int as orders,
             coalesce(sum(oi.quantity * oi.unit_price), 0)::float as sales
      from orders o left join order_items oi on oi.order_id = o.id
      where ${inRange(from, to)} group by 1 order by 1`);
    const out = rows.map((r, i) => {
      const sales = round2(n(r.sales));
      const prev = i > 0 ? n(rows[i - 1].sales) : 0;
      return { month: str(r.month), orders: n(r.orders), sales, avgOrder: n(r.orders) ? round2(sales / n(r.orders)) : 0, growth: i > 0 ? share(sales - prev, prev) : null };
    });
    return {
      available: true,
      columns: [col('month', 'Month', 'text'), col('orders', 'Orders', 'int'), col('sales', 'Sales', 'money'), col('avgOrder', 'Avg order', 'money'), col('growth', 'Growth vs previous month', 'pct')],
      rows: out,
      summary: [{ label: 'Months', value: out.length, type: 'int' }, { label: 'Sales', value: round2(out.reduce((a, r) => a + r.sales, 0)), type: 'money' }],
    };
  },

  'Product Sales Summary': async (from, to) => {
    const rows = await productRows(from, to);
    return {
      available: true,
      columns: [...PRODUCT_COLS, col('share', 'Share', 'pct')],
      rows,
      summary: [{ label: 'Products sold', value: rows.length, type: 'int' }, { label: 'Revenue', value: round2(rows.reduce((a, r) => a + r.revenue, 0)), type: 'money' }],
    };
  },

  'Product Performance': async (from, to) => {
    const rows = (await productRows(from, to)).map((r) => ({ ...r, avgPerOrder: r.orders ? round2(r.revenue / r.orders) : 0 }));
    return {
      available: true,
      columns: [...PRODUCT_COLS, col('avgPerOrder', 'Revenue per order', 'money')],
      rows,
      summary: [{ label: 'Products sold', value: rows.length, type: 'int' }],
    };
  },

  'Top Selling Products Reports': async (from, to) => {
    const rows = (await productRows(from, to)).sort((a, b) => b.units - a.units).slice(0, 10).map((r, i) => ({ rank: i + 1, ...r }));
    return {
      available: true,
      columns: [col('rank', 'Rank', 'int'), col('product', 'Product', 'text'), col('units', 'Units', 'int'), col('revenue', 'Revenue', 'money')],
      rows,
      summary: [{ label: 'Top 10 units', value: rows.reduce((a, r) => a + r.units, 0), type: 'int' }],
    };
  },

  'Sales Category Summary': async (from, to) => {
    const rows = await run(sql`
      select c.name as category, count(distinct o.id)::int as orders,
             coalesce(sum(oi.quantity), 0)::int as units,
             coalesce(sum(oi.quantity * oi.unit_price), 0)::float as revenue
      from order_items oi
      join orders o on o.id = oi.order_id
      join menu_items m on m.id = oi.menu_item_id
      join categories c on c.id = m.category_id
      where ${inRange(from, to)} group by c.name order by revenue desc`);
    const total = rows.reduce((a, r) => a + n(r.revenue), 0);
    return {
      available: true,
      columns: [col('category', 'Category', 'text'), col('orders', 'Orders', 'int'), col('units', 'Units', 'int'), col('revenue', 'Revenue', 'money'), col('share', 'Share', 'pct')],
      rows: rows.map((r) => ({ category: str(r.category), orders: n(r.orders), units: n(r.units), revenue: round2(n(r.revenue)), share: share(n(r.revenue), total) })),
      summary: [{ label: 'Categories', value: rows.length, type: 'int' }, { label: 'Revenue', value: round2(total), type: 'money' }],
    };
  },

  'Sales by Payment Method': async (from, to) => {
    const rows = await run(sql`
      select p.payment_mode as method, count(*)::int as transactions, coalesce(sum(p.amount), 0)::float as amount
      from payments p join orders o on o.id = p.order_id
      where p.status = 'completed' and ${inRange(from, to)}
      group by p.payment_mode order by amount desc`);
    const total = rows.reduce((a, r) => a + n(r.amount), 0);
    return {
      available: true,
      columns: [col('method', 'Payment method', 'text'), col('transactions', 'Transactions', 'int'), col('amount', 'Amount', 'money'), col('share', 'Share', 'pct'), col('avg', 'Avg value', 'money')],
      rows: rows.map((r) => ({
        method: str(r.method), transactions: n(r.transactions), amount: round2(n(r.amount)),
        share: share(n(r.amount), total), avg: n(r.transactions) ? round2(n(r.amount) / n(r.transactions)) : 0,
      })),
      summary: [{ label: 'Payments', value: rows.reduce((a, r) => a + n(r.transactions), 0), type: 'int' }, { label: 'Collected', value: round2(total), type: 'money' }],
    };
  },

  'Sales by Time of Day': async (from, to) => {
    const rows = await run(sql`
      select extract(hour from o.created_at)::int as hour, count(distinct o.id)::int as orders,
             coalesce(sum(oi.quantity * oi.unit_price), 0)::float as sales
      from orders o left join order_items oi on oi.order_id = o.id
      where ${inRange(from, to)} group by 1 order by 1`);
    const total = rows.reduce((a, r) => a + n(r.sales), 0);
    return {
      available: true,
      columns: [col('slot', 'Hour', 'text'), col('orders', 'Orders', 'int'), col('sales', 'Sales', 'money'), col('share', 'Share', 'pct'), col('avg', 'Avg order', 'money')],
      rows: rows.map((r) => ({
        slot: `${String(n(r.hour)).padStart(2, '0')}:00`, orders: n(r.orders), sales: round2(n(r.sales)),
        share: share(n(r.sales), total), avg: n(r.orders) ? round2(n(r.sales) / n(r.orders)) : 0,
      })),
      summary: [{ label: 'Busiest hour sales', value: round2(Math.max(0, ...rows.map((r) => n(r.sales)))), type: 'money' }],
    };
  },

  'Average Basket Value': async (from, to) => {
    const rows = await run(sql`
      select (o.created_at)::date::text as date, count(distinct o.id)::int as orders,
             coalesce(sum(oi.quantity), 0)::int as items,
             coalesce(sum(oi.quantity * oi.unit_price), 0)::float as sales
      from orders o left join order_items oi on oi.order_id = o.id
      where ${inRange(from, to)} group by 1 order by 1`);
    const out = rows.map((r) => ({ date: str(r.date), orders: n(r.orders), items: n(r.items), sales: round2(n(r.sales)), avgBasket: n(r.orders) ? round2(n(r.sales) / n(r.orders)) : 0 }));
    const orders = out.reduce((a, r) => a + r.orders, 0);
    const sales = out.reduce((a, r) => a + r.sales, 0);
    return {
      available: true,
      columns: [col('date', 'Date', 'date'), col('orders', 'Orders', 'int'), col('items', 'Items', 'int'), col('sales', 'Sales', 'money'), col('avgBasket', 'Avg basket', 'money')],
      rows: out,
      summary: [{ label: 'Average basket', value: orders ? round2(sales / orders) : 0, type: 'money' }, { label: 'Transactions', value: orders, type: 'int' }],
    };
  },

  'User Reports': async (from, to) => salesByUser(from, to),
  'Salesperson Performance': async (from, to) => salesByUser(from, to),

  'Branch Sales': async (from, to) => {
    const rows = await run(sql`
      select coalesce(o.branch_id, 'Unassigned') as branch, count(distinct o.id)::int as orders,
             coalesce(sum(oi.quantity * oi.unit_price), 0)::float as sales
      from orders o left join order_items oi on oi.order_id = o.id
      where ${inRange(from, to)} group by 1 order by sales desc`);
    return {
      available: true,
      columns: [col('branch', 'Branch', 'text'), col('orders', 'Orders', 'int'), col('sales', 'Sales', 'money')],
      rows: rows.map((r) => ({ branch: str(r.branch), orders: n(r.orders), sales: round2(n(r.sales)) })),
      summary: [{ label: 'Branches', value: rows.length, type: 'int' }],
    };
  },

  'Customer Purchase History': async (from, to) => {
    const rows = await run(sql`
      select coalesce(c.full_name, o.customer_name) as customer, coalesce(c.phone, o.customer_phone) as phone,
             c.city as city, c.loyalty_tier as tier,
             count(distinct o.id)::int as purchases,
             max((o.created_at)::date)::text as last_purchase,
             coalesce(sum(oi.quantity * oi.unit_price), 0)::float as lifetime_value
      from orders o
      left join customers c on c.id = o.customer_id
      left join order_items oi on oi.order_id = o.id
      where ${inRange(from, to)} and (o.customer_id is not null or o.customer_name is not null)
      group by coalesce(c.id::text, o.customer_name), c.full_name, c.phone, c.city, c.loyalty_tier, o.customer_name, o.customer_phone
      order by lifetime_value desc limit 200`);
    return {
      available: true,
      message: 'Customers are matched by phone number. Orders without a phone number are grouped by the name typed at the till.',
      columns: [col('customer', 'Customer', 'text'), col('phone', 'Phone', 'text'), col('city', 'City', 'text'), col('tier', 'Tier', 'text'), col('purchases', 'Purchases', 'int'), col('last_purchase', 'Last purchase', 'date'), col('lifetime_value', 'Value in range', 'money')],
      rows: rows.map((r) => ({ customer: str(r.customer), phone: str(r.phone), city: str(r.city), tier: str(r.tier), purchases: n(r.purchases), last_purchase: str(r.last_purchase), lifetime_value: round2(n(r.lifetime_value)) })),
      summary: [{ label: 'Customers', value: rows.length, type: 'int' }],
    };
  },

  'Sales Tax Report': async (from, to) => {
    const rows = await run(sql`
      select o.order_number::text as invoice, (o.created_at)::date::text as date,
             o.subtotal::float as taxable, o.tax_amount::float as tax
      from orders o where ${inRange(from, to)} order by o.created_at desc limit 300`);
    return {
      available: true,
      message: 'Tax is only shown where it was recorded on the order. The POS does not store tax on orders yet, so values can be zero.',
      columns: [col('invoice', 'Invoice', 'text'), col('date', 'Date', 'date'), col('taxable', 'Taxable amount', 'money'), col('tax', 'Tax', 'money')],
      rows: rows.map((r) => ({ invoice: str(r.invoice), date: str(r.date), taxable: round2(n(r.taxable)), tax: round2(n(r.tax)) })),
      summary: [{ label: 'Tax recorded', value: round2(rows.reduce((a, r) => a + n(r.tax), 0)), type: 'money' }],
    };
  },

  'Sales Return / Cr. Note': async (from, to) => {
    const rows = await run(sql`
      select (r.refunded_at)::date::text as date, r.order_id::text as order_ref, r.reason,
             r.amount::float as amount, coalesce(u.name, 'Unknown') as approved_by
      from refunds r left join users u on u.id = r.approved_by
      where (r.refunded_at)::date between ${from}::date and ${to}::date
      order by r.refunded_at desc`);
    return {
      available: true,
      columns: [col('date', 'Date', 'date'), col('order_ref', 'Order', 'text'), col('reason', 'Reason', 'text'), col('amount', 'Amount', 'money'), col('approved_by', 'Approved by', 'text')],
      rows: rows.map((r) => ({ date: str(r.date), order_ref: str(r.order_ref), reason: str(r.reason), amount: round2(n(r.amount)), approved_by: str(r.approved_by) })),
      summary: [{ label: 'Refunds', value: rows.length, type: 'int' }, { label: 'Refunded', value: round2(rows.reduce((a, r) => a + n(r.amount), 0)), type: 'money' }],
    };
  },

  'Purchase Summary': async (from, to) => {
    const rows = await run(sql`
      select s.name as supplier, count(po.id)::int as invoices,
             coalesce(sum(pq.qty), 0)::float as quantity,
             coalesce(sum(po.total_amount), 0)::float as total
      from purchase_orders po
      join suppliers s on s.id = po.supplier_id
      left join (select purchase_order_id, sum(quantity) as qty from purchase_order_items group by 1) pq on pq.purchase_order_id = po.id
      where po.created_at::date between ${from}::date and ${to}::date
      group by s.name order by total desc`);
    const total = rows.reduce((a, r) => a + n(r.total), 0);
    const invoices = rows.reduce((a, r) => a + n(r.invoices), 0);
    return {
      available: true,
      columns: [col('supplier', 'Supplier', 'text'), col('invoices', 'Invoices', 'int'), col('quantity', 'Quantity', 'int'), col('total', 'Total purchase', 'money'), col('avg', 'Avg invoice', 'money')],
      rows: rows.map((r) => ({ supplier: str(r.supplier), invoices: n(r.invoices), quantity: round2(n(r.quantity)), total: round2(n(r.total)), avg: n(r.invoices) ? round2(n(r.total) / n(r.invoices)) : 0 })),
      summary: [{ label: 'Invoices', value: invoices, type: 'int' }, { label: 'Total purchase value', value: round2(total), type: 'money' }],
    };
  },

  'Products Purchases': async (from, to) => purchaseLines(from, to),
  'Purchase Price Trend': async (from, to) => purchaseLines(from, to, true),

  'Stock Summary': async () => {
    const rows = await run(sql`
      select inv.name as product, inv.unit, inv.quantity::float as on_hand, inv.min_quantity::float as minimum,
             case when inv.quantity <= inv.min_quantity then 'Low stock' else 'Healthy' end as status
      from inventory inv order by inv.name`);
    return {
      available: true,
      columns: [col('product', 'Product', 'text'), col('unit', 'Unit', 'text'), col('on_hand', 'On hand', 'int'), col('minimum', 'Minimum', 'int'), col('status', 'Status', 'text')],
      rows: rows.map((r) => ({ product: str(r.product), unit: str(r.unit), on_hand: n(r.on_hand), minimum: n(r.minimum), status: str(r.status) })),
      summary: [{ label: 'Low stock items', value: rows.filter((r) => r.status === 'Low stock').length, type: 'int' }, { label: 'Items', value: rows.length, type: 'int' }],
    };
  },

  'Stock Valuation Report': async () => {
    const rows = await run(sql`
      select inv.name as product, inv.unit, inv.quantity::float as quantity, inv.valuation_method as method,
             coalesce(nullif(inv.avg_cost, 0), lp.price, 0)::float as cost
      from inventory inv
      left join (select distinct on (inventory_id) inventory_id, unit_price as price
                 from purchase_order_items order by inventory_id, created_at desc) lp on lp.inventory_id = inv.id
      order by inv.name`);
    const out = rows.map((r) => ({ product: str(r.product), quantity: n(r.quantity), unit: str(r.unit), cost: round2(n(r.cost)), value: round2(n(r.quantity) * n(r.cost)), method: str(r.method) }));
    return {
      available: true,
      message: 'Cost uses the average cost, or the last purchase price when no average is recorded.',
      columns: [col('product', 'Product', 'text'), col('quantity', 'Quantity', 'int'), col('unit', 'Unit', 'text'), col('cost', 'Cost / unit', 'money'), col('value', 'Stock value', 'money'), col('method', 'Method', 'text')],
      rows: out,
      summary: [{ label: 'Total stock value', value: round2(out.reduce((a, r) => a + r.value, 0)), type: 'money' }],
    };
  },

  'Inventory Turnover Report': async (from, to) => {
    const rows = await run(sql`
      select inv.name as product, inv.quantity::float as on_hand,
             coalesce(sum(l.quantity_out), 0)::float as consumed
      from inventory inv
      left join inventory_ledger l on l.inventory_id = inv.id
           and (l.transaction_date)::date between ${from}::date and ${to}::date
      group by inv.id, inv.name, inv.quantity order by consumed desc`);
    return {
      available: true,
      columns: [col('product', 'Product', 'text'), col('consumed', 'Used in range', 'int'), col('on_hand', 'On hand', 'int'), col('turnover', 'Turnover', 'text')],
      rows: rows.map((r) => ({
        product: str(r.product), consumed: round2(n(r.consumed)), on_hand: round2(n(r.on_hand)),
        turnover: n(r.on_hand) > 0 ? `${round2(n(r.consumed) / n(r.on_hand))}x` : '—',
      })),
      summary: [{ label: 'Items moved', value: rows.filter((r) => n(r.consumed) > 0).length, type: 'int' }],
    };
  },

  'Expiring Product': async () => expiryRows('expiring'),
  'Expired Stock': async () => expiryRows('expired'),

  'Price List': async () => {
    const rows = await run(sql`
      select m.name as item, c.name as category, m.price::float as price, m.is_available as available
      from menu_items m join categories c on c.id = m.category_id order by c.name, m.name`);
    return {
      available: true,
      columns: [col('item', 'Item', 'text'), col('category', 'Category', 'text'), col('price', 'Price', 'money'), col('available', 'Available', 'text')],
      rows: rows.map((r) => ({ item: str(r.item), category: str(r.category), price: round2(n(r.price)), available: r.available ? 'Yes' : 'No' })),
      summary: [{ label: 'Menu items', value: rows.length, type: 'int' }],
    };
  },

  'Expense Reports': async (from, to) => {
    const rows = await run(sql`
      select to_char(date_trunc('month', po.created_at), 'YYYY-MM') as month, count(*)::int as orders,
             coalesce(sum(po.total_amount), 0)::float as amount,
             count(*) filter (where po.status = 'received')::int as received
      from purchase_orders po
      where po.created_at::date between ${from}::date and ${to}::date
      group by 1 order by 1`);
    return {
      available: true,
      message: 'Supplier purchases are shown as expenses. The app has no separate expense module yet.',
      columns: [col('month', 'Month', 'text'), col('orders', 'Purchase orders', 'int'), col('received', 'Received', 'int'), col('amount', 'Amount', 'money')],
      rows: rows.map((r) => ({ month: str(r.month), orders: n(r.orders), received: n(r.received), amount: round2(n(r.amount)) })),
      summary: [{ label: 'Expenses', value: round2(rows.reduce((a, r) => a + n(r.amount), 0)), type: 'money' }],
    };
  },

  'Balances Sheets': async () => unavailable('A balance sheet needs a general ledger and chart of accounts, which the app does not have yet.'),
  'Trial Balance': async () => unavailable('A trial balance needs a general ledger and chart of accounts, which the app does not have yet.'),
  'Profit & Margin': async (from, to) => {
    const p = await computeProfitability(from, to);
    return {
      available: true,
      message: p.coverage.note ?? 'Profit = revenue − recipe cost at the last purchase price. Margin = profit ÷ revenue.',
      columns: [
        { key: 'dish', label: 'Dish', type: 'text' }, { key: 'category', label: 'Category', type: 'text' },
        { key: 'units', label: 'Units', type: 'int' }, { key: 'revenue', label: 'Revenue', type: 'money' },
        { key: 'cost', label: 'Food cost', type: 'money' }, { key: 'profit', label: 'Gross profit', type: 'money' },
        { key: 'marginPct', label: 'Margin', type: 'pct' },
      ],
      rows: p.byDish.map((d) => ({ dish: d.dish, category: d.category, units: d.units, revenue: d.revenue, cost: d.cost, profit: d.profit, marginPct: d.marginPct })),
      summary: [
        { label: 'Revenue', value: p.summary.revenue, type: 'money' },
        { label: 'Food cost', value: p.summary.foodCost, type: 'money' },
        { label: 'Gross profit', value: p.summary.grossProfit, type: 'money' },
        { label: 'Gross margin', value: p.summary.marginPct, type: 'pct' },
      ],
    };
  },
  'Profit by Day': async (from, to) => {
    const p = await computeProfitability(from, to);
    return {
      available: true,
      message: 'Revenue, food cost and profit for each day with paid sales.',
      columns: [
        { key: 'day', label: 'Date', type: 'date' }, { key: 'units', label: 'Units', type: 'int' },
        { key: 'revenue', label: 'Revenue', type: 'money' }, { key: 'cost', label: 'Food cost', type: 'money' },
        { key: 'profit', label: 'Gross profit', type: 'money' }, { key: 'marginPct', label: 'Margin', type: 'pct' },
      ],
      rows: p.byDay,
      summary: [
        { label: 'Gross profit', value: p.summary.grossProfit, type: 'money' },
        { label: 'Gross margin', value: p.summary.marginPct, type: 'pct' },
      ],
    };
  },
  'Profit by Category': async (from, to) => {
    const p = await computeProfitability(from, to);
    return {
      available: true,
      message: 'Revenue, food cost and profit grouped by menu category.',
      columns: [
        { key: 'category', label: 'Category', type: 'text' }, { key: 'units', label: 'Units', type: 'int' },
        { key: 'revenue', label: 'Revenue', type: 'money' }, { key: 'cost', label: 'Food cost', type: 'money' },
        { key: 'profit', label: 'Gross profit', type: 'money' }, { key: 'marginPct', label: 'Margin', type: 'pct' },
      ],
      rows: p.byCategory,
      summary: [{ label: 'Categories', value: p.byCategory.length, type: 'int' }],
    };
  },
  'Price Advice': async (from, to) => {
    const p = await computeProfitability(from, to);
    return {
      available: true,
      message: `Suggested price = unit cost ÷ (1 − ${Math.round(p.target * 100)}%), rounded up to the next ₹5. Only dishes below that price are listed.`,
      columns: [
        { key: 'dish', label: 'Dish', type: 'text' }, { key: 'price', label: 'Current price', type: 'money' },
        { key: 'unitCost', label: 'Unit cost', type: 'money' }, { key: 'targetPrice', label: 'Suggested price', type: 'money' },
        { key: 'priceGap', label: 'Increase', type: 'money' }, { key: 'marginPct', label: 'Current margin', type: 'pct' },
      ],
      rows: p.priceAdvice.map((d) => ({ dish: d.dish, price: d.price, unitCost: d.unitCost, targetPrice: d.targetPrice, priceGap: d.priceGap, marginPct: d.marginPct })),
      summary: [{ label: 'Dishes to review', value: p.priceAdvice.length, type: 'int' }],
    };
  },
  'Invoice & Receivables': async () => unavailable('Credit sales and receivables are not tracked yet. All sales are settled at the till.'),
  'Product Sales Tax': async () => unavailable('Tax is not recorded per item yet. Use the Sales Tax Report for order-level tax.'),
};

async function salesByUser(from: string, to: string): Promise<Built> {
  const sales = await run(sql`
    select coalesce(u.name, 'Unassigned') as user_name, count(distinct o.id)::int as orders,
           coalesce(sum(oi.quantity * oi.unit_price), 0)::float as sales
    from orders o
    left join users u on u.id = o.created_by
    left join order_items oi on oi.order_id = o.id
    where ${inRange(from, to)} group by 1 order by sales desc`);
  const refunds = await run(sql`
    select coalesce(u.name, 'Unknown') as user_name, coalesce(sum(r.amount), 0)::float as refunds
    from refunds r left join users u on u.id = r.approved_by
    where (r.refunded_at)::date between ${from}::date and ${to}::date group by 1`);
  const refundBy = new Map(refunds.map((r) => [str(r.user_name), n(r.refunds)]));
  const rows = sales.map((r) => {
    const name = str(r.user_name);
    const sold = round2(n(r.sales));
    return { user: name, orders: n(r.orders), sales: sold, refunds: round2(refundBy.get(name ?? '') ?? 0), net: round2(sold - (refundBy.get(name ?? '') ?? 0)) };
  });
  return {
    available: true,
    message: 'Orders with no cashier recorded are grouped as Unassigned. Commission is not configured.',
    columns: [col('user', 'User', 'text'), col('orders', 'Orders', 'int'), col('sales', 'Sales', 'money'), col('refunds', 'Refunds', 'money'), col('net', 'Net sales', 'money')],
    rows,
    summary: [{ label: 'Net sales', value: round2(rows.reduce((a, r) => a + r.net, 0)), type: 'money' }],
  };
}

async function purchaseLines(from: string, to: string, byProduct = false): Promise<Built> {
  const rows = await run(sql`
    select inv.name as product, po.invoice_number as invoice, s.name as supplier,
           (po.created_at)::date::text as date, poi.quantity::float as quantity, inv.unit,
           poi.unit_price::float as unit_price, (poi.quantity * poi.unit_price)::float as total
    from purchase_order_items poi
    join purchase_orders po on po.id = poi.purchase_order_id
    join suppliers s on s.id = po.supplier_id
    join inventory inv on inv.id = poi.inventory_id
    where po.created_at::date between ${from}::date and ${to}::date
    order by ${byProduct ? sql`inv.name, po.created_at` : sql`po.created_at desc`} limit 500`);
  return {
    available: true,
    columns: byProduct
      ? [col('product', 'Product', 'text'), col('date', 'Date', 'date'), col('supplier', 'Supplier', 'text'), col('invoice', 'Invoice', 'text'), col('unit_price', 'Unit price', 'money'), col('quantity', 'Quantity', 'int'), col('total', 'Total', 'money')]
      : [col('date', 'Date', 'date'), col('invoice', 'Invoice', 'text'), col('supplier', 'Supplier', 'text'), col('product', 'Product', 'text'), col('quantity', 'Quantity', 'int'), col('unit_price', 'Unit price', 'money'), col('total', 'Total', 'money')],
    rows: rows.map((r) => ({
      product: str(r.product), date: str(r.date), invoice: str(r.invoice), supplier: str(r.supplier),
      quantity: round2(n(r.quantity)), unit_price: round2(n(r.unit_price)), total: round2(n(r.total)),
    })),
    summary: [
      { label: 'Lines', value: rows.length, type: 'int' },
      { label: 'Total', value: round2(rows.reduce((a, r) => a + n(r.total), 0)), type: 'money' },
    ],
  };
}

async function expiryRows(kind: 'expiring' | 'expired'): Promise<Built> {
  const where = kind === 'expiring'
    ? sql`poi.expiry_date::date between current_date and current_date + 90 and poi.received_qty > 0`
    : sql`poi.expiry_date::date < current_date and poi.received_qty > 0`;
  const rows = await run(sql`
    select inv.name as product, po.invoice_number as invoice, (poi.expiry_date)::date::text as expiry,
           poi.received_qty::float as quantity, ((poi.expiry_date)::date - current_date)::int as days_left
    from purchase_order_items poi
    join purchase_orders po on po.id = poi.purchase_order_id
    join inventory inv on inv.id = poi.inventory_id
    where ${where} order by poi.expiry_date`);
  return {
    available: true,
    message: kind === 'expiring' ? 'Items received with an expiry date in the next 90 days.' : 'Received items whose expiry date has passed.',
    columns: [col('product', 'Product', 'text'), col('invoice', 'Invoice', 'text'), col('expiry', 'Expiry', 'date'), col('quantity', 'Quantity', 'int'), col('days_left', 'Days left', 'int')],
    rows: rows.map((r) => ({ product: str(r.product), invoice: str(r.invoice), expiry: str(r.expiry), quantity: round2(n(r.quantity)), days_left: n(r.days_left) })),
    summary: [{ label: kind === 'expiring' ? 'Expiring' : 'Expired', value: rows.length, type: 'int' }],
  };
}

const BUILDERS: Record<string, (from: string, to: string) => Promise<Built>> = { ...BASE_BUILDERS, ...EXTRA_BUILDERS };

const DATE = /^\d{4}-\d{2}-\d{2}$/;


export async function runReport(data: { name: string; from: string; to: string }): Promise<ReportResult> {
  const build = BUILDERS[data.name];
  if (!build) throw new Error(`Unknown report: ${data.name}`);
  const built = await build(data.from, data.to);
  return { title: data.name, from: data.from, to: data.to, ...built } as ReportResult;
}
