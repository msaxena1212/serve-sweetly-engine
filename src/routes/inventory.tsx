import { createFileRoute } from "@tanstack/react-router";
import { usePos } from "@/lib/pos-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Minus } from "lucide-react";

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Forno" }, { name: "description", content: "Track stock levels and adjust quantities." }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const { menu, dispatch } = usePos();
  const low = menu.filter((m) => m.stock <= 10).length;

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="text-xs text-muted-foreground">{menu.length} SKUs · {low} low-stock</p>
        </div>
      </header>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Item</th>
              <th className="text-left px-4 py-2">Category</th>
              <th className="text-right px-4 py-2">In stock</th>
              <th className="text-center px-4 py-2 w-48">Adjust</th>
            </tr>
          </thead>
          <tbody>
            {menu.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-4 py-2 font-medium">{m.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{m.category}</td>
                <td className={`px-4 py-2 text-right font-semibold ${m.stock <= 10 ? "text-primary" : ""}`}>{m.stock}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-center gap-1">
                    <Button size="icon" variant="outline" onClick={() => dispatch({ type: "ADJUST_STOCK", id: m.id, delta: -1 })}><Minus /></Button>
                    <Button size="icon" variant="outline" onClick={() => dispatch({ type: "ADJUST_STOCK", id: m.id, delta: 1 })}><Plus /></Button>
                    <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "ADJUST_STOCK", id: m.id, delta: 10 })}>+10</Button>
                    <Button size="sm" onClick={() => dispatch({ type: "ADJUST_STOCK", id: m.id, delta: 50 })}>+50</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}