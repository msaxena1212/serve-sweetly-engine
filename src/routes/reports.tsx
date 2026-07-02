import { createFileRoute, redirect } from "@tanstack/react-router";
import { usePos, fmtMoney } from "@/lib/pos-store";
import { Card } from "@/components/ui/card";
import { useMemo, useState } from "react";
import { TrendingUp, Receipt, Users, ShoppingBag, CreditCard, Banknote, Smartphone, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' });
    }
  },
  head: () => ({
    meta: [
      { title: "Reports — Forno" },
      { name: "description", content: "Sales summary, top items, payment mix and hourly breakdown." },
    ],
  }),
  component: ReportsPage,
});

const RANGES = ["Today", "This Week", "All Time"] as const;
type Range = (typeof RANGES)[number];

function ReportsPage() {
  const { orders, getOrderTotals, menu } = usePos();
  const [range, setRange] = useState<Range>("Today");

  const now = Date.now();
  const paid = useMemo(() => {
    const filtered = orders.filter((o) => o.status === "paid");
    if (range === "Today") {
      const sod = new Date();
      sod.setHours(0, 0, 0, 0);
      return filtered.filter((o) => (o.closedAt ?? 0) >= sod.getTime());
    }
    if (range === "This Week") {
      const sow = new Date();
      sow.setDate(sow.getDate() - sow.getDay());
      sow.setHours(0, 0, 0, 0);
      return filtered.filter((o) => (o.closedAt ?? 0) >= sow.getTime());
    }
    return filtered;
  }, [orders, range]);

  const summary = useMemo(() => {
    const revenue = paid.reduce((s, o) => s + getOrderTotals(o).total, 0);
    const orderCount = paid.length;
    const avg = orderCount ? revenue / orderCount : 0;
    const dineIn = paid.filter((o) => o.type === "dine-in").length;
    const takeaway = paid.filter((o) => o.type === "takeaway").length;
    const byMethod: Record<string, number> = { cash: 0, card: 0, upi: 0 };
    paid.forEach((o) => { if (o.paymentMethod) byMethod[o.paymentMethod] += getOrderTotals(o).total; });

    const itemCounts: Record<string, { name: string; qty: number; revenue: number; category: string }> = {};
    paid.forEach((o) => o.items.forEach((i) => {
      if (!itemCounts[i.menuItemId]) itemCounts[i.menuItemId] = { name: i.name, qty: 0, revenue: 0, category: "" };
      itemCounts[i.menuItemId].qty += i.qty;
      itemCounts[i.menuItemId].revenue += i.qty * i.price;
    }));
    const top = Object.values(itemCounts).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    // Hourly breakdown (0-23)
    const hourly: number[] = Array(24).fill(0);
    paid.forEach((o) => {
      const h = new Date(o.closedAt ?? o.createdAt).getHours();
      hourly[h] += getOrderTotals(o).total;
    });
    const peakHour = hourly.indexOf(Math.max(...hourly));
    const hourlyMax = Math.max(...hourly, 1);

    return { revenue, orderCount, avg, byMethod, top, dineIn, takeaway, hourly, peakHour, hourlyMax };
  }, [paid, getOrderTotals]);

  const lowStock = menu.filter((m) => m.stock <= 10);

  const methodIcons = { cash: Banknote, card: CreditCard, upi: Smartphone };
  const methodColors = { cash: "text-green-600", card: "text-blue-600", upi: "text-purple-600" };

  return (
    <div className="p-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Reports
          </h1>
          <p className="text-xs text-muted-foreground">Sales analytics · {paid.length} orders in range</p>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-colors",
                range === r ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </header>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={TrendingUp} label="Revenue" value={fmtMoney(summary.revenue)} accent="text-primary" />
        <Stat icon={Receipt} label="Orders" value={summary.orderCount.toString()} />
        <Stat icon={Users} label="Avg Ticket" value={fmtMoney(summary.avg)} />
        <Stat icon={ShoppingBag} label="Dine-in / Takeaway" value={`${summary.dineIn} / ${summary.takeaway}`} />
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Payment Mix */}
        <Card className="p-5">
          <h2 className="font-semibold mb-4 text-sm">Payment Mix</h2>
          <div className="space-y-3 text-sm">
            {(["cash", "card", "upi"] as const).map((m) => {
              const v = summary.byMethod[m] || 0;
              const pct = summary.revenue ? (v / summary.revenue) * 100 : 0;
              const Icon = methodIcons[m];
              return (
                <div key={m}>
                  <div className="flex justify-between items-center mb-1">
                    <span className={cn("flex items-center gap-1.5 capitalize font-medium", methodColors[m])}>
                      <Icon className="h-3.5 w-3.5" />{m}
                    </span>
                    <span className="text-muted-foreground text-xs">{fmtMoney(v)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", m === "cash" ? "bg-green-500" : m === "card" ? "bg-blue-500" : "bg-purple-500")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Top Items */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold mb-3 text-sm">Top Items by Revenue</h2>
          {summary.top.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paid orders yet.</p>
          ) : (
            <div className="space-y-2">
              {summary.top.map((t, idx) => {
                const pct = summary.revenue ? (t.revenue / summary.revenue) * 100 : 0;
                return (
                  <div key={t.name} className="flex items-center gap-3 text-sm">
                    <span className="text-xs text-muted-foreground w-4 text-right font-mono">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-0.5">
                        <span className="font-medium truncate">{t.name}</span>
                        <span className="text-muted-foreground ml-2 shrink-0 text-xs">×{t.qty} · {fmtMoney(t.revenue)}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Hourly Breakdown */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm">Hourly Sales</h2>
          {summary.peakHour > 0 && (
            <span className="text-xs text-muted-foreground">
              Peak: {summary.peakHour % 12 || 12}{summary.peakHour < 12 ? "am" : "pm"} · {fmtMoney(summary.hourly[summary.peakHour])}
            </span>
          )}
        </div>
        <div className="flex items-end gap-0.5 h-24">
          {summary.hourly.map((val, h) => {
            const heightPct = (val / summary.hourlyMax) * 100;
            const isPeak = h === summary.peakHour && val > 0;
            return (
              <div key={h} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div className="w-full rounded-sm transition-all bg-muted" style={{ height: "100%" }}>
                  <div
                    className={cn("w-full rounded-sm transition-all", isPeak ? "bg-primary" : "bg-primary/40")}
                    style={{ height: `${heightPct}%`, marginTop: `${100 - heightPct}%` }}
                  />
                </div>
                {/* Tooltip */}
                {val > 0 && (
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-popover border rounded px-2 py-1 text-[10px] whitespace-nowrap z-10 shadow-md">
                    {h % 12 || 12}{h < 12 ? "am" : "pm"} · {fmtMoney(val)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground mt-1.5 px-0.5">
          <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
        </div>
      </Card>

      {/* Low Stock from Reports */}
      {lowStock.length > 0 && (
        <Card className="p-5">
          <h2 className="font-semibold mb-3 text-sm">Items Needing Restock</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {lowStock.map((m) => (
              <div key={m.id} className={cn(
                "p-3 rounded-lg border text-sm",
                m.stock <= 3 ? "border-red-200 bg-red-500/5" : "border-yellow-200 bg-yellow-500/5"
              )}>
                <div className="font-medium truncate">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.category}</div>
                <div className={cn("text-lg font-bold mt-1", m.stock <= 3 ? "text-red-600" : "text-yellow-600")}>
                  {m.stock} <span className="text-xs font-normal">in stock</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", accent ?? "text-muted-foreground")} />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </Card>
  );
}
