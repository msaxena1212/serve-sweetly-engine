import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { usePos } from "@/lib/pos-store";
import { OrderPanel } from "@/components/order-panel";
import { MenuPicker } from "@/components/menu-picker";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "Dine-In POS — Forno" },
      { name: "description", content: "Manage table orders, send KOTs and take payment." },
    ],
  }),
  component: PosPage,
});

function PosPage() {
  const { tables, orders, openOrderForTable } = usePos();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const sections = ["Main", "Patio", "Bar"] as const;
  const orderForTable = (tid: string) => orders.find((o) => o.tableId === tid && o.status === "open");
  const activeOrder = selectedTable ? orderForTable(selectedTable) : null;

  return (
    <div className="flex flex-col h-screen">
      <header className="px-6 py-4 border-b bg-card">
        <h1 className="text-xl font-semibold">Dine-In POS</h1>
        <p className="text-xs text-muted-foreground">Tap a table to open or resume its order.</p>
      </header>
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px]">
        <div className="overflow-y-auto p-6 space-y-6">
          {!selectedTable && sections.map((s) => (
            <section key={s}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{s}</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {tables.filter((t) => t.section === s).map((t) => {
                  const o = orderForTable(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => { openOrderForTable(t.id); setSelectedTable(t.id); }}
                      className={cn(
                        "aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition",
                        o ? "bg-primary/10 border-primary text-foreground" : "bg-card border-border hover:border-primary/40",
                      )}
                    >
                      <span className="text-lg font-semibold">{t.name}</span>
                      <span className="text-[10px] text-muted-foreground">{t.seats} seats</span>
                      {o && <span className="text-[10px] text-primary font-medium">{o.items.length} items</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          {selectedTable && activeOrder && (
            <div className="h-full flex flex-col">
              <button onClick={() => setSelectedTable(null)} className="text-sm text-primary hover:underline self-start mb-3">← All tables</button>
              <MenuPicker orderId={activeOrder.id} />
            </div>
          )}
        </div>
        <aside className="border-l bg-muted/30 p-4 overflow-hidden">
          {activeOrder ? (
            <OrderPanel order={activeOrder} />
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted-foreground text-center px-6">
              Select a table to start or resume an order.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}