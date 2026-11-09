import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { usePos, fmtMoney, type MenuItem, type MenuCategory, type Station } from "@/lib/pos-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addMenuItemFn, deleteMenuItemFn, getInventoryItemsFn, getRecipeBomFn, upsertRecipeBomFn } from "@/lib/api";
import { useConfig } from "@/lib/config-store";
import { toast } from "sonner";

export const Route = createFileRoute("/menu")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' });
    }
  },
  head: () => ({ meta: [{ title: "Menu — Forno" }, { name: "description", content: "Manage menu items, prices and availability." }] }),
  component: MenuPage,
});

function MenuPage() {
  const { menu, dispatch } = usePos();
  const { config } = useConfig();
  const cats = config.categories.filter(c => c.active).map(c => c.name);
  const stations = config.stations.filter(s => s.active).map(s => s.name);
  const taxSlabs = config.taxSlabs.filter(t => t.active);
  
  const [draft, setDraft] = useState<MenuItem>({ 
    id: "", name: "", price: 0, 
    category: cats[0] || "Mains", 
    station: stations[0] || "Kitchen", 
    available: true, stock: 0,
    taxSlabId: ''
  });
  const [activeMenuItem, setActiveMenuItem] = useState<MenuItem | null>(null);
  const [bomModalOpen, setBomModalOpen] = useState(false);

  const addItem = async () => {
    if (!draft.name.trim() || draft.price <= 0) return;
    try {
      const res = await addMenuItemFn({ data: { name: draft.name, price: draft.price, category: draft.category, station: draft.station, available: draft.available } });
      dispatch({ type: "UPSERT_MENU", item: { ...draft, id: res.id, station: res.station || draft.station } });
      setDraft({ id: "", name: "", price: 0, category: cats[0] || "Mains", station: stations[0] || "Kitchen", available: true, stock: 0 });
    } catch (err) {
      console.error(err);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await deleteMenuItemFn({ data: { id } });
      dispatch({ type: "DELETE_MENU", id });
    } catch (err) {
      console.error(err);
    }
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
          <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={draft.station} onValueChange={(v) => setDraft({ ...draft, station: v })}>
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
                  <Button size="sm" variant="outline" className="mr-2" onClick={() => { setActiveMenuItem(m); setBomModalOpen(true); }}>BOM</Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteItem(m.id)}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      
      {activeMenuItem && (
        <RecipeBomModal 
          isOpen={bomModalOpen} 
          onClose={() => setBomModalOpen(false)} 
          menuItem={activeMenuItem} 
        />
      )}
    </div>
  );
}

function RecipeBomModal({ isOpen, onClose, menuItem }: { isOpen: boolean, onClose: () => void, menuItem: MenuItem }) {
  const [inventory, setInventory] = useState<Array<{ id: string; name: string; unit: string }>>([]);
  const [bom, setBom] = useState<Array<{ inventoryId: string; quantity: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newItemId, setNewItemId] = useState("");
  const [newQty, setNewQty] = useState("");

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      Promise.all([
        getInventoryItemsFn(),
        getRecipeBomFn({ data: { menuItemId: menuItem.id } })
      ]).then(([invItems, bomItems]) => {
        setInventory(invItems);
        setBom(bomItems.map(b => ({ inventoryId: b.inventoryId, quantity: b.quantity })));
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [isOpen, menuItem.id]);

  const addBomItem = () => {
    if (!newItemId || !newQty || isNaN(Number(newQty))) return;
    if (bom.some(b => b.inventoryId === newItemId)) return toast.error("Item already in recipe");
    setBom([...bom, { inventoryId: newItemId, quantity: Number(newQty) }]);
    setNewItemId("");
    setNewQty("");
  };

  const removeBomItem = (invId: string) => {
    setBom(bom.filter(b => b.inventoryId !== invId));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertRecipeBomFn({ data: { menuItemId: menuItem.id, items: bom } });
      toast.success("Recipe updated!");
      onClose();
    } catch (err) {
      toast.error("Failed to update recipe");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Recipe BOM: {menuItem.name}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium">Ingredient</label>
                <Select value={newItemId} onValueChange={setNewItemId}>
                  <SelectTrigger><SelectValue placeholder="Select raw item..." /></SelectTrigger>
                  <SelectContent>
                    {inventory.map(i => <SelectItem key={i.id} value={i.id}>{i.name} ({i.unit})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24">
                <label className="text-xs font-medium">Qty</label>
                <Input type="number" placeholder="Qty" value={newQty} onChange={e => setNewQty(e.target.value)} />
              </div>
              <Button onClick={addBomItem}><Plus className="h-4 w-4" /></Button>
            </div>

            <div className="border rounded-md divide-y">
              {bom.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No ingredients added yet.</div>}
              {bom.map((b, idx) => {
                const invItem = inventory.find(i => i.id === b.inventoryId);
                return (
                  <div key={idx} className="flex items-center justify-between p-2 text-sm">
                    <span>{invItem?.name || "Unknown"}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{b.quantity} {invItem?.unit}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeBomItem(b.inventoryId)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Recipe"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}