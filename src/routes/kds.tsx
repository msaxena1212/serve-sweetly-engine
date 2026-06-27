import { createFileRoute } from "@tanstack/react-router";
import { usePos, type Station } from "@/lib/pos-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kds")({
  head: () => ({
    meta: [
      { title: "Kitchen Display — Forno" },
      { name: "description", content: "Live kitchen and bar order tickets." },
    ],
  }),
  component: KdsPage,
});

const stations: ("All" | Station)[] = ["All", "Kitchen", "Tandoor", "Bar"];

function KdsPage() {
  const { orders, tables, dispatch } = usePos();
  const [station, setStation] = useState<(typeof stations)[number]>("All");

  const tickets = useMemo(() => {
    return orders
      .filter((o) => o.status === "open")
      .map((o) => ({
        order: o,
        items: o.items.filter((i) => i.status !== "new" && i.status !== "served" && (station === "All" || i.station === station)),
      }))
      .filter((t) => t.items.length > 0)
      .sort((a, b) => a.order.createdAt - b.order.createdAt);
  }, [orders, station]);

  return (
    <div className="p-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kitchen Display</h1>
          <p className="text-xs text-muted-foreground">Tickets advance as items are prepared and served.</p>
        </div>
        <div className="flex gap-1.5">
          {stations.map((s) => (
            <button
              key={s}
              onClick={() => setStation(s)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-colors",
                station === s ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      {tickets.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">No active tickets. Send a KOT from the POS.</Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {tickets.map(({ order, items }) => {
          const tableName = order.tableId ? tables.find((t) => t.id === order.tableId)?.name : null;
          const ageMin = Math.floor((Date.now() - order.createdAt) / 60000);
          return (
            <Card key={order.id} className="p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{order.type === "dine-in" ? `Table ${tableName}` : order.customerName ?? "Takeaway"}</div>
                <span className={cn("text-xs px-2 py-0.5 rounded-full", ageMin > 10 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{ageMin}m</span>
              </div>
              <ul className="space-y-1.5">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                    <div>
                      <div className="font-medium">{i.qty} × {i.name}</div>
                      <div className="text-[11px] text-muted-foreground capitalize">{i.station} · {i.status}</div>
                    </div>
                    <Button size="sm" variant={i.status === "ready" ? "default" : "outline"} onClick={() => dispatch({ type: "ADVANCE_ITEM", orderId: order.id, itemId: i.id })}>
                      {i.status === "sent" ? "Start" : i.status === "preparing" ? "Ready" : "Serve"}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}