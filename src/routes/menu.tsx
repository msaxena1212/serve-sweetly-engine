import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { usePos, fmtMoney, type MenuItem, type MenuCategory, type Station } from "@/lib/pos-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/menu")({
  head: () => ({ meta: [{ title: "Menu — Forno" }, { name: "description", content: "Manage menu items, prices and availability." }] }),
  component: MenuPage,
});

const cats: MenuCategory[] = ["Starters", "Mains", "Sides", "Desserts", "Beverages"];
const stations: Station[] = ["Kitchen", "Tandoor", "Bar"];

function MenuPage() {
  const { menu, dispatch } = usePos();
  const [draft, setDraft] = useState<MenuItem>({ id: "", name: "", price: 0, category: "Mains", station: "Kitchen", available: true, stock: 0 });

  const addItem = () => {
    if (!draft.name.trim() || draft.price <= 0) return;
    dispatch({ type: "UPSERT_MENU", item: { ...draft, id: `m-${Date.now()}` } });
    setDraft({ id: "", name: "", price: 0, category: "Mains", station: "Kitchen", available: true, stock: 0 });
  };

  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Menu</h1>
        <p className="text-xs text-muted-foreground">{menu.length} items · prices in USD</p>
      </header>

      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Add new item</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="md:col-span-2" />
          <Input type="number" placeholder="Price" value={draft.price || ""} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
          <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v as MenuCategory })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={draft.station} onValueChange={(v) => setDraft({ ...draft, station: v as Station })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{stations.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={addItem}><Plus /> Add</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Category</th>
              <th className="text-left px-4 py-2">Station</th>
              <th className="text-right px-4 py-2">Price</th>
              <th className="text-right px-4 py-2">Stock</th>
              <th className="text-center px-4 py-2">Available</th>
              <th className="px-2"></th>
            </tr>
          </thead>
          <tbody>
            {menu.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-4 py-2 font-medium">{m.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{m.category}</td>
                <td className="px-4 py-2 text-muted-foreground">{m.station}</td>
                <td className="px-4 py-2 text-right">{fmtMoney(m.price)}</td>
                <td className="px-4 py-2 text-right">{m.stock}</td>
                <td className="px-4 py-2 text-center">
                  <Switch checked={m.available} onCheckedChange={(v) => dispatch({ type: "UPSERT_MENU", item: { ...m, available: v } })} />
                </td>
                <td className="px-2 py-2 text-right">
                  <Button size="icon" variant="ghost" onClick={() => dispatch({ type: "DELETE_MENU", id: m.id })}><Trash2 /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}