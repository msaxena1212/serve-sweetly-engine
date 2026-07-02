import { createFileRoute, redirect } from "@tanstack/react-router";
import { type Station } from "@/lib/pos-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getActiveOrdersFn, getTablesFn, updateOrderItemStatusFn } from "@/lib/api";
import { useConfig } from "@/lib/config-store";

export const Route = createFileRoute("/kds")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' });
    }
  },
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
  const [station, setStation] = useState<(typeof stations)[number]>("All");
  const queryClient = useQueryClient();
  const { config } = useConfig();
  const { slaWarningMin, slaCriticalMin, refreshIntervalSec } = config.kds;

  // Derive active stations from config + always add "All"
  const activeStations: string[] = ["All", ...config.stations.filter(s => s.active).map(s => s.name)];

  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: () => getTablesFn(),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['activeOrders'],
    queryFn: () => getActiveOrdersFn(),
    refetchInterval: refreshIntervalSec * 1000,
  });

  const advanceMutation = useMutation({
    mutationFn: async ({ itemId, currentStatus }: { itemId: string; currentStatus: string }) => {
      const next: Record<string, string> = {
        new: "sent",
        sent: "preparing",
        preparing: "ready",
        ready: "served",
      };
      await updateOrderItemStatusFn({ data: { itemId, status: next[currentStatus] || 'served' } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeOrders'] });
    }
  });

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
          
          let slaColor = "bg-green-500/10 text-green-600 border-green-500/20";
          if (ageMin >= slaCriticalMin) slaColor = "bg-red-500/20 text-red-600 border-red-500/30 animate-pulse";
          else if (ageMin >= slaWarningMin) slaColor = "bg-yellow-500/20 text-yellow-600 border-yellow-500/30";

          return (
            <Card key={order.id} className={cn("p-4 flex flex-col gap-2 border-2", slaColor)}>
              <div className="flex items-center justify-between pb-2 border-b border-black/10">
                <div className="font-bold text-lg">{order.type === "dine-in" ? `Table ${tableName}` : order.customerName ?? "Takeaway"}</div>
                <span className={cn("text-xs px-2.5 py-1 rounded-md font-bold bg-background")}>{ageMin} min</span>
              </div>
              <ul className="space-y-3 mt-1">
                {items.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-2 text-sm bg-background/50 p-2 rounded-md">
                    <div className="flex-1">
                      <div className="font-semibold text-base">{i.qty} × {i.name}</div>
                      {i.notes && <div className="text-[12px] text-red-600 font-bold uppercase tracking-wider mt-0.5 bg-red-100 inline-block px-1 rounded">*** {i.notes} ***</div>}
                      <div className="text-[11px] text-muted-foreground capitalize mt-1">{i.station} · {i.status}</div>
                    </div>
                    <div className="flex gap-2 shrink-0 mt-1">
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => {
                          if (confirm("Void this item?")) {
                            advanceMutation.mutate({ itemId: i.id, currentStatus: "void_override" });
                          }
                        }}
                        disabled={advanceMutation.isPending}
                      >
                        Void
                      </Button>
                      <Button 
                        size="sm" 
                        variant={i.status === "ready" ? "default" : "outline"} 
                        onClick={() => advanceMutation.mutate({ itemId: i.id, currentStatus: i.status })}
                        disabled={advanceMutation.isPending}
                      >
                        {i.status === "sent" ? "Start" : i.status === "preparing" ? "Ready" : "Serve"}
                      </Button>
                    </div>
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
