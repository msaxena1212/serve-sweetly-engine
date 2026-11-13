import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, ShoppingCart, ArrowRight, Download, Bot, Copy, Send } from "lucide-react";
import { getAiInsightsFn, getAiAnalysisFn } from "@/lib/ai";
import { createPoFromAiRecommendationsFn } from "@/lib/api";
import { apiClient } from "@/fe/api-client";
import { toast } from "sonner";
import type { Insights } from "@/lib/ai-analytics";
import { usePager, Pager } from "@/components/pager";
import { RichText } from "@/components/rich-text";
import { InfoTip } from "@/components/insight-charts";
import { ProfitTrendChart, CategoryProfitChart, MarginByDishChart, CostTrendChart } from "@/components/profit-charts";
import { DailyRevenueChart, UnitsPerDayChart, ForecastChart, CategoryChart, IngredientChart, OrderQtyChart, MenuScatter } from "@/components/insight-charts";

export const Route = createFileRoute("/ai")({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
  },
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : "overview",
  }),
  head: () => ({ meta: [{ title: "AI Insights — Forno" }] }),
  component: AiInsightsPage,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return iso(d); };
const money = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const PRESETS = [
  { label: "Last 7 days", from: () => shift(6), to: () => iso(new Date()) },
  { label: "Last 30 days", from: () => shift(29), to: () => iso(new Date()) },
  { label: "This month", from: () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); }, to: () => iso(new Date()) },
];

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "demand", label: "Demand forecast" },
  { id: "ingredients", label: "Ingredients & purchasing" },
  { id: "menu", label: "Dish Profitability & Popularity" },
  { id: "trends", label: "Sales trends" },
  { id: "profit", label: "Profitability" },
  { id: "summary", label: "Daily summary" },
  { id: "agents", label: "AI Agents & Bots" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-red-100 text-red-800",
  watch: "bg-amber-100 text-amber-800",
  routine: "bg-emerald-100 text-emerald-800",
  none: "bg-muted text-muted-foreground",
};

