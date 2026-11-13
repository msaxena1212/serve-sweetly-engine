import { createFileRoute, redirect } from "@tanstack/react-router";
import { type Station } from "@/lib/pos-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMemo, useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getActiveOrdersFn, getTablesFn, updateOrderItemStatusFn } from "@/lib/api";
import { useConfig } from "@/lib/config-store";
import { LayoutList, Ticket, CheckCheck, Volume2, VolumeX } from "lucide-react";
import { playKitchenChime } from "@/fe/components/kitchen-audio";

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
  const [viewMode, setViewMode] = useState<"item" | "kot">("item");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevCountRef = useRef(0);
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

  const handleBumpAll = async (items: any[]) => {
    // Optimistic or sequential bump all
    const promises = items.map(i => updateOrderItemStatusFn({ data: { itemId: i.id, status: 'served' } }));
    await Promise.all(promises);
    queryClient.invalidateQueries({ queryKey: ['activeOrders'] });
  };

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

  useEffect(() => {
    const totalItems = tickets.reduce((sum, t) => sum + t.items.length, 0);
    if (totalItems > prevCountRef.current && soundEnabled && prevCountRef.current > 0) {
      playKitchenChime();
    }
    prevCountRef.current = totalItems;
  }, [tickets, soundEnabled]);

  return (
    <div className="p-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kitchen Display</h1>
          <p className="text-xs text-muted-foreground">Tickets advance as items are prepared and served.</p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              if (next) playKitchenChime();
            }}
            className="text-xs gap-1.5 h-8"
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5 text-emerald-600" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
            {soundEnabled ? "Chime On" : "Muted"}
          </Button>
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            <button
              onClick={() => setViewMode("item")}
              className={cn("text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all", viewMode === "item" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              <LayoutList className="h-3.5 w-3.5" /> Item View
            </button>
            <button
              onClick={() => setViewMode("kot")}
              className={cn("text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all", viewMode === "kot" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              <Ticket className="h-3.5 w-3.5" /> KOT View
            </button>
          </div>
          <div className="h-6 w-px bg-border"></div>
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
          let slaBorder = "border-green-500/20";
          if (ageMin >= slaCriticalMin) {
            slaColor = "bg-red-500/20 text-red-600 border-red-500/30 animate-pulse";
            slaBorder = "border-red-500/50";
          } else if (ageMin >= slaWarningMin) {
            slaColor = "bg-yellow-500/20 text-yellow-600 border-yellow-500/30";
            slaBorder = "border-yellow-500/50";
          }

          const isBumpScreen = config.kds.bumpScreenMode;

          if (viewMode === "kot") {
            return (
              <Card key={order.id} className={cn("flex flex-col border-t-8 shadow-md", slaBorder, isBumpScreen && "scale-[1.02] transform transition-transform")}>
                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between pb-3 border-b border-dashed border-border/80">
                    <div>
                      <div className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase mb-1">
                        KOT #{order.id.padStart(4, "0")}
                      </div>
                      <div className={cn("font-bold", isBumpScreen ? "text-2xl" : "text-lg")}>
                        {order.type === "dine-in" ? `Table ${tableName}` : order.customerName ?? "Takeaway"}
                      </div>
                    </div>
                    <div className={cn("font-bold rounded-md flex flex-col items-center justify-center", isBumpScreen ? "w-16 h-16 text-xl" : "w-12 h-12 text-sm", slaColor)}>
                      {ageMin}
                      <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">min</span>
                    </div>
                  </div>
                  
                  <ul className="mt-3 space-y-3">
                    {items.map((i) => (
                      <li key={i.id} className="text-sm">
                        <div className="flex items-start gap-2">
                          <span className={cn("font-bold mt-0.5", isBumpScreen ? "text-xl" : "text-base")}>{i.qty}</span>
                          <span className={cn("mt-0.5 opacity-50", isBumpScreen ? "text-xl" : "text-base")}>×</span>
                          <div className="flex-1">
                            <span className={cn("font-semibold", isBumpScreen ? "text-xl" : "text-base")}>{i.name}</span>
                            {config.kds.showItemNotes && i.notes && (
                              <div className={cn("text-red-600 font-bold uppercase tracking-wider bg-red-100/50 inline-block px-1.5 py-0.5 rounded mt-1", isBumpScreen ? "text-sm" : "text-[11px]")}>
                                *** {i.notes} ***
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 mt-0.5">
                            <span className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                              i.status === "sent" ? "bg-muted text-muted-foreground" :
                              i.status === "preparing" ? "bg-amber-500/10 text-amber-600" :
                              "bg-green-500/10 text-green-600"
                            )}>
                              {i.status}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="p-3 bg-muted/20 border-t mt-auto">
                  <Button 
                    className={cn("w-full font-bold", isBumpScreen && "h-14 text-lg")} 
                    size={isBumpScreen ? "lg" : "default"}
                    onClick={() => handleBumpAll(items)}
                  >
                    <CheckCheck className="h-5 w-5 mr-2" /> BUMP ALL ({items.length})
                  </Button>
                </div>
              </Card>
            );
          }

          return (
            <Card key={order.id} className={cn("p-4 flex flex-col gap-2 border-2", slaColor, isBumpScreen && "scale-[1.02] transform transition-transform")}>
              <div className="flex items-center justify-between pb-2 border-b border-black/10">
                <div className={cn("font-bold", isBumpScreen ? "text-xl" : "text-lg")}>{order.type === "dine-in" ? `Table ${tableName}` : order.customerName ?? "Takeaway"}</div>
                <span className={cn("px-2.5 py-1 rounded-md font-bold bg-background", isBumpScreen ? "text-sm" : "text-xs")}>{ageMin} min</span>
              </div>
              <ul className="space-y-3 mt-1">
                {items.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-2 text-sm bg-background/50 p-2 rounded-md">
                    <div className="flex-1">
                      <div className={cn("font-semibold", isBumpScreen ? "text-lg" : "text-base")}>{i.qty} × {i.name}</div>
                      {config.kds.showItemNotes && i.notes && <div className="text-[12px] text-red-600 font-bold uppercase tracking-wider mt-0.5 bg-red-100 inline-block px-1 rounded">*** {i.notes} ***</div>}
                      <div className="text-[11px] text-muted-foreground capitalize mt-1">{i.station} · {i.status}</div>
                    </div>
                    <div className="flex gap-2 shrink-0 mt-1">
                      <Button 
                        size={isBumpScreen ? "default" : "sm"}
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
                        size={isBumpScreen ? "default" : "sm"}
                        variant={i.status === "ready" ? "default" : "outline"} 
                        onClick={() => advanceMutation.mutate({ itemId: i.id, currentStatus: i.status })}
                        disabled={advanceMutation.isPending}
                        className={cn(isBumpScreen && "font-bold")}
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
