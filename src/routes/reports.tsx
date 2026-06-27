import { createFileRoute } from "@tanstack/react-router";
import { usePos, fmtMoney } from "@/lib/pos-store";
import { Card } from "@/components/ui/card";
import { useMemo } from "react";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — Forno" }, { name: "description", content: "Sales summary, top items and payment mix." }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { orders, getOrderTotals, menu } = usePos();
  const paid = orders.filter((o) => o.status === "paid");

  const summary = useMemo(() => {
    const revenue = paid.reduce((s, o) => s + getOrderTotals(o).total, 0);
    const orderCount = paid.length;
    const avg = orderCount ? revenue / orderCount : 0;
    const byMethod: Record<string, number> = { cash: 0, card: 0, upi: 0 };
    paid.forEach((o) => { if (o.paymentMethod) byMethod[o.paymentMethod] += getOrderTotals(o).total; });

    const itemCounts: Record<string, { name: string; qty: number; revenue: number }> = {};
    paid.forEach((o) => o.items.forEach((i) => {
      const k = i.menuItemId;
      if (!itemCounts[k]) itemCounts[k] = { name: i.name, qty: 0, revenue: 0 };
      itemCounts[k].qty += i.qty;
      itemCounts[k].revenue += i.qty * i.price;
    }));
    const top = Object.values(itemCounts).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    return { revenue, orderCount, avg, byMethod, top };
  }, [paid, getOrderTotals]);

  const lowStock = menu.filter((m) => m.stock <= 10);

  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-xs text-muted-foreground">Lifetime sales snapshot for this terminal.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total revenue" value={fmtMoney(summary.revenue)} />
        <Stat label="Orders" value={summary.orderCount.toString()} />
        <Stat label="Avg ticket" value={fmtMoney(summary.avg)} />
        <Stat label="Low-stock SKUs" value={lowStock.length.toString()} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="font-semibold mb-3">Payment mix</h2>
          <div className="space-y-2 text-sm">
            {(["card", "cash", "upi"] as const).map((m) => {
              const v = summary.byMethod[m] || 0;
              const pct = summary.revenue ? (v / summary.revenue) * 100 : 0;
              return (
                <div key={m}>
                  <div className="flex justify-between">
                    <span className="capitalize">{m}</span>
                    <span className="text-muted-foreground">{fmtMoney(v)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold mb-3">Top items</h2>
          {summary.top.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paid orders yet.</p>
          ) : (
            <ul className="text-sm divide-y">
              {summary.top.map((t) => (
                <li key={t.name} className="py-2 flex justify-between">
                  <span>{t.name} <span className="text-muted-foreground">× {t.qty}</span></span>
                  <span className="font-medium">{fmtMoney(t.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Card>
  );
}