// Additional report builders. Each returns rows for an inclusive date range.
// Items that depend on data the POS does not capture yet return available: false with the reason.
import { sql, type SQL } from 'drizzle-orm';
import { db } from './db/db';
import type { ColType, ReportColumn, ReportRow, ReportSummary } from './reports';

type Row = Record<string, unknown>;
type Built = { available: boolean; message?: string; columns: ReportColumn[]; rows: ReportRow[]; summary: ReportSummary[] };

const n = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);
const run = async (q: SQL) => (await db.execute(q)) as unknown as Row[];
const col = (key: string, label: string, type: ColType): ReportColumn => ({ key, label, type });
const na = (message: string): Built => ({ available: false, message, columns: [], rows: [], summary: [] });

const paid = (from: string, to: string): SQL =>
  sql`o.status in ('paid', 'completed') and (o.created_at)::date between ${from}::date and ${to}::date`;
const allOrders = (from: string, to: string): SQL =>
  sql`(o.created_at)::date between ${from}::date and ${to}::date`;

// Recipe cost per menu item, using the last purchase price of each ingredient.
async function recipeCosts() {
  const rows = await run(sql`
    select m.id, m.name, m.price::float as price, c.name as category,
           coalesce(sum(b.quantity * lp.price), 0)::float as cost,
           count(b.inventory_id) filter (where lp.price is null)::int as missing
    from menu_items m
    left join categories c on c.id = m.category_id
    left join recipe_bom b on b.menu_item_id = m.id
    left join (select distinct on (inventory_id) inventory_id, unit_price as price
               from purchase_order_items order by inventory_id, created_at desc) lp on lp.inventory_id = b.inventory_id
    group by m.id, m.name, m.price, c.name order by m.name`);
  return rows;
}

// Sales per menu item in range.
async function itemSales(from: string, to: string) {
  const rows = await run(sql`
    select m.id, m.name, coalesce(sum(oi.quantity), 0)::int as units,
           coalesce(sum(oi.quantity * oi.unit_price), 0)::float as revenue
    from menu_items m
    left join order_items oi on oi.menu_item_id = m.id
    left join orders o on o.id = oi.order_id and ${paid(from, to)}
    group by m.id, m.name`);
  return new Map(rows.map((r) => [n(r.id), { name: String(r.name), units: n(r.units), revenue: n(r.revenue) }]));
}

