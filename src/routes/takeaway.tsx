import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { usePos, fmtMoney } from "@/lib/pos-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { OrderPanel } from "@/components/order-panel";
import { MenuPicker } from "@/components/menu-picker";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/takeaway")({
  head: () => ({
    meta: [
      { title: "Takeaway — Forno" },
      { name: "description", content: "Create takeaway orders and process payment." },
    ],
  }),
  component: TakeawayPage,
});

function TakeawayPage() {
  const { orders, openTakeawayOrder, getOrderTotals } = usePos();
  const open = orders.filter((o) => o.type === "takeaway" && o.status === "open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const active = selectedId ? open.find((o) => o.id === selectedId) : null;

  return (
    <div className="flex flex-col h-screen">
      <header className="px-6 py-4 border-b bg-card">
        <h1 className="text-xl font-semibold">Takeaway</h1>
        <p className="text-xs text-muted-foreground">Quick-service orders for pickup.</p>
      </header>
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[260px_1fr_360px]">
        <aside className="border-r bg-card p-4 overflow-y-auto">
          <div className="flex gap-2 mb-3">
            <Input placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button size="icon" onClick={() => { const o = openTakeawayOrder(name || "Walk-in"); setSelectedId(o.id); setName(""); }}><Plus /></Button>
          </div>
          <div className="space-y-2">
            {open.length === 0 && <p className="text-xs text-muted-foreground">No open takeaway orders.</p>}
            {open.map((o) => {
              const t = getOrderTotals(o);
              return (
                <Card
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(o.id)}
                  className={`p-3 cursor-pointer ${selectedId === o.id ? "border-primary" : ""}`}
                >
                  <div className="text-sm font-medium">{o.customerName ?? "Walk-in"}</div>
                  <div className="text-[11px] text-muted-foreground flex justify-between">
                    <span>{o.items.length} items</span><span>{fmtMoney(t.total)}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </aside>
        <div className="overflow-y-auto p-6">
          {active ? (
            <MenuPicker orderId={active.id} />
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">Create or select a takeaway order.</div>
          )}
        </div>
        <aside className="border-l bg-muted/30 p-4 overflow-hidden">
          {active ? <OrderPanel order={active} /> : <div className="h-full grid place-items-center text-sm text-muted-foreground">No order selected.</div>}
        </aside>
      </div>
    </div>
  );
}