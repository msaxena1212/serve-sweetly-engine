import { Info } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ChartTooltip, Legend, ScatterChart, Scatter, ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import type { Insights } from "@/lib/ai-analytics";

const COLORS = { primary: "#dc2626", forecast: "#f59e0b", previous: "#94a3b8", good: "#16a34a", ink: "#334155" };
const CLASS_COLOR: Record<string, string> = { Champion: "#16a34a", "Crowd pleaser": "#2563eb", "Hidden gem": "#f59e0b", Review: "#94a3b8" };

// Small info icon. Hover or focus shows how the figure is calculated.
export function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="How this is calculated" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Card with a title, an info icon and a chart area. Charts are 2D and load quickly.
export function ChartCard({ title, info, children, empty }: { title: string; info: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <Card className="p-4 lift">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <InfoTip text={info} />
      </div>
      {empty ? <p className="py-10 text-center text-sm text-muted-foreground">Not enough data in this period to draw this chart.</p> : <div className="h-64 w-full">{children}</div>}
    </Card>
  );
}

const axis = { fontSize: 11, fill: COLORS.ink };
const fmt = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

export function DailyRevenueChart({ data }: { data: Insights }) {
  const rows = data.dailySales.map((d) => ({ day: d.day.slice(5), revenue: d.revenue, units: d.units }));
  const values = data.dailySales.map((d) => d.revenue);
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(values.length, 1));
  return (
    <ChartCard
      title="Daily revenue"
      info={`Each point is the total of paid order lines for that day (quantity × unit price). The dashed lines mark the period average, plus or minus two standard deviations. Days outside them are flagged as unusual.`}
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="day" tick={axis} />
          <YAxis tick={axis} tickFormatter={(v) => `₹${v}`} />
          <ChartTooltip formatter={(v: number) => fmt(v)} />
          <ReferenceLine y={mean} stroke={COLORS.previous} strokeDasharray="4 4" />
          <ReferenceLine y={mean + 2 * sd} stroke={COLORS.forecast} strokeDasharray="2 4" />
          <ReferenceLine y={Math.max(0, mean - 2 * sd)} stroke={COLORS.forecast} strokeDasharray="2 4" />
          <Line type="monotone" dataKey="revenue" stroke={COLORS.primary} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function UnitsPerDayChart({ data }: { data: Insights }) {
  const rows = data.dailySales.map((d) => ({ day: d.day.slice(5), units: d.units }));
  return (
    <ChartCard title="Units sold per day" info="The total quantity of items sold on each day, from paid order lines. Use it with the revenue chart to see whether busy days sell more items or more expensive ones." empty={rows.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="day" tick={axis} />
          <YAxis tick={axis} />
          <ChartTooltip />
          <Bar dataKey="units" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ForecastChart({ data }: { data: Insights }) {
  const rows = [...data.itemForecast]
    .filter((i) => i.unitsInRange > 0 || i.forecastUnits > 0)
    .sort((a, b) => b.forecastUnits - a.forecastUnits)
    .slice(0, 10)
    .map((i) => ({ name: i.name.length > 16 ? i.name.slice(0, 15) + "…" : i.name, sold: i.unitsInRange, forecast: i.forecastUnits }));
  return (
    <ChartCard
      title="Sold vs forecast, top 10 items"
      info={`Sold is the units sold in the selected period. Forecast is the expected units for the next ${data.filters.horizonDays} days: average daily units in the period, scaled to the forecast length, then adjusted by half the growth against the previous period (limited to 0.5× to 1.5×).`}
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="name" tick={{ ...axis, fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
          <YAxis tick={axis} />
          <ChartTooltip />
          <Legend verticalAlign="top" height={24} />
          <Bar dataKey="sold" name="Sold" fill={COLORS.previous} radius={[4, 4, 0, 0]} />
          <Bar dataKey="forecast" name="Forecast" fill={COLORS.forecast} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function CategoryChart({ data }: { data: Insights }) {
  const rows = data.categorySales.map((c) => ({ name: c.name, revenue: c.revenue }));
  return (
    <ChartCard title="Revenue by category" info="Revenue for each menu category: the sum of quantity × unit price for paid order lines whose dish belongs to that category." empty={rows.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis type="number" tick={axis} tickFormatter={(v) => `₹${v}`} />
          <YAxis type="category" dataKey="name" tick={{ ...axis, fontSize: 10 }} width={110} />
          <ChartTooltip formatter={(v: number) => fmt(v)} />
          <Bar dataKey="revenue" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function IngredientChart({ data }: { data: Insights }) {
  const rows = [...data.ingredientConsumption]
    .sort((a, b) => b.consumedInRange - a.consumedInRange)
    .slice(0, 10)
    .map((c) => ({ name: c.name.length > 16 ? c.name.slice(0, 15) + "…" : c.name, used: c.consumedInRange, previous: c.consumedPrevious, need: c.forecastNeed }));
  return (
    <ChartCard
      title="Ingredient use: this period, previous and next"
      info="Used is the quantity of each ingredient consumed in the period, calculated as units sold × recipe quantity per dish. Previous is the same measure for the period before. Need is the forecast use over the next period, based on the demand forecast."
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="name" tick={{ ...axis, fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
          <YAxis tick={axis} />
          <ChartTooltip />
          <Legend verticalAlign="top" height={24} />
          <Bar dataKey="previous" name="Previous" fill={COLORS.previous} radius={[4, 4, 0, 0]} />
          <Bar dataKey="used" name="Used" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
          <Bar dataKey="need" name="Need" fill={COLORS.forecast} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function OrderQtyChart({ data }: { data: Insights }) {
  const rows = data.purchaseRecommendations
    .filter((p) => p.recommendedOrderQty > 0)
    .slice(0, 10)
    .map((p) => ({ name: p.name.length > 16 ? p.name.slice(0, 15) + "…" : p.name, qty: p.recommendedOrderQty, onHand: p.available, min: p.minQty }));
  return (
    <ChartCard
      title="Recommended order quantities"
      info="Order quantity = forecast need + minimum stock − stock on hand, rounded up to two decimals, and never below zero. On hand is the current stock; Min is the minimum stock level set on the item."
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="name" tick={{ ...axis, fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
          <YAxis tick={axis} />
          <ChartTooltip />
          <Legend verticalAlign="top" height={24} />
          <Bar dataKey="onHand" name="On hand" fill={COLORS.previous} radius={[4, 4, 0, 0]} />
          <Bar dataKey="qty" name="Order qty" fill={COLORS.good} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function MenuScatter({ data }: { data: Insights }) {
  const rows = data.menuEngineering.map((m) => ({ x: m.units, y: m.margin, name: m.dish, cls: m.class }));
  const avgUnits = rows.length ? rows.reduce((a, r) => a + r.x, 0) / rows.length : 0;
  const avgMargin = rows.length ? rows.reduce((a, r) => a + r.y, 0) / rows.length : 0;
  return (
    <ChartCard
      title="Dish Profitability & Popularity Matrix"
      info={`Each dot is a dish. Across: units sold in the period. Up: margin per unit (selling price minus recipe cost at the last purchase price). The lines mark the averages: units ${Math.round(avgUnits)}, margin ₹${avgMargin.toFixed(0)}. Top right = Champions (popular and profitable), bottom right = Crowd pleasers (popular, lower margin), top left = Hidden gems (profitable, less popular), bottom left = Review (neither).`}
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis type="number" dataKey="x" name="Units" tick={axis} />
          <YAxis type="number" dataKey="y" name="Margin" tick={axis} tickFormatter={(v) => `₹${v}`} />
          <ReferenceLine x={avgUnits} stroke={COLORS.previous} strokeDasharray="4 4" />
          <ReferenceLine y={avgMargin} stroke={COLORS.previous} strokeDasharray="4 4" />
          <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { name: string; x: number; y: number; cls: string };
            return <div className="rounded border bg-background p-2 text-xs shadow"><div className="font-semibold">{p.name}</div><div>{p.cls} · {p.x} sold · ₹{p.y} margin</div></div>;
          }} />
          {Object.keys(CLASS_COLOR).map((cls) => (
            <Scatter key={cls} name={cls} data={rows.filter((r) => r.cls === cls)} fill={CLASS_COLOR[cls]} />
          ))}
          <Legend verticalAlign="top" height={24} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
