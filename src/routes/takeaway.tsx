import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { usePos, fmtMoney } from "@/lib/pos-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { OrderPanel } from "@/components/order-panel";
import { MenuPicker } from "@/components/menu-picker";
import { Plus, Phone, Clock, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfig } from "@/lib/config-store";

export const Route = createFileRoute("/takeaway")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' });
    }
  },
  head: () => ({
    meta: [
      { title: "Takeaway — Forno" },
      { name: "description", content: "Create takeaway orders with queue tokens and process payment." },
    ],
  }),
  component: TakeawayPage,
});

// Counter persisted in sessionStorage for queue tokens
function getNextToken(maxToken: number): number {
  const key = "takeaway-token-counter";
  const current = parseInt(sessionStorage.getItem(key) || "0", 10);
  const next = (current % maxToken) + 1;
  sessionStorage.setItem(key, next.toString());
  return next;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  paid: "bg-green-500/10 text-green-600 border-green-500/20",
  void: "bg-muted text-muted-foreground",
};

function TakeawayPage() {
  const { orders, openTakeawayOrder, getOrderTotals } = usePos();
  const open = orders.filter((o) => o.type === "takeaway" && o.status === "open");
  const recent = orders.filter((o) => o.type === "takeaway" && o.status === "paid").slice(-5).reverse();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const { config } = useConfig();
  const active = selectedId ? open.find((o) => o.id === selectedId) : null;

  const handleCreate = () => {
    if (config.takeaway.requirePhone && !phone.trim()) {
      return alert("Phone number is required for takeaway orders.");
    }
    const token = getNextToken(config.takeaway.tokenMax);
    const label = name.trim() || `Token #${token}`;
    const order = openTakeawayOrder(label) as any;
    // Attach token to order for display (local state only)
    (order as any).__token = token;
    setSelectedId(order.id);
    setName("");
    setPhone("");
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="px-6 py-4 border-b bg-card flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Takeaway</h1>
          <p className="text-xs text-muted-foreground">Queue-based quick-service orders with tokens.</p>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Hash className="h-4 w-4" />
          <span className="font-bold text-foreground">{open.length}</span> open
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[280px_1fr_360px]">
        {/* Queue Sidebar */}
        <aside className="border-r bg-card flex flex-col">
          {/* New Order Form */}
          <div className="p-4 border-b space-y-2">
            <Input
              placeholder="Customer name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <Input
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="text-sm"
            />
            <Button className="w-full" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Takeaway Order
            </Button>
          </div>

          {/* Active Queue */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-1 mb-1">Active Queue</div>
            {open.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No active takeaway orders.</p>
            )}
            {open.map((o, idx) => {
              const t = getOrderTotals(o);
              const ageMin = Math.floor((Date.now() - o.createdAt) / 60000);
              const isActive = selectedId === o.id;
              return (
                <Card
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(o.id)}
                  className={cn(
                    "p-3 cursor-pointer transition-all border-2",
                    isActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center text-base font-bold shrink-0",
                        isActive ? "bg-primary text-primary-foreground" : "bg-muted"
                      )}>
                        {idx + 1}
                      </div>
                      <div>
                        <div className="text-sm font-semibold leading-tight">{o.customerName ?? "Walk-in"}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {ageMin}m ago · {o.items.length} items
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-bold text-right shrink-0">{fmtMoney(t.total)}</div>
                  </div>
                  {/* Item status summary */}
                  {o.items.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {o.items.map((i) => (
                        <span
                          key={i.id}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            i.status === "ready" ? "bg-green-500/20 text-green-700" :
                            i.status === "preparing" ? "bg-yellow-500/20 text-yellow-700" :
                            i.status === "served" ? "bg-muted text-muted-foreground" :
                            "bg-blue-500/10 text-blue-600"
                          )}
                        >
                          {i.name.split(" ")[0]}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}

            {/* Recent Completed */}
            {recent.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-1 mt-4 mb-1">Recently Completed</div>
                {recent.map((o) => {
                  const t = getOrderTotals(o);
                  return (
                    <div key={o.id} className="px-3 py-2 text-xs text-muted-foreground flex justify-between rounded-md bg-muted/40">
                      <span>{o.customerName ?? "Walk-in"}</span>
                      <span className="font-medium text-green-600">{fmtMoney(t.total)} ✓</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </aside>

        {/* Menu Picker */}
        <div className="overflow-y-auto p-6">
          {active ? (
            <MenuPicker orderId={active.id} />
          ) : (
            <div className="h-full grid place-items-center">
              <div className="text-center space-y-2">
                <div className="text-4xl">🛍️</div>
                <div className="text-sm font-medium">Create or select a takeaway order</div>
                <div className="text-xs text-muted-foreground">Use the panel on the left to start a new order</div>
              </div>
            </div>
          )}
        </div>

        {/* Order Panel */}
        <aside className="border-l bg-muted/30 p-4 overflow-hidden">
          {active ? (
            <OrderPanel order={active} />
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted-foreground text-center px-6">
              No order selected.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
