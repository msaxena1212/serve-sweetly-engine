import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ReferenceLine } from "recharts";
import { ChartCard } from "@/components/insight-charts";
import type { Insights } from "@/lib/ai-analytics";

type Profit = Insights["profitability"];
const axis = { fontSize: 11, fill: "#334155" };
const fmt = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const short = (s: string) => (s.length > 16 ? s.slice(0, 15) + "…" : s);
const COLORS = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2"];

export function ProfitTrendChart({ profit }: { profit: Profit }) {
  const rows = profit.byDay.map((d) => ({ day: d.day.slice(5), revenue: d.revenue, cost: d.cost, profit: d.profit }));
  return (
    <ChartCard
      title="Revenue, food cost and gross profit by day"
      info="Each day's paid sales. Revenue is quantity × unit price. Food cost is units × recipe cost (ingredients at their last purchase price). Gross profit = revenue − food cost. It excludes labour, rent and wastage."
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="day" tick={axis} />
          <YAxis tick={axis} tickFormatter={(v) => `₹${v}`} />
          <RTooltip formatter={(v: number) => fmt(v)} />
          <Legend verticalAlign="top" height={24} />
          <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="cost" name="Food cost" stroke="#94a3b8" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="profit" name="Gross profit" stroke="#16a34a" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function CategoryProfitChart({ profit }: { profit: Profit }) {
  const rows = profit.byCategory.map((c) => ({ name: short(c.category), profit: c.profit, cost: c.cost }));
  return (
    <ChartCard
      title="Gross profit by category"
      info="Gross profit for each menu category: the sum of revenue minus food cost for the dishes in that category, in the selected period."
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis type="number" tick={axis} tickFormatter={(v) => `₹${v}`} />
          <YAxis type="category" dataKey="name" tick={{ ...axis, fontSize: 10 }} width={110} />
          <RTooltip formatter={(v: number) => fmt(v)} />
          <Bar dataKey="profit" name="Gross profit" fill="#16a34a" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function MarginByDishChart({ profit }: { profit: Profit }) {
  const rows = profit.byDish
    .filter((d) => d.units > 0 && d.marginPct !== null)
    .sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0))
    .slice(0, 12)
    .map((d) => ({ name: short(d.dish), margin: d.marginPct ?? 0, target: profit.target * 100 }));
  return (
    <ChartCard
      title="Lowest-margin dishes (12)"
      info={`Gross margin for each dish sold in the period: (price − recipe cost) ÷ price, listed from lowest up. The dashed line is the target margin (${Math.round(profit.target * 100)}%). Dishes below it are candidates for a price review.`}
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="name" tick={{ ...axis, fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
          <YAxis tick={axis} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
          <RTooltip formatter={(v: number) => `${v}%`} />
          <ReferenceLine y={profit.target * 100} stroke="#f59e0b" strokeDasharray="4 4" />
          <Bar dataKey="margin" name="Margin" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function CostTrendChart({ profit }: { profit: Profit }) {
  const trend = profit.costTrend;
  const rows = trend.months.map((m, i) => {
    const row: Record<string, number | string | null> = { month: m };
    for (const s of trend.series) row[s.name] = s.points[i];
    return row;
  });
  return (
    <ChartCard
      title="Ingredient price history (top 6 by spend)"
      info="Average unit price paid per month for the six ingredients with the highest spend in the period. Each line is calculated as total spend ÷ total quantity bought in that month. Rising lines show cost pressure on your margins."
      empty={rows.length === 0 || trend.series.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="month" tick={axis} />
          <YAxis tick={axis} tickFormatter={(v) => `₹${v}`} />
          <RTooltip formatter={(v: number) => `₹${v}`} />
          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
          {trend.series.map((s, i) => (
            <Line key={s.name} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