export const EXTRA_BUILDERS: Record<string, (from: string, to: string) => Promise<Built>> = {
  'Sales by Week': async (from, to) => {
    const rows = await run(sql`
      select to_char(date_trunc('week', o.created_at), 'YYYY-MM-DD') as week, count(distinct o.id)::int as orders,
             coalesce(sum(oi.quantity * oi.unit_price), 0)::float as sales
      from orders o left join order_items oi on oi.order_id = o.id
      where ${paid(from, to)} group by 1 order by 1`);
    return {
      available: true,
      columns: [col('week', 'Week starting', 'date'), col('orders', 'Orders', 'int'), col('sales', 'Sales', 'money'), col('avg', 'Avg order', 'money')],
      rows: rows.map((r) => ({ week: str(r.week), orders: n(r.orders), sales: r2(n(r.sales)), avg: n(r.orders) ? r2(n(r.sales) / n(r.orders)) : 0 })),
      summary: [{ label: 'Weeks', value: rows.length, type: 'int' }, { label: 'Sales', value: r2(rows.reduce((a, r) => a + n(r.sales), 0)), type: 'money' }],
    };
  },

  'Sales by Month': async (from, to) => {
    const rows = await run(sql`
      select to_char(date_trunc('month', o.created_at), 'YYYY-MM') as month, count(distinct o.id)::int as orders,
             coalesce(sum(oi.quantity * oi.unit_price), 0)::float as sales
      from orders o left join order_items oi on oi.order_id = o.id
      where ${paid(from, to)} group by 1 order by 1`);
    return {
      available: true,
      columns: [col('month', 'Month', 'text'), col('orders', 'Orders', 'int'), col('sales', 'Sales', 'money'), col('growth', 'Growth', 'pct')],
      rows: rows.map((r, i) => {
        const s = n(r.sales);
        const prev = i > 0 ? n(rows[i - 1].sales) : 0;
        return { month: str(r.month), orders: n(r.orders), sales: r2(s), growth: i > 0 ? pct(s - prev, prev) : null };
      }),
      summary: [{ label: 'Months', value: rows.length, type: 'int' }],
    };
  },

  'Bottom Selling Products': async (from, to) => {
    const rows = (await itemSales(from, to));
    const list = [...rows.values()].filter((r) => r.units > 0).sort((a, b) => a.units - b.units).slice(0, 10);
    const never = [...rows.values()].filter((r) => r.units === 0).length;
    return {
      available: true,
      message: `${never} menu items had no sales in this period.`,
      columns: [col('product', 'Product', 'text'), col('units', 'Units', 'int'), col('revenue', 'Revenue', 'money')],
      rows: list.map((r) => ({ product: r.name, units: r.units, revenue: r2(r.revenue) })),
      summary: [{ label: 'Slowest units', value: list.reduce((a, r) => a + r.units, 0), type: 'int' }],
    };
  },

  'Sales by Channel': async (from, to) => {
    const rows = await run(sql`
      select o.type as channel, count(distinct o.id)::int as orders,
             coalesce(sum(oi.quantity * oi.unit_price), 0)::float as sales
      from orders o left join order_items oi on oi.order_id = o.id
      where ${paid(from, to)} group by o.type order by sales desc`);
    const total = rows.reduce((a, r) => a + n(r.sales), 0);
    return {
      available: true,
      message: 'Channels come from the order type. Delivery is not a separate order type yet, so it does not appear.',
      columns: [col('channel', 'Channel', 'text'), col('orders', 'Orders', 'int'), col('sales', 'Sales', 'money'), col('share', 'Share', 'pct')],
      rows: rows.map((r) => ({ channel: str(r.channel), orders: n(r.orders), sales: r2(n(r.sales)), share: pct(n(r.sales), total) })),
      summary: [{ label: 'Sales', value: r2(total), type: 'money' }],
    };
  },

  'Discounts and Voids': async (from, to) => {
    const discounts = await run(sql`
      select count(*)::int as orders, coalesce(sum(o.discount_amount), 0)::float as discount
      from orders o where ${paid(from, to)} and o.discount_amount > 0`);
    const voids = await run(sql`
      select count(*)::int as orders, coalesce(sum(o.total), 0)::float as value
      from orders o where o.status in ('void', 'cancelled') and ${allOrders(from, to)}`);
    return {
      available: true,
      message: 'Discounts come from the order discount field. Voided and cancelled orders are counted by their status.',
      columns: [col('kind', 'Type', 'text'), col('orders', 'Orders', 'int'), col('value', 'Value', 'money')],
      rows: [
        { kind: 'Discounted orders', orders: n(discounts[0]?.orders), value: r2(n(discounts[0]?.discount)) },
        { kind: 'Voided or cancelled', orders: n(voids[0]?.orders), value: r2(n(voids[0]?.value)) },
      ],
      summary: [{ label: 'Discount given', value: r2(n(discounts[0]?.discount)), type: 'money' }, { label: 'Voided value', value: r2(n(voids[0]?.value)), type: 'money' }],
    };
  },

  'Repeat Customer Rate': async (from, to) => {
    const rows = await run(sql`
      select o.customer_name as customer, count(distinct o.id)::int as visits,
             coalesce(sum(oi.quantity * oi.unit_price), 0)::float as value
      from orders o left join order_items oi on oi.order_id = o.id
      where ${paid(from, to)} and o.customer_name is not null
      group by o.customer_name order by value desc limit 300`);
    const repeat = rows.filter((r) => n(r.visits) > 1).length;
    return {
      available: true,
      message: 'Customers are identified by the name entered on the order. Anonymous dine-in orders are not counted.',
      columns: [col('customer', 'Customer', 'text'), col('visits', 'Visits', 'int'), col('value', 'Value in range', 'money'), col('repeat', 'Repeat', 'text')],
      rows: rows.map((r) => ({ customer: str(r.customer), visits: n(r.visits), value: r2(n(r.value)), repeat: n(r.visits) > 1 ? 'Yes' : 'No' })),
      summary: [
        { label: 'Repeat customer rate', value: pct(repeat, rows.length), type: 'pct' },
        { label: 'Customers', value: rows.length, type: 'int' },
      ],
    };
  },

  'Reservations and Waitlist': async (from, to) => {
    const rows = await run(sql`
      select r.type, r.status, count(*)::int as n
      from reservations r where (r.created_at)::date between ${from}::date and ${to}::date
      group by r.type, r.status order by r.type, r.status`);
    const total = rows.reduce((a, r) => a + n(r.n), 0);
    const booked = rows.filter((r) => r.type === 'advance').reduce((a, r) => a + n(r.n), 0);
    const seated = rows.filter((r) => r.status === 'seated').reduce((a, r) => a + n(r.n), 0);
    const noShow = rows.filter((r) => r.status === 'no-show').reduce((a, r) => a + n(r.n), 0);
    return {
      available: true,
      message: 'Average wait is not shown: the app does not record when a waitlist guest is seated.',
      columns: [col('type', 'Type', 'text'), col('status', 'Status', 'text'), col('count', 'Count', 'int')],
      rows: rows.map((r) => ({ type: str(r.type), status: str(r.status), count: n(r.n) })),
      summary: [
        { label: 'Total bookings', value: total, type: 'int' },
        { label: 'Advance bookings', value: booked, type: 'int' },
        { label: 'Seated', value: seated, type: 'int' },
        { label: 'No-show rate', value: pct(noShow, total), type: 'pct' },
      ],
    };
  },

  'Ingredient Cost per Dish': async () => {
    const rows = await recipeCosts();
    return {
      available: true,
      message: 'Cost uses the last purchase price of each ingredient. Dishes with no recipe show zero cost.',
      columns: [col('dish', 'Dish', 'text'), col('category', 'Category', 'text'), col('price', 'Selling price', 'money'), col('cost', 'Ingredient cost', 'money'), col('margin', 'Margin', 'pct'), col('recipe', 'Recipe', 'text')],
      rows: rows.map((r) => {
        const price = n(r.price);
        const cost = r2(n(r.cost));
        return {
          dish: str(r.name), category: str(r.category), price: r2(price), cost,
          margin: price > 0 && cost > 0 ? pct(price - cost, price) : null,
          recipe: cost > 0 ? (n(r.missing) > 0 ? 'Partial' : 'Full') : 'None',
        };
      }),
      summary: [{ label: 'Dishes with a recipe', value: rows.filter((r) => n(r.cost) > 0).length, type: 'int' }],
    };
  },

  'Dish Profitability & Popularity': async (from, to) => {
    const costs = await recipeCosts();
    const sales = await itemSales(from, to);
    const items = costs.map((c) => {
      const s = sales.get(n(c.id)) ?? { units: 0, revenue: 0, name: '' };
      const margin = n(c.price) - n(c.cost);
      return { name: String(c.name), units: s.units, margin, hasCost: n(c.cost) > 0 };
    }).filter((i) => i.units > 0 && i.hasCost);
    if (items.length === 0) {
      return na('Dish profitability & popularity needs items with both sales and a recipe cost. Add recipes in Menu → BOM and make some sales.');
    }
    const avgUnits = items.reduce((a, i) => a + i.units, 0) / items.length;
    const avgMargin = items.reduce((a, i) => a + i.margin, 0) / items.length;
    const classify = (i: { units: number; margin: number }) => {
      const popular = i.units >= avgUnits;
      const profitable = i.margin >= avgMargin;
      if (popular && profitable) return 'Champion';
      if (popular && !profitable) return 'Crowd pleaser';
      if (!popular && profitable) return 'Hidden gem';
      return 'Review';
    };
    const rows = items.map((i) => ({ dish: i.name, units: i.units, margin: r2(i.margin), class: classify(i) }));
    return {
      available: true,
      message: `Popular means above the average units (${Math.round(avgUnits)}). Profitable means above the average margin (₹${avgMargin.toFixed(0)}).`,
      columns: [col('dish', 'Dish', 'text'), col('units', 'Units', 'int'), col('margin', 'Margin per unit', 'money'), col('class', 'Class', 'text')],
      rows,
      summary: ['Champion', 'Crowd pleaser', 'Hidden gem', 'Review'].map((k) => ({ label: k + 's', value: rows.filter((r) => r.class === k).length, type: 'int' as ColType })),
    };
  },

  'Menu Engineering': async (from, to) => {
    return EXTRA_BUILDERS['Dish Profitability & Popularity'](from, to);
  },

  'Profit & Margin': async (from, to) => {
    const costs = await recipeCosts();
    const sales = await itemSales(from, to);
    const rows = costs.map((c) => {
      const s = sales.get(n(c.id)) ?? { units: 0, revenue: 0, name: '' };
      const selling = r2(s.revenue);
      const totalCost = r2(s.units * n(c.cost));
      const margin = r2(selling - totalCost);
      const marginPct = selling > 0 ? r2((margin / selling) * 100) : 0;
      return {
        dish: str(c.name),
        category: str(c.category),
        units: s.units,
        revenue: selling,
        cost: totalCost,
        margin,
        marginPct,
      };
    }).filter((r) => r.units > 0);

    const totalRev = rows.reduce((a, r) => a + r.revenue, 0);
    const totalCost = rows.reduce((a, r) => a + r.cost, 0);
    const totalMargin = r2(totalRev - totalCost);
    return {
      available: true,
      message: 'Costs are calculated from recipe Bill of Materials at the latest ingredient purchase prices.',
      columns: [
        col('dish', 'Dish', 'text'),
        col('category', 'Category', 'text'),
        col('units', 'Units Sold', 'int'),
        col('revenue', 'Total Sales', 'money'),
        col('cost', 'Recipe Cost', 'money'),
        col('margin', 'Gross Profit', 'money'),
        col('marginPct', 'Margin %', 'pct'),
      ],
      rows,
      summary: [
        { label: 'Total Sales', value: r2(totalRev), type: 'money' },
        { label: 'Total Food Cost', value: r2(totalCost), type: 'money' },
        { label: 'Gross Profit', value: totalMargin, type: 'money' },
        { label: 'Overall Margin', value: totalRev > 0 ? r2((totalMargin / totalRev) * 100) : 0, type: 'pct' },
      ],
    };
  },

  'Waste and Shrinkage': async (from, to) => {
    const rows = await run(sql`
      select inv.name as product, coalesce(nullif(il.reference_id, ''), 'Wastage') as kind,
             abs(coalesce(sum(il.quantity_change::float), 0))::float as qty,
             abs(coalesce(sum(il.quantity_change::float * coalesce(lp.price, 0)), 0))::float as value
      from inventory_ledger il
      join inventory inv on inv.id = il.inventory_id
      left join (select distinct on (inventory_id) inventory_id, unit_price::float as price
                 from purchase_order_items order by inventory_id, created_at desc) lp on lp.inventory_id = inv.id
      where il.transaction_type in ('WASTAGE', 'ADJUSTMENT') and (il.created_at)::date between ${from}::date and ${to}::date
      group by inv.name, il.reference_id order by qty desc`);
    return {
      available: true,
      message: 'Value uses the last purchase price of each ingredient recorded in purchase orders.',
      columns: [col('product', 'Ingredient', 'text'), col('kind', 'Reason / Ref', 'text'), col('qty', 'Quantity lost', 'int'), col('value', 'Value lost', 'money')],
      rows: rows.map((r) => ({ product: str(r.product), kind: str(r.kind), qty: r2(n(r.qty)), value: r2(n(r.value)) })),
      summary: [{ label: 'Entries', value: rows.length, type: 'int' }, { label: 'Value lost', value: r2(rows.reduce((a, r) => a + n(r.value), 0)), type: 'money' }],
    };
  },

  'Supplier Price Changes': async (from, to) => {
    const rows = await run(sql`
      with p as (
        select s.name as supplier, inv.name as product, (po.created_at)::date::text as date,
               poi.unit_price::float as price,
               lag(poi.unit_price::float) over (partition by po.supplier_id, poi.inventory_id order by po.created_at) as prev
        from purchase_order_items poi
        join purchase_orders po on po.id = poi.purchase_order_id
        join suppliers s on s.id = po.supplier_id
        join inventory inv on inv.id = poi.inventory_id)
      select * from p where prev is not null and price <> prev and date between ${from}::text and ${to}::text
      order by date desc limit 300`);
    return {
      available: true,
      columns: [col('date', 'Date', 'date'), col('supplier', 'Supplier', 'text'), col('product', 'Product', 'text'), col('prev', 'Previous price', 'money'), col('price', 'New price', 'money'), col('change', 'Change', 'pct')],
      rows: rows.map((r) => ({
        date: str(r.date), supplier: str(r.supplier), product: str(r.product),
        prev: r2(n(r.prev)), price: r2(n(r.price)), change: r2(pct(n(r.price) - n(r.prev), n(r.prev))),
      })),
      summary: [{ label: 'Price changes', value: rows.length, type: 'int' }],
    };
  },

  'Shift Cash Variance': async (from, to) => {
    const rows = await run(sql`
      select sh.id, (sh.opened_at)::date::text as date, coalesce(u.name, 'Unknown') as opened_by,
             sh.opening_cash::float as opening, sh.expected_cash::float as expected,
             sh.closing_cash::float as closing, sh.variance::float as variance, sh.status
      from shifts sh left join users u on u.id = sh.opened_by
      where (sh.opened_at)::date between ${from}::date and ${to}::date order by sh.opened_at desc`);
    return {
      available: true,
      message: 'Tips are not recorded, so they are not shown.',
      columns: [col('date', 'Date', 'date'), col('opened_by', 'Cashier', 'text'), col('opening', 'Opening cash', 'money'), col('expected', 'Expected', 'money'), col('closing', 'Counted', 'money'), col('variance', 'Variance', 'money'), col('status', 'Status', 'text')],
      rows: rows.map((r) => ({ date: str(r.date), opened_by: str(r.opened_by), opening: r2(n(r.opening)), expected: r2(n(r.expected)), closing: r2(n(r.closing)), variance: r2(n(r.variance)), status: str(r.status) })),
      summary: [
        { label: 'Shifts', value: rows.length, type: 'int' },
        { label: 'Net variance', value: r2(rows.reduce((a, r) => a + n(r.variance), 0)), type: 'money' },
      ],
    };
  },

  'Staff Voids and Discounts': async (from, to) => {
    const rows = await run(sql`
      select coalesce(u.name, 'Unassigned') as staff,
             count(*) filter (where o.status in ('void', 'cancelled'))::int as voids,
             coalesce(sum(o.total) filter (where o.status in ('void', 'cancelled')), 0)::float as void_value,
             count(*) filter (where o.discount_amount > 0)::int as discounted,
             coalesce(sum(o.discount_amount), 0)::float as discount
      from orders o left join users u on u.id = o.created_by
      where ${allOrders(from, to)} group by 1 order by 1`);
    return {
      available: true,
      columns: [col('staff', 'Staff', 'text'), col('voids', 'Voids', 'int'), col('void_value', 'Voided value', 'money'), col('discounted', 'Discounted orders', 'int'), col('discount', 'Discount given', 'money')],
      rows: rows.map((r) => ({ staff: str(r.staff), voids: n(r.voids), void_value: r2(n(r.void_value)), discounted: n(r.discounted), discount: r2(n(r.discount)) })),
      summary: [{ label: 'Voids', value: rows.reduce((a, r) => a + n(r.voids), 0), type: 'int' }],
    };
  },

  'Daily Cash-Up': async (from, to) => {
    const rows = await run(sql`
      select (p.paid_at)::date::text as date, p.payment_mode as method,
             coalesce(sum(p.amount), 0)::float as amount, count(*)::int as n
      from payments p where p.status = 'completed' and (p.paid_at)::date between ${from}::date and ${to}::date
      group by 1, 2 order by 1 desc, 2`);
    const refunds = await run(sql`
      select (r.refunded_at)::date::text as date, coalesce(sum(r.amount), 0)::float as refunds
      from refunds r where (r.refunded_at)::date between ${from}::date and ${to}::date group by 1`);
    const refundBy = new Map(refunds.map((r) => [str(r.date), n(r.refunds)]));
    return {
      available: true,
      message: 'Shows the money received by payment method each day, less refunds. Counted cash should match the shift cash variance report.',
      columns: [col('date', 'Date', 'date'), col('method', 'Method', 'text'), col('count', 'Payments', 'int'), col('amount', 'Received', 'money')],
      rows: rows.map((r) => ({ date: str(r.date), method: str(r.method), count: n(r.n), amount: r2(n(r.amount)) })),
      summary: [
        { label: 'Received', value: r2(rows.reduce((a, r) => a + n(r.amount), 0)), type: 'money' },
        { label: 'Refunds', value: r2([...refundBy.values()].reduce((a, v) => a + v, 0)), type: 'money' },
      ],
    };
  },

  'Sales Anomalies': async (from, to) => {
    const rows = await run(sql`
      select (o.created_at)::date::text as date, coalesce(sum(oi.quantity * oi.unit_price), 0)::float as sales
      from orders o left join order_items oi on oi.order_id = o.id
      where ${paid(from, to)} group by 1 order by 1`);
    if (rows.length < 3) return na('At least three days of sales are needed to spot unusual days.');
    const vals = rows.map((r) => n(r.sales));
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length) || 1;
    const out = rows.map((r) => {
      const z = (n(r.sales) - mean) / sd;
      return { date: str(r.date), sales: r2(n(r.sales)), z: r2(z), flag: Math.abs(z) >= 2 ? (z > 0 ? 'Unusually high' : 'Unusually low') : 'Normal' };
    });
    return {
      available: true,
      message: 'A day is flagged when its sales are two or more standard deviations from the average for the period.',
      columns: [col('date', 'Date', 'date'), col('sales', 'Sales', 'money'), col('z', 'Deviation (z)', 'text'), col('flag', 'Flag', 'text')],
      rows: out.map((r) => ({ ...r, z: r.z.toFixed(2) })),
      summary: [{ label: 'Flagged days', value: out.filter((r) => r.flag !== 'Normal').length, type: 'int' }, { label: 'Average per day', value: r2(mean), type: 'money' }],
    };
  },

  // Items that need data the POS does not capture yet.
  'Preparation Time by Station': async () => na('Preparation time needs ready and served timestamps per KOT item. The app does not record them yet.'),
  'KOT Delays': async () => na('KOT delay needs the time each KOT was sent and completed. The app does not record these timestamps yet.'),
  'Items Cancelled or Remade': async () => na('Cancelled and remade items are not logged separately. Only whole orders can be voided today.'),
  'Tips Report': async () => na('Tips are not captured at payment yet, so there is nothing to report.'),
  'Loyalty Tier Usage': async () => {
    const rows = await run(sql`
      select coalesce(nullif(c.loyalty_tier, ''), 'Standard') as tier, count(*)::int as count
      from customers c
      group by 1 order by 2 desc`);
    if (rows.length === 0) return na('No customer records found yet.');
    return {
      available: true,
      columns: [col('tier', 'Loyalty Tier', 'text'), col('count', 'Customers', 'int')],
      rows: rows.map((r) => ({ tier: str(r.tier), count: n(r.count) })),
      summary: [{ label: 'Total Customers', value: rows.reduce((a, r) => a + n(r.count), 0), type: 'int' }],
    };
  },

  'Purchase Order Lead Time': async (from, to) => {
    const rows = await run(sql`
      select po.id, s.name as supplier, po.created_at,
             coalesce(round(extract(epoch from (min(il.created_at) - po.created_at)) / 86400.0, 1), 0)::float as days
      from purchase_orders po
      join suppliers s on s.id = po.supplier_id
      left join inventory_ledger il on il.reference_id = po.id::text and il.transaction_type = 'PURCHASE'
      where po.status = 'received' and (po.created_at)::date between ${from}::date and ${to}::date
      group by po.id, s.name, po.created_at
      order by po.created_at desc`);
    if (rows.length === 0) return na('No received purchase orders found in this date range.');
    const avgDays = r2(rows.reduce((a, r) => a + n(r.days), 0) / rows.length);
    return {
      available: true,
      columns: [col('id', 'PO #', 'int'), col('supplier', 'Supplier', 'text'), col('days', 'Lead Time (Days)', 'int')],
      rows: rows.map((r) => ({ id: n(r.id), supplier: str(r.supplier), days: n(r.days) })),
      summary: [{ label: 'Average Lead Time (Days)', value: avgDays, type: 'int' }, { label: 'Received POs', value: rows.length, type: 'int' }],
    };
  },
  'Delivery Channel': async () => na('Delivery is not a separate order type yet, so there is no delivery channel data.'),
};
