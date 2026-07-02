import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { usePos } from "@/lib/pos-store";
import { OrderPanel } from "@/components/order-panel";
import { MenuPicker } from "@/components/menu-picker";
import { cn } from "@/lib/utils";
import { useConfig } from "@/lib/config-store";

export const Route = createFileRoute("/pos")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' });
    }
  },
  head: () => ({
    meta: [
      { title: "Dine-In POS — Forno" },
      { name: "description", content: "Manage table orders, send KOTs and take payment." },
    ],
  }),
  component: PosPage,
});

function PosPage() {
  const { tables, orders, openOrderForTable, dispatch } = usePos();
  const { config } = useConfig();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const sections = config.tableSections.filter(s => s.active).sort((a,b) => a.sortOrder - b.sortOrder).map(s => s.name);
  const orderForTable = (tid: string) => orders.find((o) => o.tableId === tid && o.status === "open");
  const activeOrder = selectedTable ? orderForTable(selectedTable) : null;

  const handleTransfer = async (order: any) => {
    const targetName = prompt("Enter target table name (e.g., T2, P1):");
    if (!targetName) return;
    const targetTable = tables.find(t => t.name.toLowerCase() === targetName.toLowerCase());
    if (!targetTable) { alert("Table not found"); return; }
    
    const existingOrder = orders.find(o => o.tableId === targetTable.id && o.status === "open");
    if (existingOrder) { alert("Target table is occupied. Use Merge instead."); return; }
    
    dispatch({ type: "TRANSFER_TABLE", orderId: order.id, newTableId: targetTable.id });
    setSelectedTable(targetTable.id);
    
    try {
      const { transferTableFn } = await import('@/lib/api');
      await transferTableFn({ data: { orderId: order.id, newTableId: targetTable.id } });
    } catch (e) {
      console.error("Failed to sync transfer", e);
    }
  };

  const handleMerge = async (order: any) => {
    const targetName = prompt("Enter target table name to merge into (e.g., T2):");
    if (!targetName) return;
    const targetTable = tables.find(t => t.name.toLowerCase() === targetName.toLowerCase());
    if (!targetTable) { alert("Table not found"); return; }
    
    const targetOrder = orders.find(o => o.tableId === targetTable.id && o.status === "open");
    if (!targetOrder) { alert("Target table has no open order."); return; }
    if (targetOrder.id === order.id) { alert("Cannot merge into itself."); return; }
    
    dispatch({ type: "MERGE_TABLES", sourceOrderId: order.id, targetOrderId: targetOrder.id });
    setSelectedTable(targetTable.id);
    
    try {
      const { mergeTablesFn } = await import('@/lib/api');
      await mergeTablesFn({ data: { sourceOrderId: order.id, targetOrderId: targetOrder.id } });
    } catch (e) {
      console.error("Failed to sync merge", e);
    }
  };

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
              <div className="flex justify-between items-center mb-3">
                <button onClick={() => setSelectedTable(null)} className="text-sm text-primary hover:underline self-start">← All tables</button>
                <div className="flex gap-2">
                  <button className="text-xs px-3 py-1.5 border rounded-md hover:bg-muted transition-colors font-medium" onClick={() => handleTransfer(activeOrder)}>Transfer Table</button>
                  <button className="text-xs px-3 py-1.5 border rounded-md hover:bg-muted transition-colors font-medium" onClick={() => handleMerge(activeOrder)}>Merge Tables</button>
                </div>
              </div>
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
