// Deterministic sales, demand and purchasing analytics computed from the database.
// The numbers here are the source of truth. The AI layer (ai.ts) only explains them.
import { sql } from 'drizzle-orm';
import { db } from './db/db';
import { computeProfitability } from './profit.server';

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const round2c = (v: number) => Math.round(v * 100) / 100;

export function addDays(day: string, n: number) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000) + 1;

// Trend-adjusted run rate: average daily units in the window, scaled over the horizon by half
// the period-on-period growth, clamped to 0.5x - 1.5x so sparse data cannot explode the forecast.
export function forecastUnits(windowUnits: number, windowDays: number, prevUnits: number, horizonDays: number) {
  const growth = prevUnits > 0 ? (windowUnits - prevUnits) / prevUnits : 0;
  const factor = Math.min(1.5, Math.max(0.5, 1 + growth * 0.5));
  return round((windowUnits / Math.max(windowDays, 1)) * horizonDays * factor, 1);
}

export type InsightOptions = {
  from?: string;          // YYYY-MM-DD, default: 6 days before `to`
  to?: string;            // YYYY-MM-DD, default: today
  horizonDays?: number;   // forecast length after `to`, default 7 (1-60)
  categoryId?: number | null;
};

export async function buildInsights(opts: InsightOptions = {}) {
  const todayRows = (await db.execute(sql`select (now())::date::text as today`)) as unknown as Row[];
  const today = String(todayRows[0].today);
  const to = opts.to ?? today;
  const from = opts.from ?? addDays(to, -6);
  if (from > to) throw new Error('From date is after the to date');
  const days = daysBetween(from, to);
  if (days > 366) throw new Error('Choose a range of 366 days or less');
  const horizon = Math.min(60, Math.max(1, opts.horizonDays ?? 7));
  const prevFrom = addDays(from, -days);
  const prevTo = addDays(from, -1);
  const nextFrom = addDays(to, 1);
  const nextTo = addDays(to, horizon);

  const salesRows = (await db.execute(sql`
    select oi.menu_item_id as "menuItemId", (o.created_at)::date::text as day,
           sum(oi.quantity)::int as qty, sum(oi.quantity * oi.unit_price)::float as revenue
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.status in ('paid', 'completed') and (o.created_at)::date between ${prevFrom}::date and ${to}::date
    group by oi.menu_item_id, (o.created_at)::date
  `)) as unknown as Row[];

  const menu = (await db.execute(sql`
    select m.id, m.name, m.price::float as price, m.is_available as "isAvailable", m.category_id as "categoryId",
           c.name as "categoryName",
           (select count(*)::int from recipe_bom b where b.menu_item_id = m.id) as "recipeCount"
    from menu_items m left join categories c on c.id = m.category_id order by m.name`)) as unknown as Row[];
  const categories = (await db.execute(sql`select id, name from categories order by name`)) as unknown as Row[];
  const recipes = (await db.execute(sql`
    select menu_item_id as "menuItemId", inventory_id as "inventoryId", quantity::float as qty from recipe_bom`)) as unknown as Row[];
  const inv = (await db.execute(sql`
    select id, name, unit, quantity::float as qty, min_quantity::float as "minQty" from inventory order by name`)) as unknown as Row[];
  const lastPrices = (await db.execute(sql`
    select distinct on (inventory_id) inventory_id as "inventoryId", unit_price::float as price
    from purchase_order_items order by inventory_id, created_at desc`)) as unknown as Row[];

  const inCategory = new Map(menu.map((m) => [num(m.id), opts.categoryId ? num(m.categoryId) === opts.categoryId : true]));

  // Per-item units and revenue in the current and previous windows, plus a per-day series.
  const sold = new Map<number, { cur: number; prev: number; revenue: number }>();
  const daily = new Map<string, { units: number; revenue: number }>();
  for (const r of salesRows) {
    const id = num(r.menuItemId);
    if (!inCategory.get(id)) continue;
    const day = String(r.day);
    const acc = sold.get(id) ?? { cur: 0, prev: 0, revenue: 0 };
    if (day >= from && day <= to) {
      acc.cur += num(r.qty);
      acc.revenue += num(r.revenue);
      const d = daily.get(day) ?? { units: 0, revenue: 0 };
      d.units += num(r.qty);
      d.revenue += num(r.revenue);
      daily.set(day, d);
    } else if (day >= prevFrom && day <= prevTo) {
      acc.prev += num(r.qty);
    }
    sold.set(id, acc);
  }

  const itemForecast = menu
    .filter((m) => m.isAvailable && inCategory.get(num(m.id)))
    .map((m) => {
      const acc = sold.get(num(m.id)) ?? { cur: 0, prev: 0, revenue: 0 };
      const forecast = forecastUnits(acc.cur, days, acc.prev, horizon);
      const growth = acc.prev > 0 ? round(((acc.cur - acc.prev) / acc.prev) * 100, 1) : null;
      return {
        menuItemId: num(m.id),
        name: String(m.name),
        category: m.categoryName ? String(m.categoryName) : 'Uncategorised',
        unitsInRange: acc.cur,
        unitsPrevious: acc.prev,
        revenueInRange: round(acc.revenue),
        growthPct: growth,
        forecastUnits: forecast,
        forecastRevenue: round(forecast * num(m.price)),
        hasRecipe: num(m.recipeCount) > 0,
        trend: growth === null ? 'no prior data' : growth > 20 ? 'rising' : growth < -20 ? 'falling' : 'stable',
      };
    })
    .sort((a, b) => b.forecastUnits - a.forecastUnits);

  // Ingredient consumption = units sold x recipe quantity per unit.
  const forecastByItem = new Map(itemForecast.map((f) => [f.menuItemId, f.forecastUnits]));
  const ingredient = new Map<number, { cur: number; prev: number; next: number }>();
  for (const r of recipes) {
    const mid = num(r.menuItemId);
    const iid = num(r.inventoryId);
    const q = num(r.qty);
    const s = sold.get(mid);
    const acc = ingredient.get(iid) ?? { cur: 0, prev: 0, next: 0 };
    acc.cur += (s?.cur ?? 0) * q;
    acc.prev += (s?.prev ?? 0) * q;
    acc.next += (forecastByItem.get(mid) ?? 0) * q;
    ingredient.set(iid, acc);
  }

  const priceBy = new Map(lastPrices.map((p) => [num(p.inventoryId), num(p.price)]));
  const purchaseRecommendations = inv.map((i) => {
    const id = num(i.id);
    const acc = ingredient.get(id) ?? { cur: 0, prev: 0, next: 0 };
    const hasRecipe = ingredient.has(id);
    const available = num(i.qty);
    const minQty = num(i.minQty);
    // Need over the forecast horizon (from recipes) plus the safety level, minus stock on hand.
    const required = (hasRecipe ? acc.next : 0) + minQty - available;
    const orderQty = Math.max(0, Math.ceil(required * 100) / 100);
    const growth = acc.prev > 0 ? round(((acc.cur - acc.prev) / acc.prev) * 100, 1) : null;
    const priority = available <= 0 || available < minQty || (hasRecipe && available < acc.next)
      ? 'urgent'
      : growth !== null && growth > 20 ? 'watch'
      : orderQty > 0 ? 'routine' : 'none';
    const unitPrice = priceBy.get(id) ?? null;
    return {
      inventoryId: id,
      name: String(i.name),
      unit: String(i.unit),
      available: round(available, 3),
      minQty: round(minQty, 3),
      hasRecipe,
      consumedInRange: round(acc.cur, 3),
      consumedPrevious: round(acc.prev, 3),
      consumptionGrowthPct: growth,
      forecastNeed: round(acc.next, 3),
      recommendedOrderQty: orderQty,
      lastUnitPrice: unitPrice,
      estimatedCost: unitPrice === null ? null : round(orderQty * unitPrice),
      priority,
    };
  }).sort((a, b) => {
    const rank: Record<string, number> = { urgent: 0, watch: 1, routine: 2, none: 3 };
    return rank[a.priority] - rank[b.priority] || b.recommendedOrderQty - a.recommendedOrderQty;
  });

  const withRecipes = menu.filter((m) => m.isAvailable && num(m.recipeCount) > 0).length;
  const availableItems = menu.filter((m) => m.isAvailable).length;
  const unitsInRange = itemForecast.reduce((s, f) => s + f.unitsInRange, 0);
  const unitsPrevious = itemForecast.reduce((s, f) => s + f.unitsPrevious, 0);
  const revenueInRange = round(itemForecast.reduce((s, f) => s + f.revenueInRange, 0));

  // Category summary for the selected items.
  const catMap = new Map<string, { units: number; revenue: number }>();
  for (const f of itemForecast) {
    const c = catMap.get(f.category) ?? { units: 0, revenue: 0 };
    c.units += f.unitsInRange;
    c.revenue += f.revenueInRange;
    catMap.set(f.category, c);
  }

  // Menu engineering: popularity vs margin, using recipe cost at the last purchase price.
  const costByItem = new Map<number, number>();
  for (const r of recipes) {
    const mid = num(r.menuItemId);
    costByItem.set(mid, (costByItem.get(mid) ?? 0) + num(r.qty) * (priceBy.get(num(r.inventoryId)) ?? 0));
  }
  const menuRows = menu
    .filter((m) => m.isAvailable && inCategory.get(num(m.id)))
    .map((m) => {
      const units = sold.get(num(m.id))?.cur ?? 0;
      const price = num(m.price);
      const cost = round2c(costByItem.get(num(m.id)) ?? 0);
      return { dish: String(m.name), category: m.categoryName ? String(m.categoryName) : 'Uncategorised', units, price, cost, margin: round2c(price - cost), marginPct: price > 0 && cost > 0 ? round((price - cost) / price * 100, 1) : null };
    })
    .filter((r) => r.cost > 0 && r.units > 0);
  const avgUnits = menuRows.length ? menuRows.reduce((a, r) => a + r.units, 0) / menuRows.length : 0;
  const avgMargin = menuRows.length ? menuRows.reduce((a, r) => a + r.margin, 0) / menuRows.length : 0;
  const menuEngineering = menuRows
    .map((r) => ({
      ...r,
      class: r.units >= avgUnits ? (r.margin >= avgMargin ? 'Champion' : 'Crowd pleaser') : (r.margin >= avgMargin ? 'Hidden gem' : 'Review'),
    }))
    .sort((a, b) => b.units - a.units);

  // Sales anomalies: days more than two standard deviations from the period average.
  const dailyRevenue = Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i);
    return { day, revenue: round(daily.get(day)?.revenue ?? 0) };
  });
  const revs = dailyRevenue.map((d) => d.revenue);
  const mean = revs.length ? revs.reduce((a, v) => a + v, 0) / revs.length : 0;
  const sd = Math.sqrt(revs.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(revs.length, 1)) || 1;
  const anomalies = dailyRevenue.map((d) => {
    const z = (d.revenue - mean) / sd;
    return { ...d, z: round(z, 2), flag: Math.abs(z) >= 2 ? (z > 0 ? 'Unusually high' : 'Unusually low') : 'Normal' };
  }).filter((d) => d.flag !== 'Normal');

  const marginAlerts = menuRows
    .filter((r) => r.marginPct !== null && (r.marginPct < 50 || r.cost > r.price * 0.5))
    .map((r) => ({
      dish: r.dish,
      category: r.category,
      price: r.price,
      cost: r.cost,
      margin: r.margin,
      marginPct: r.marginPct!,
      severity: (r.marginPct! < 35 ? 'critical' : 'warning') as 'critical' | 'warning',
      suggestedPrice: round2c(r.cost / 0.4),
    }))
    .sort((a, b) => a.marginPct - b.marginPct);

  return {
    profitability: await computeProfitability(from, to),
    generatedAt: new Date().toISOString(),
    menuEngineering,
    marginAlerts,
    anomalies,
    reorderAlerts: purchaseRecommendations.filter((p) => p.priority === 'urgent' || p.priority === 'watch'),
    today,
    filters: { from, to, days, horizonDays: horizon, categoryId: opts.categoryId ?? null },
    window: { from, to, previousFrom: prevFrom, previousTo: prevTo, nextFrom, nextTo },
    categories: categories.map((c) => ({ id: num(c.id), name: String(c.name) })),
    sales: {
      unitsInRange,
      unitsPrevious,
      revenueInRange,
      growthPct: unitsPrevious > 0 ? round(((unitsInRange - unitsPrevious) / unitsPrevious) * 100, 1) : null,
      avgDailyRevenue: round(revenueInRange / days),
      forecastUnits: round(itemForecast.reduce((s, f) => s + f.forecastUnits, 0), 1),
      forecastRevenue: round(itemForecast.reduce((s, f) => s + f.forecastRevenue, 0)),
    },
    dailySales: Array.from({ length: days }, (_, i) => {
      const day = addDays(from, i);
      const d = daily.get(day) ?? { units: 0, revenue: 0 };
      return { day, units: d.units, revenue: round(d.revenue) };
    }),
    categorySales: Array.from(catMap, ([name, v]) => ({ name, units: v.units, revenue: round(v.revenue) }))
      .sort((a, b) => b.revenue - a.revenue),
    itemForecast,
    ingredientConsumption: purchaseRecommendations.filter((r) => r.hasRecipe).map((r) => ({
      inventoryId: r.inventoryId, name: r.name, unit: r.unit,
      consumedInRange: r.consumedInRange, consumedPrevious: r.consumedPrevious,
      forecastNeed: r.forecastNeed, growthPct: r.consumptionGrowthPct,
    })),
    purchaseRecommendations,
    coverage: {
      availableMenuItems: availableItems,
      withRecipes,
      missingRecipes: menu.filter((m) => m.isAvailable && num(m.recipeCount) === 0).map((m) => String(m.name)).slice(0, 15),
      note: withRecipes === 0
        ? 'No recipes are defined, so ingredient consumption and recipe-based needs are zero. Only minimum stock levels drive purchases.'
        : null,
    },
  };
}

export type Insights = Awaited<ReturnType<typeof buildInsights>>;
