import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { usePos, fmtMoney } from "@/lib/pos-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Utensils, ShoppingBag, ChefHat, AlertTriangle, TrendingUp, Receipt } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Forno POS" },
      { name: "description", content: "Live overview of sales, open tables, kitchen queue and low stock." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { orders, tables, menu, getOrderTotals } = usePos();
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const paidToday = orders.filter((o) => o.status === "paid" && (o.closedAt ?? 0) >= startOfDay);
  const revenue = paidToday.reduce((s, o) => s + getOrderTotals(o).total, 0);
  const openOrders = orders.filter((o) => o.status === "open");
  const occupiedTables = new Set(openOrders.filter((o) => o.tableId).map((o) => o.tableId)).size;
  const kitchenQueue = openOrders.flatMap((o) => o.items).filter((i) => ["sent", "preparing"].includes(i.status)).length;
  const lowStock = menu.filter((m) => m.stock <= 10);

  const stats = [
    { label: "Revenue (today)", value: fmtMoney(revenue), icon: TrendingUp, accent: "text-primary" },
    { label: "Orders paid", value: paidToday.length.toString(), icon: Receipt },
    { label: "Tables occupied", value: `${occupiedTables}/${tables.length}`, icon: Utensils },
    { label: "Kitchen queue", value: kitchenQueue.toString(), icon: ChefHat },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Good evening, Alex</h1>
          <p className="text-sm text-muted-foreground">Here's how Forno is running right now.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild><Link to="/pos"><Utensils />Open POS</Link></Button>
          <Button asChild variant="outline"><Link to="/takeaway"><ShoppingBag />New takeaway</Link></Button>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.accent ?? "text-muted-foreground"}`} />
            </div>
            <div className="mt-2 text-2xl font-semibold">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Open orders</h2>
            <Link to="/pos" className="text-xs text-primary hover:underline">Manage</Link>
          </div>
          {openOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active orders.</p>
          ) : (
            <div className="divide-y">
              {openOrders.slice(0, 8).map((o) => {
                const t = getOrderTotals(o);
                return (
                  <div key={o.id} className="py-2 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">
                        {o.type === "dine-in" ? `Table ${tables.find((t) => t.id === o.tableId)?.name ?? "?"}` : `Takeaway · ${o.customerName ?? "Guest"}`}
                      </div>
                      <div className="text-xs text-muted-foreground">{o.items.length} items · {new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                    <div className="font-semibold">{fmtMoney(t.total)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Low stock</h2>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">All items well stocked.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {lowStock.map((m) => (
                <li key={m.id} className="flex items-center justify-between">
                  <span>{m.name}</span>
                  <span className="text-xs font-medium text-primary">{m.stock} left</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
