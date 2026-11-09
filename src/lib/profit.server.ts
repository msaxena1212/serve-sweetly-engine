// Profitability: revenue, food cost and gross profit from paid sales and recipe costs.
// Server only. Every figure is computed from the database.
//
// Definitions (also shown to users as info text):
//   Revenue      = quantity × unit price on paid or completed order lines.
//   Unit cost    = sum over the recipe of (quantity per portion × last purchase price of the ingredient).
//   Food cost    = unit cost × quantity sold.
//   Gross profit = revenue − food cost.
//   Margin %     = gross profit ÷ revenue.
//   Target price = unit cost ÷ (1 − target margin), rounded up to the next ₹5.
import { sql } from 'drizzle-orm';
import { db } from './db/db';

export const TARGET_MARGIN = 0.65;

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const run = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Row[];

export type DishProfit = {
  dishId: number; dish: string; category: string; units: number;
  price: number; unitCost: number; revenue: number; cost: number; profit: number; marginPct: number | null;
  hasRecipe: boolean; targetPrice: number; priceGap: number;
};

export async function computeProfitability(from: string, to: string, target = TARGET_MARGIN) {
  // Recipe unit cost per dish, at the last purchase price of each ingredient.
  const costs = await run(sql`
    select m.id, m.name, m.price::float as price, coalesce(c.name, 'Uncategorised') as category,
           coalesce(sum(b.quantity * lp.price), 0)::float as unit_cost,
           count(b.inventory_id)::int as ingredients
    from menu_items m
    left join categories c on c.id = m.category_id
    left join recipe_bom b on b.menu_item_id = m.id
    left join (select distinct on (inventory_id) inventory_id, unit_price::float as price
               from purchase_order_items order by inventory_id, created_at desc) lp on lp.inventory_id = b.inventory_id
    where m.is_available
    group by m.id, m.name, m.price, c.name`);
  const costById = new Map(costs.map((c) => [n(c.id), { unitCost: n(c.unit_cost), hasRecipe: n(c.ingredients) > 0 }]));

  // Paid sales per dish and day, valued at revenue and at recipe cost.
  const sales = await run(sql`
    select oi.menu_item_id as dish_id, (o.created_at)::date::text as day,
           sum(oi.quantity)::int as units, sum(oi.quantity * oi.unit_price)::float as revenue
    from order_items oi join orders o on o.id = oi.order_id
    where o.status in ('paid', 'completed') and (o.created_at)::date between ${from}::date and ${to}::date
    group by oi.menu_item_id, (o.created_at)::date`);

  const dishes = new Map<number, { units: number; revenue: number; cost: number }>();
  const days = new Map<string, { units: number; revenue: number; cost: number }>();
  for (const s of sales) {
    const id = n(s.dish_id);
    const c = costById.get(id)?.unitCost ?? 0;
    const units = n(s.units);
    const revenue = n(s.revenue);
    const cost = units * c;
    const d = dishes.get(id) ?? { units: 0, revenue: 0, cost: 0 };
    d.units += units; d.revenue += revenue; d.cost += cost;
    dishes.set(id, d);
    const day = String(s.day);
    const dd = days.get(day) ?? { units: 0, revenue: 0, cost: 0 };
    dd.units += units; dd.revenue += revenue; dd.cost += cost;
    days.set(day, dd);
  }

  const names = new Map(costs.map((c) => [n(c.id), { name: String(c.name), category: String(c.category), price: n(c.price) }]));
  const byDish: DishProfit[] = [...dishes.entries()].map(([id, d]) => {
    const meta = names.get(id) ?? { name: 'Unknown dish', category: 'Uncategorised', price: 0 };
    const unitCost = costById.get(id)?.unitCost ?? 0;
    const hasRecipe = costById.get(id)?.hasRecipe ?? false;
    const profit = d.revenue - d.cost;
    const targetPrice = unitCost > 0 ? Math.ceil(unitCost / (1 - target) / 5) * 5 : 0;
    return {
      dishId: id, dish: meta.name, category: meta.category, units: d.units,
      price: r2(meta.price), unitCost: r2(unitCost),
      revenue: r2(d.revenue), cost: r2(d.cost), profit: r2(profit),
      marginPct: d.revenue > 0 ? pct(profit, d.revenue) : null,
      hasRecipe, targetPrice,
      priceGap: targetPrice > meta.price ? r2(targetPrice - meta.price) : 0,
    };
  }).sort((a, b) => b.profit - a.profit);

  const totalRevenue = byDish.reduce((a, d) => a + d.revenue, 0);
  const totalCost = byDish.reduce((a, d) => a + d.cost, 0);
  const grossProfit = totalRevenue - totalCost;

  const byCategory = [...byDish.reduce((m, d) => {
    const c = m.get(d.category) ?? { category: d.category, units: 0, revenue: 0, cost: 0 };
    c.units += d.units; c.revenue += d.revenue; c.cost += d.cost;
    m.set(d.category, c);
    return m;
  }, new Map<string, { category: string; units: number; revenue: number; cost: number }>()).values()]
    .map((c) => ({ category: c.category, units: c.units, revenue: r2(c.revenue), cost: r2(c.cost), profit: r2(c.revenue - c.cost), marginPct: pct(c.revenue - c.cost, c.revenue) }))
    .sort((a, b) => b.profit - a.profit);

  const byDay = [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, d]) => ({
    day, units: d.units, revenue: r2(d.revenue), cost: r2(d.cost), profit: r2(d.revenue - d.cost), marginPct: pct(d.revenue - d.cost, d.revenue),
  }));

  // Ingredient price history: average price per month for the six ingredients with the most spend.
  const trendRows = await run(sql`
    select inv.name as ingredient, to_char(date_trunc('month', poi.created_at), 'YYYY-MM') as month,
           (sum(poi.quantity * poi.unit_price) / nullif(sum(poi.quantity), 0))::float as avg_price,
           sum(poi.quantity * poi.unit_price)::float as spend
    from purchase_order_items poi join inventory inv on inv.id = poi.inventory_id
    where poi.created_at::date between ${from}::date and ${to}::date
    group by inv.name, date_trunc('month', poi.created_at) order by 2`);
  const spendBy = new Map<string, number>();
  for (const r of trendRows) spendBy.set(String(r.ingredient), (spendBy.get(String(r.ingredient)) ?? 0) + n(r.spend));
  const topIngredients = [...spendBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);
  const months = [...new Set(trendRows.map((r) => String(r.month)))].sort();
  const costTrend = {
    months,
    series: topIngredients.map((name) => ({
      name,
      points: months.map((m) => {
        const row = trendRows.find((r) => String(r.ingredient) === name && String(r.month) === m);
        return row ? r2(n(row.avg_price)) : null;
      }),
    })),
  };

  const withCost = byDish.filter((d) => d.unitCost > 0).length;
  const priceAdvice = byDish.filter((d) => d.priceGap > 0 && d.units > 0).sort((a, b) => (b.priceGap / Math.max(b.price, 1)) - (a.priceGap / Math.max(a.price, 1))).slice(0, 25);

  return {
    from, to, target,
    summary: {
      revenue: r2(totalRevenue), foodCost: r2(totalCost), grossProfit: r2(grossProfit),
      marginPct: pct(grossProfit, totalRevenue), foodCostPct: pct(totalCost, totalRevenue),
      unitsSold: byDish.reduce((a, d) => a + d.units, 0),
      dishesSold: byDish.length, dishesWithCost: withCost,
    },
    byDish,
    byCategory,
    byDay,
    priceAdvice,
    costTrend,
    coverage: {
      dishesSold: byDish.length,
      dishesWithCost: withCost,
      note: byDish.length === 0
        ? 'No paid sales in this period.'
        : withCost < byDish.length
          ? `${byDish.length - withCost} dish(es) sold without a recipe cost, so their profit is overstated.`
          : null,
    },
  };
}