function AiInsightsPage() {
  const search = Route.useSearch();
  const [from, setFrom] = useState(shift(6));
  const [to, setTo] = useState(iso(new Date()));
  const [horizon, setHorizon] = useState(7);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [priority, setPriority] = useState<"all" | "urgent" | "watch" | "routine">("all");
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [analysis, setAnalysis] = useState<{ text: string; model: string; generatedAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [creatingPo, setCreatingPo] = useState(false);
  const [agentReorder, setAgentReorder] = useState<any | null>(null);
  const [agentBriefing, setAgentBriefing] = useState<any | null>(null);
  const [agentBusy, setAgentBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>(() => {
    const valid = TABS.find((t) => t.id === search.tab);
    return valid ? valid.id : "overview";
  });

  useEffect(() => {
    if (search.tab && TABS.some((t) => t.id === search.tab)) {
      setTab(search.tab as TabId);
    }
  }, [search.tab]);

  const filters = { from, to, horizonDays: horizon, categoryId };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAiInsightsFn({ data: filters })
      .then((r) => { if (!cancelled) setData(r as Insights); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, horizon, categoryId]);

  const runAnalysis = async () => {
    setBusy(true);
    setError(null);
    try {
      setAnalysis(await getAiAnalysisFn({ data: filters }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI analysis failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAutoCreatePo = async (specificItems?: typeof orders) => {
    const toOrder = (specificItems ?? orders).filter((p) => p.recommendedOrderQty > 0);
    if (!toOrder.length) {
      toast.info("No items have a positive recommended order quantity.");
      return;
    }
    setCreatingPo(true);
    try {
      const res = await createPoFromAiRecommendationsFn({
        data: {
          items: toOrder.map((p) => ({
            inventoryId: p.inventoryId,
            qty: p.recommendedOrderQty,
            unitPrice: p.lastUnitPrice,
          })),
        },
      });
      toast.success(
        `Draft Purchase Order ${res.invoiceNumber} created for ${res.itemsCount} items (${money(res.total)}). View it in Purchases.`,
        {
          action: {
            label: "Open Purchases",
            onClick: () => router.navigate({ to: "/purchases" }),
          },
          duration: 8000,
        }
      );
    } catch (e: any) {
      toast.error(e.message || "Failed to create Purchase Order");
    } finally {
      setCreatingPo(false);
    }
  };

  const runReorderAgent = async () => {
    setAgentBusy("reorder");
    try {
      const res = await apiClient.ai.reorder();
      setAgentReorder(res);
      toast.success(`Autonomous Reorder scanned ${res.itemsReorderedCount} low-stock items.`);
    } catch (e: any) {
      toast.error(e.message || "Autonomous Reorder Agent failed");
    } finally {
      setAgentBusy(null);
    }
  };

  const runOwnerBriefingBot = async () => {
    setAgentBusy("briefing");
    try {
      const res = await apiClient.ai.briefing();
      setAgentBriefing(res);
      toast.success("Executive Owner Briefing compiled.");
    } catch (e: any) {
      toast.error(e.message || "Executive Briefing Bot failed");
    } finally {
      setAgentBusy(null);
    }
  };

  const downloadForecastCsv = () => {
    if (!data) return;
    const header = ["Item", "Category", "Units Sold", "Previous Period Units", "Growth %", `Forecast Units (${horizon}d)`, `Forecast Revenue (${horizon}d)`, "Trend"];
    const rows = (data.itemForecast ?? []).map((i) => [
      `"${i.name.replace(/"/g, '""')}"`,
      `"${i.category}"`,
      i.unitsInRange,
      i.unitsPrevious,
      i.growthPct === null ? "" : `${i.growthPct}%`,
      i.forecastUnits,
      i.forecastRevenue,
      i.trend,
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-demand-forecast-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("AI Demand Forecast CSV downloaded");
  };

  const downloadPurchasesCsv = () => {
    if (!data) return;
    const header = ["Ingredient", "Unit", "Priority", "On Hand", "Min Qty", `Forecast Need (${horizon}d)`, "Recommended Order Qty", "Last Unit Price", "Est. Cost"];
    const rows = (data.purchaseRecommendations ?? []).map((p) => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.unit}"`,
      p.priority,
      p.available,
      p.minQty,
      p.forecastNeed,
      p.recommendedOrderQty,
      p.lastUnitPrice ?? "",
      p.estimatedCost ?? "",
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-purchase-recommendations-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("AI Purchase Recommendations CSV downloaded");
  };

  const orders = (data?.purchaseRecommendations ?? []).filter(
    (p) => (p.recommendedOrderQty > 0 || p.priority !== "none") && (priority === "all" || p.priority === priority),
  );
  const forecastRows = (data?.itemForecast ?? []).filter((i) => i.forecastUnits > 0 || i.unitsInRange > 0);
  const maxDaily = Math.max(1, ...(data?.dailySales.map((d) => d.revenue) ?? [1]));

  const recPager = usePager(orders);
  const fcPager = usePager(forecastRows);
  const ingPager = usePager(data?.ingredientConsumption ?? []);
  const menuPager = usePager(data?.menuEngineering ?? []);
  const anomalyPager = usePager(data?.anomalies ?? []);
  const reorderPager = usePager(data?.reorderAlerts ?? []);
  const catPager = usePager(data?.categorySales ?? []);
  const profitPager = usePager(data?.profitability.byDish ?? []);
  const advicePager = usePager(data?.profitability.priceAdvice ?? []);

  return (
    <div className="space-y-6 p-6 animate-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">AI Insights</h1>
          <p className="text-sm text-muted-foreground">
            Sales, demand, ingredient use and purchasing, from your own data.
          </p>
        </div>
        <Button onClick={runAnalysis} disabled={busy || loading || !data}>
          <Sparkles className="mr-2 h-4 w-4" />{busy ? "Writing summary…" : "Generate daily summary"}
        </Button>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.label} variant="outline" size="sm" onClick={() => { setFrom(p.from()); setTo(p.to()); }}>{p.label}</Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => { setFrom(shift(6)); setTo(iso(new Date())); setHorizon(7); setCategoryId(null); setPriority("all"); }}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <label className="text-xs text-muted-foreground">From
            <input type="date" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground">To
            <input type="date" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground">Forecast length
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              <option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Category
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">All categories</option>
              {data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Purchase priority
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="all">All</option><option value="urgent">Urgent</option><option value="watch">Watch</option><option value="routine">Routine</option>
            </select>
          </label>
        </div>
        {data && (
          <p className="text-xs text-muted-foreground">
            Showing {data.filters.days} days ({data.window.from} → {data.window.to}), compared with the {data.filters.days} days before.
            Forecast: {data.window.nextFrom} → {data.window.nextTo}.
          </p>
        )}
      </Card>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {loading && !data && <div className="text-sm text-muted-foreground">Loading insights…</div>}

      {data && (
        <>
          <div className="flex flex-wrap gap-2 border-b pb-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {data.coverage.note && <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{data.coverage.note}</div>}

          {tab === "overview" && (
            <>
              <div className="grid gap-4 lg:grid-cols-2"><DailyRevenueChart data={data} /><UnitsPerDayChart data={data} /></div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Card className="p-4 lift"><div className="text-xs text-muted-foreground">Units sold</div><div className="text-2xl font-semibold tabular-nums">{data.sales.unitsInRange.toLocaleString("en-IN")}</div><div className="text-xs text-muted-foreground">{data.sales.growthPct === null ? "no previous period" : `${data.sales.growthPct}% vs previous period`}</div></Card>
                <Card className="p-4 lift"><div className="text-xs text-muted-foreground">Revenue</div><div className="text-2xl font-semibold tabular-nums">{money(data.sales.revenueInRange)}</div><div className="text-xs text-muted-foreground">{money(data.sales.avgDailyRevenue)} per day</div></Card>
                <Card className="p-4 lift"><div className="text-xs text-muted-foreground">Forecast units</div><div className="text-2xl font-semibold tabular-nums">{data.sales.forecastUnits.toLocaleString("en-IN")}</div><div className="text-xs text-muted-foreground">next {data.filters.horizonDays} days</div></Card>
                <Card className="p-4 lift"><div className="text-xs text-muted-foreground">Forecast revenue</div><div className="text-2xl font-semibold tabular-nums">{money(data.sales.forecastRevenue)}</div></Card>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Card className="p-4"><div className="text-xs text-muted-foreground">Items to reorder</div><div className="text-2xl font-semibold tabular-nums">{data.reorderAlerts.length}</div></Card>
                <Card className="p-4"><div className="text-xs text-muted-foreground">Recipes defined</div><div className="text-2xl font-semibold tabular-nums">{data.coverage.withRecipes} / {data.coverage.availableMenuItems}</div></Card>
                <Card className="p-4"><div className="text-xs text-muted-foreground">Dishes ranked</div><div className="text-2xl font-semibold tabular-nums">{data.menuEngineering.length}</div></Card>
                <Card className="p-4"><div className="text-xs text-muted-foreground">Unusual days</div><div className="text-2xl font-semibold tabular-nums">{data.anomalies.length}</div></Card>
              </div>
              <Card className="p-4">
                <h2 className="mb-3 font-semibold">Top reorder alerts</h2>
                {data.reorderAlerts.length === 0 ? <p className="text-sm text-muted-foreground">No reorder alerts.</p> : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Ingredient</th><th>Priority</th><th className="text-right">On hand</th><th className="text-right">Order qty</th></tr></thead>
                    <tbody>{data.reorderAlerts.slice(0, 5).map((p) => <tr key={p.inventoryId} className="border-t"><td className="py-2">{p.name} <span className="text-muted-foreground">({p.unit})</span></td><td><span className={`rounded px-2 py-0.5 text-xs ${PRIORITY_STYLE[p.priority]}`}>{p.priority}</span></td><td className="text-right">{p.available}</td><td className="text-right">{p.recommendedOrderQty}</td></tr>)}</tbody>
                  </table>
                )}
              </Card>
            </>
          )}

          {tab === "demand" && (
            <>
              <div className="grid gap-4 lg:grid-cols-2"><ForecastChart data={data} /><CategoryChart data={data} /></div>
              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h2 className="font-semibold">Item demand forecast (next {data.filters.horizonDays} days)</h2>
                  <Button variant="outline" size="sm" onClick={downloadForecastCsv}>
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download Forecast CSV
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Item</th><th>Category</th><th className="text-right">Sold</th><th className="text-right">Previous</th><th className="text-right">Growth</th><th className="text-right">Forecast units</th><th className="text-right">Forecast revenue</th><th>Trend</th></tr></thead>
                    <tbody>
                      {fcPager.rows.map((i) => (
                        <tr key={i.menuItemId} className="border-t">
                          <td className="py-2">{i.name}</td>
                          <td className="text-muted-foreground">{i.category}</td>
                          <td className="text-right">{i.unitsInRange}</td>
                          <td className="text-right">{i.unitsPrevious}</td>
                          <td className="text-right">{i.growthPct === null ? "—" : `${i.growthPct}%`}</td>
                          <td className="text-right font-semibold">{i.forecastUnits}</td>
                          <td className="text-right">{money(i.forecastRevenue)}</td>
                          <td>{i.trend}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager p={fcPager} />
              </Card>
              <Card className="p-4">
                <h2 className="mb-3 font-semibold">Category sales</h2>
                {data.categorySales.length === 0 ? <p className="text-sm text-muted-foreground">No sales in this period.</p> : (
                  <>
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Category</th><th className="text-right">Units</th><th className="text-right">Revenue</th></tr></thead>
                      <tbody>{catPager.rows.map((c) => <tr key={c.name} className="border-t"><td className="py-2">{c.name}</td><td className="text-right">{c.units}</td><td className="text-right">{money(c.revenue)}</td></tr>)}</tbody>
                    </table>
                    <Pager p={catPager} />
                  </>
                )}
              </Card>
            </>
          )}

          {tab === "ingredients" && (
            <>
              <div className="grid gap-4 lg:grid-cols-2"><IngredientChart data={data} /><OrderQtyChart data={data} /></div>
              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <h2 className="mb-0.5 font-semibold text-base">Purchase recommendations</h2>
                    <p className="text-xs text-muted-foreground">Order quantity = forecast need + minimum stock − stock on hand.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={downloadPurchasesCsv}>
                      <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
                    </Button>
                    {orders.some((p) => p.recommendedOrderQty > 0) && (
                      <Button
                        size="sm"
                        onClick={() => handleAutoCreatePo()}
                        disabled={creatingPo}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                        {creatingPo ? "Creating Draft PO…" : "1-Click Draft PO for All Items"}
                      </Button>
                    )}
                  </div>
                </div>
                {orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing needs ordering for this filter.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Item</th><th>Priority</th><th className="text-right">On hand</th><th className="text-right">Min</th><th className="text-right">Forecast need</th><th className="text-right">Order qty</th><th className="text-right">Est. cost</th><th className="text-right pr-2">Action</th></tr></thead>
                      <tbody>
                        {recPager.rows.map((p) => (
                          <tr key={p.inventoryId} className="border-t">
                            <td className="py-2">{p.name} <span className="text-muted-foreground">({p.unit})</span></td>
                            <td><span className={`rounded px-2 py-0.5 text-xs ${PRIORITY_STYLE[p.priority]}`}>{p.priority}</span></td>
                            <td className="text-right">{p.available}</td>
                            <td className="text-right">{p.minQty}</td>
                            <td className="text-right">{p.hasRecipe ? p.forecastNeed : "no recipe"}</td>
                            <td className="text-right font-semibold">{p.recommendedOrderQty}</td>
                            <td className="text-right">{p.estimatedCost === null ? "—" : money(p.estimatedCost)}</td>
                            <td className="text-right pr-2">
                              {p.recommendedOrderQty > 0 ? (
                                <button
                                  onClick={() => handleAutoCreatePo([p])}
                                  disabled={creatingPo}
                                  className="text-xs text-emerald-600 hover:underline font-medium"
                                >
                                  + Draft PO
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">In stock</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Pager p={recPager} />
                  </div>
                )}
              </Card>
              <Card className="p-4">
                <h2 className="mb-1 font-semibold">Reorder alerts</h2>
                <p className="mb-3 text-xs text-muted-foreground">Urgent: below minimum or not enough for the forecast. Watch: consumption is rising fast.</p>
                {data.reorderAlerts.length === 0 ? <p className="text-sm text-muted-foreground">No reorder alerts.</p> : (
                  <>
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Ingredient</th><th>Priority</th><th className="text-right">On hand</th><th className="text-right">Minimum</th><th className="text-right">Order qty</th></tr></thead>
                      <tbody>{reorderPager.rows.map((p) => <tr key={p.inventoryId} className="border-t"><td className="py-2">{p.name} <span className="text-muted-foreground">({p.unit})</span></td><td><span className={`rounded px-2 py-0.5 text-xs ${PRIORITY_STYLE[p.priority]}`}>{p.priority}</span></td><td className="text-right">{p.available}</td><td className="text-right">{p.minQty}</td><td className="text-right">{p.recommendedOrderQty}</td></tr>)}</tbody>
                    </table>
                    <Pager p={reorderPager} />
                  </>
                )}
              </Card>
              <Card className="p-4">
                <h2 className="mb-3 font-semibold">Ingredient consumption (from recipes)</h2>
                {data.ingredientConsumption.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recipes are defined yet. Add them in Menu → BOM.</p>
                ) : (
                  <>
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Ingredient</th><th className="text-right">Used</th><th className="text-right">Previous</th><th className="text-right">Forecast need</th></tr></thead>
                      <tbody>{ingPager.rows.map((c) => <tr key={c.inventoryId} className="border-t"><td className="py-2">{c.name} <span className="text-muted-foreground">({c.unit})</span></td><td className="text-right">{c.consumedInRange}</td><td className="text-right">{c.consumedPrevious}</td><td className="text-right">{c.forecastNeed}</td></tr>)}</tbody>
                    </table>
                    <Pager p={ingPager} />
                  </>
                )}
              </Card>
            </>
          )}

          {tab === "menu" && (
            <div className="space-y-4">
            <MenuScatter data={data} />

            {data.marginAlerts && data.marginAlerts.length > 0 && (
              <Card className="p-4 border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-amber-900 dark:text-amber-200">⚠️ AI Margin & Cost Spike Alerts</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 font-medium">{data.marginAlerts.length} items</span>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">Dishes with gross margins under 50% based on recent ingredient purchase costs. Review pricing or recipe BOM.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1.5">Dish</th>
                        <th>Category</th>
                        <th className="text-right">Price</th>
                        <th className="text-right">Ingredient Cost</th>
                        <th className="text-right">Margin %</th>
                        <th className="text-right">Suggested Price (60% Margin)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.marginAlerts.map((a) => (
                        <tr key={a.dish} className="border-t border-amber-200/50">
                          <td className="py-2 font-medium">{a.dish}</td>
                          <td className="text-muted-foreground text-xs">{a.category}</td>
                          <td className="text-right">{money(a.price)}</td>
                          <td className="text-right text-red-600 font-medium">{money(a.cost)}</td>
                          <td className="text-right">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${a.severity === 'critical' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                              {a.marginPct}%
                            </span>
                          </td>
                          <td className="text-right font-semibold text-emerald-700">{money(a.suggestedPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <Card className="p-4">
              <h2 className="mb-1 font-semibold">Dish Profitability & Popularity Analysis</h2>
              <p className="mb-3 text-xs text-muted-foreground">Champions sell well and earn well. Crowd pleasers sell well at lower margin. Hidden gems earn well but sell less. Dishes marked Review do neither and need a look at price, recipe or placement.</p>
              {data.menuEngineering.length === 0 ? (
                <p className="text-sm text-muted-foreground">Needs dishes with both sales and a recipe cost in this period.</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Dish</th><th>Category</th><th>Class</th><th className="text-right">Sold</th><th className="text-right">Margin ₹</th><th className="text-right">Margin %</th></tr></thead>
                    <tbody>{menuPager.rows.map((m) => <tr key={m.dish} className="border-t"><td className="py-2">{m.dish}</td><td className="text-muted-foreground">{m.category}</td><td>{m.class}</td><td className="text-right">{m.units}</td><td className="text-right">{money(m.margin)}</td><td className="text-right">{m.marginPct === null ? "—" : `${m.marginPct}%`}</td></tr>)}</tbody>
                  </table>
                  <Pager p={menuPager} />
                </>
              )}
            </Card>
            </div>
          )}

          {tab === "trends" && (
            <>
              <div className="grid gap-4 lg:grid-cols-2"><DailyRevenueChart data={data} /><UnitsPerDayChart data={data} /></div>
              <Card className="p-4">
                <h2 className="mb-3 font-semibold">Daily sales</h2>
                <div className="space-y-1.5">
                  {data.dailySales.map((d) => (
                    <div key={d.day} className="flex items-center gap-3 text-xs">
                      <span className="w-20 text-muted-foreground">{d.day.slice(5)}</span>
                      <div className="h-3 flex-1 rounded bg-muted"><div className="h-3 rounded bg-primary" style={{ width: `${(d.revenue / maxDaily) * 100}%` }} /></div>
                      <span className="w-24 text-right tabular-nums">{money(d.revenue)}</span>
                      <span className="w-16 text-right tabular-nums text-muted-foreground">{d.units} units</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-4">
                <h2 className="mb-1 font-semibold">Sales anomalies</h2>
                <p className="mb-3 text-xs text-muted-foreground">Days whose sales are two or more standard deviations from the period average.</p>
                {data.anomalies.length === 0 ? <p className="text-sm text-muted-foreground">No unusual days in this period.</p> : (
                  <>
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Date</th><th className="text-right">Sales</th><th>Flag</th></tr></thead>
                      <tbody>{anomalyPager.rows.map((a) => <tr key={a.day} className="border-t"><td className="py-2">{a.day}</td><td className="text-right">{money(a.revenue)}</td><td>{a.flag}</td></tr>)}</tbody>
                    </table>
                    <Pager p={anomalyPager} />
                  </>
                )}
              </Card>
            </>
          )}

          {tab === "profit" && (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Card className="p-4 lift"><div className="text-xs text-muted-foreground">Revenue</div><div className="text-2xl font-semibold tabular-nums">{money(data.profitability.summary.revenue)}</div><div className="text-xs text-muted-foreground">paid sales in the period</div></Card>
                <Card className="p-4 lift"><div className="text-xs text-muted-foreground">Food cost</div><div className="text-2xl font-semibold tabular-nums">{money(data.profitability.summary.foodCost)}</div><div className="text-xs text-muted-foreground">{data.profitability.summary.foodCostPct}% of revenue</div></Card>
                <Card className="p-4 lift"><div className="text-xs text-muted-foreground">Gross profit</div><div className="text-2xl font-semibold tabular-nums">{money(data.profitability.summary.grossProfit)}</div><div className="text-xs text-muted-foreground">revenue minus food cost</div></Card>
                <Card className="p-4 lift"><div className="text-xs text-muted-foreground">Gross margin</div><div className="text-2xl font-semibold tabular-nums">{data.profitability.summary.marginPct}%</div><div className="text-xs text-muted-foreground">target {Math.round(data.profitability.target * 100)}%</div></Card>
              </div>
              {data.profitability.coverage.note && <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{data.profitability.coverage.note}</div>}
              <div className="rounded border bg-muted/40 p-3 text-xs text-muted-foreground">
                Food cost only. Labour, rent, utilities and wastage are not included, so this is gross margin, not net profit.
              </div>
              <div className="grid gap-4 lg:grid-cols-2"><ProfitTrendChart profit={data.profitability} /><CategoryProfitChart profit={data.profitability} /></div>
              <div className="grid gap-4 lg:grid-cols-2"><MarginByDishChart profit={data.profitability} /><CostTrendChart profit={data.profitability} /></div>
              <Card className="p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">Profit by dish</h2>
                    <p className="text-xs text-muted-foreground">Sorted by gross profit.</p>
                  </div>
                  <InfoTip text="Units sold × price gives revenue. Units sold × recipe cost gives food cost. Recipe cost is the sum of each ingredient's quantity × its last purchase price. Profit = revenue − food cost. Margin = profit ÷ revenue." />
                </div>
                {data.profitability.byDish.length === 0 ? <p className="text-sm text-muted-foreground">No paid sales in this period.</p> : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Dish</th><th>Category</th><th className="text-right">Units</th><th className="text-right">Revenue</th><th className="text-right">Food cost</th><th className="text-right">Profit</th><th className="text-right">Margin</th></tr></thead>
                        <tbody>{profitPager.rows.map((d) => <tr key={d.dishId} className="border-t"><td className="py-2">{d.dish}{!d.hasRecipe && <span className="ml-2 text-xs text-muted-foreground">no recipe</span>}</td><td className="text-muted-foreground">{d.category}</td><td className="text-right">{d.units}</td><td className="text-right">{money(d.revenue)}</td><td className="text-right">{money(d.cost)}</td><td className="text-right font-semibold">{money(d.profit)}</td><td className="text-right">{d.marginPct === null ? "—" : `${d.marginPct}%`}</td></tr>)}</tbody>
                      </table>
                    </div>
                    <Pager p={profitPager} />
                  </>
                )}
              </Card>
              <Card className="p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">Price advice</h2>
                    <p className="text-xs text-muted-foreground">Dishes whose margin is below the target.</p>
                  </div>
                  <InfoTip text={`Suggested price = unit cost ÷ (1 − ${Math.round(data.profitability.target * 100)}%), rounded up to the next ₹5. Only dishes priced below that suggestion are listed. Review before changing prices.`} />
                </div>
                {data.profitability.priceAdvice.length === 0 ? <p className="text-sm text-muted-foreground">Every dish sold meets the target margin.</p> : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2">Dish</th><th className="text-right">Current price</th><th className="text-right">Unit cost</th><th className="text-right">Suggested</th><th className="text-right">Increase</th><th className="text-right">Margin now</th></tr></thead>
                        <tbody>{advicePager.rows.map((d) => <tr key={d.dishId} className="border-t"><td className="py-2">{d.dish}</td><td className="text-right">{money(d.price)}</td><td className="text-right">{money(d.unitCost)}</td><td className="text-right font-semibold">{money(d.targetPrice)}</td><td className="text-right">+{money(d.priceGap)}</td><td className="text-right">{d.marginPct === null ? "—" : `${d.marginPct}%`}</td></tr>)}</tbody>
                      </table>
                    </div>
                    <Pager p={advicePager} />
                  </>
                )}
              </Card>
            </>
          )}

          {tab === "summary" && (
            <Card className="p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Daily summary</h2>
                  <p className="text-xs text-muted-foreground">A written summary of the figures on this page, produced by the AI model.</p>
                </div>
                <Button onClick={runAnalysis} disabled={busy}><Sparkles className="mr-2 h-4 w-4" />{busy ? "Writing summary…" : "Generate daily summary"}</Button>
              </div>
              {analysis ? (
                <>
                  <div className="text-xs text-muted-foreground">Generated by {analysis.model} at {new Date(analysis.generatedAt).toLocaleString("en-IN")}</div>
                  <RichText text={analysis.text} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Press the button to write the summary.</p>
              )}
            </Card>
          )}

          {tab === "agents" && (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* 1. Autonomous Reorder Agent */}
              <Card className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" /> Autonomous Reorder Agent
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Scans stock levels against safety buffers, generates supplier POs, and drafts WhatsApp dispatch messages.
                    </p>
                  </div>
                  <Button size="sm" onClick={runReorderAgent} disabled={agentBusy === "reorder"}>
                    {agentBusy === "reorder" ? "Scanning…" : "Run Agent"}
                  </Button>
                </div>

                {agentReorder ? (
                  agentReorder.itemsReorderedCount === 0 ? (
                    <div className="p-3 rounded bg-emerald-50 text-emerald-800 text-xs">
                      All ingredients are above safety stock levels. No vendor dispatches needed.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs font-medium">
                        Found {agentReorder.itemsReorderedCount} items below threshold (Est: {money(agentReorder.totalEstimatedCost)})
                      </div>
                      {agentReorder.supplierOrders.map((po: any, idx: number) => (
                        <div key={idx} className="p-3 rounded border bg-muted/40 space-y-2 text-xs">
                          <div className="font-semibold">{po.supplierName}</div>
                          <pre className="whitespace-pre-wrap font-mono text-[11px] bg-background p-2.5 rounded border max-h-48 overflow-y-auto">
                            {po.whatsappMessage}
                          </pre>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full h-7 text-xs gap-1.5"
                            onClick={() => {
                              navigator.clipboard.writeText(po.whatsappMessage);
                              toast.success("Vendor PO message copied for WhatsApp!");
                            }}
                          >
                            <Copy className="h-3 w-3" /> Copy WhatsApp Vendor Order
                          </Button>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground italic">Click Run Agent to scan inventory and draft vendor messages.</p>
                )}
              </Card>

              {/* 2. Executive Owner Daily Briefing Bot */}
              <Card className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold flex items-center gap-2">
                      <Send className="h-4 w-4 text-primary" /> Executive Owner Briefing Bot
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Compiles live revenue, gross profit, top sellers, low stock, and cash variance into a WhatsApp/Telegram briefing.
                    </p>
                  </div>
                  <Button size="sm" onClick={runOwnerBriefingBot} disabled={agentBusy === "briefing"}>
                    {agentBusy === "briefing" ? "Compiling…" : "Generate Briefing"}
                  </Button>
                </div>

                {agentBriefing ? (
                  <div className="space-y-2">
                    <pre className="whitespace-pre-wrap font-mono text-[11px] bg-muted/40 p-3 rounded border max-h-64 overflow-y-auto">
                      {agentBriefing.formattedBriefingText}
                    </pre>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-8 text-xs gap-1.5"
                      onClick={() => {
                        navigator.clipboard.writeText(agentBriefing.formattedBriefingText);
                        toast.success("Executive briefing copied to clipboard!");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy Briefing for WhatsApp / Telegram
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Click Generate Briefing to compile today's owner report.</p>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
