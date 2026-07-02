import { createFileRoute, redirect } from "@tanstack/react-router";
import { usePos, fmtMoney } from "@/lib/pos-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus, AlertTriangle, ShoppingCart, Package, X, Check, TrendingDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/inventory")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' });
    }
  },
  head: () => ({
    meta: [
      { title: "Inventory — Forno" },
      { name: "description", content: "Track stock levels, adjust quantities, and manage purchase orders." },
    ],
  }),
  component: InventoryPage,
});

// --- Purchase Order Types (local state only) ---
interface PurchaseItem { menuItemId: string; name: string; qty: number; unitCost: number; }
interface PurchaseOrder {
  id: string;
  supplier: string;
  items: PurchaseItem[];
  status: "draft" | "sent" | "received";
  createdAt: number;
}

const SUPPLIER_LIST = ["FreshMart Wholesale", "Metro Cash & Carry", "Raj Provisions", "Local Farm Co."];

function InventoryPage() {
  const { menu, dispatch } = usePos();
  const [tab, setTab] = useState<"stock" | "orders">("stock");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newOrder, setNewOrder] = useState<{ supplier: string; items: PurchaseItem[] }>({
    supplier: SUPPLIER_LIST[0],
    items: [],
  });
  const [adjustQty, setAdjustQty] = useState<Record<string, string>>({});

  const low = menu.filter((m) => m.stock <= 10);
  const filtered = menu.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.category.toLowerCase().includes(search.toLowerCase())
  );

  const addToOrder = (item: typeof menu[0]) => {
    setNewOrder((prev) => {
      const exists = prev.items.find((i) => i.menuItemId === item.id);
      if (exists) {
        return { ...prev, items: prev.items.map((i) => i.menuItemId === item.id ? { ...i, qty: i.qty + 10 } : i) };
      }
      return { ...prev, items: [...prev.items, { menuItemId: item.id, name: item.name, qty: 10, unitCost: item.price * 0.4 }] };
    });
    setShowNewOrder(true);
  };

  const submitOrder = () => {
    if (newOrder.items.length === 0) { toast.error("Add at least one item"); return; }
    const order: PurchaseOrder = {
      id: `po-${Date.now()}`,
      supplier: newOrder.supplier,
      items: newOrder.items,
      status: "sent",
      createdAt: Date.now(),
    };
    setOrders((prev) => [order, ...prev]);
    setNewOrder({ supplier: SUPPLIER_LIST[0], items: [] });
    setShowNewOrder(false);
    toast.success(`Purchase order sent to ${order.supplier}`);
  };

  const receiveOrder = (id: string) => {
    setOrders((prev) => prev.map((o) => {
      if (o.id !== id) return o;
      // Bump stock for each received item
      o.items.forEach((i) => dispatch({ type: "ADJUST_STOCK", id: i.menuItemId, delta: i.qty }));
      return { ...o, status: "received" };
    }));
    toast.success("Stock updated — order marked received");
  };

  const applyManualAdj = (id: string) => {
    const val = parseInt(adjustQty[id] || "0", 10);
    if (!val || isNaN(val)) return;
    dispatch({ type: "ADJUST_STOCK", id, delta: val });
    setAdjustQty((prev) => ({ ...prev, [id]: "" }));
    toast.success(`Stock adjusted by ${val > 0 ? "+" : ""}${val}`);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inventory & Purchasing</h1>
          <p className="text-xs text-muted-foreground">{menu.length} SKUs · <span className={low.length > 0 ? "text-red-600 font-semibold" : ""}>{low.length} low-stock</span></p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={tab === "stock" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("stock")}
          >
            <Package className="h-3.5 w-3.5 mr-1.5" /> Stock Levels
          </Button>
          <Button
            variant={tab === "orders" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("orders")}
          >
            <ShoppingCart className="h-3.5 w-3.5 mr-1.5" /> Purchase Orders
            {orders.filter((o) => o.status === "sent").length > 0 && (
              <span className="ml-1.5 bg-primary-foreground text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {orders.filter((o) => o.status === "sent").length}
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* Low Stock Alert Bar */}
      {low.length > 0 && tab === "stock" && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-red-700">Low stock alert: </span>
            <span className="text-red-600">{low.map((m) => `${m.name} (${m.stock})`).join(" · ")}</span>
            <button
              className="ml-3 underline text-primary text-xs font-medium"
              onClick={() => {
                low.forEach((item) => addToOrder(item));
                setTab("orders");
              }}
            >
              Reorder all →
            </button>
          </div>
        </div>
      )}

      {/* STOCK TAB */}
      {tab === "stock" && (
        <>
          <Input
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5">Item</th>
                  <th className="text-left px-4 py-2.5">Category · Station</th>
                  <th className="text-right px-4 py-2.5">In Stock</th>
                  <th className="text-center px-4 py-2.5 w-52">Quick Adjust</th>
                  <th className="text-center px-4 py-2.5 w-44">Manual</th>
                  <th className="text-center px-4 py-2.5">Reorder</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const isLow = m.stock <= 10;
                  const isCritical = m.stock <= 3;
                  return (
                    <tr key={m.id} className={cn("border-t transition-colors", isCritical ? "bg-red-500/5" : isLow ? "bg-yellow-500/5" : "")}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{m.name}</div>
                        {isCritical && <div className="text-[10px] text-red-600 font-bold uppercase">Critical</div>}
                        {!isCritical && isLow && <div className="text-[10px] text-yellow-600 font-bold uppercase">Low</div>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{m.category} · {m.station}</td>
                      <td className={`px-4 py-2.5 text-right font-bold text-base ${isCritical ? "text-red-600" : isLow ? "text-yellow-600" : ""}`}>
                        {m.stock}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-center gap-1">
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => dispatch({ type: "ADJUST_STOCK", id: m.id, delta: -1 })}><Minus className="h-3 w-3" /></Button>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => dispatch({ type: "ADJUST_STOCK", id: m.id, delta: 1 })}><Plus className="h-3 w-3" /></Button>
                          <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => dispatch({ type: "ADJUST_STOCK", id: m.id, delta: 10 })}>+10</Button>
                          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => dispatch({ type: "ADJUST_STOCK", id: m.id, delta: 50 })}>+50</Button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1 justify-center">
                          <Input
                            type="number"
                            placeholder="±qty"
                            className="h-7 w-20 text-sm text-center"
                            value={adjustQty[m.id] || ""}
                            onChange={(e) => setAdjustQty((prev) => ({ ...prev, [m.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && applyManualAdj(m.id)}
                          />
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => applyManualAdj(m.id)}>Apply</Button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Button
                          size="sm"
                          variant={isLow ? "default" : "ghost"}
                          className="h-7 text-xs"
                          onClick={() => { addToOrder(m); setTab("orders"); }}
                        >
                          <ShoppingCart className="h-3 w-3 mr-1" />
                          Order
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* PURCHASE ORDERS TAB */}
      {tab === "orders" && (
        <div className="grid lg:grid-cols-[1fr_340px] gap-5">
          {/* Orders List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Purchase Orders</h2>
              <Button size="sm" variant="outline" onClick={() => setShowNewOrder(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New Order
              </Button>
            </div>

            {orders.length === 0 && (
              <Card className="p-10 text-center text-sm text-muted-foreground">
                <ShoppingCart className="h-8 w-8 mx-auto mb-3 opacity-30" />
                No purchase orders yet. Use the Stock tab to reorder items.
              </Card>
            )}

            {orders.map((po) => {
              const total = po.items.reduce((s, i) => s + i.qty * i.unitCost, 0);
              return (
                <Card key={po.id} className={cn("p-4", po.status === "received" ? "opacity-60" : "")}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="font-semibold">{po.supplier}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(po.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {" · "}{po.items.length} line{po.items.length !== 1 ? "s" : ""} · {fmtMoney(total)}
                      </div>
                    </div>
                    <span className={cn(
                      "text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide shrink-0",
                      po.status === "draft" ? "bg-muted text-muted-foreground" :
                      po.status === "sent" ? "bg-blue-500/20 text-blue-700" :
                      "bg-green-500/20 text-green-700"
                    )}>
                      {po.status}
                    </span>
                  </div>

                  <table className="w-full text-xs mb-3">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left pb-1">Item</th>
                        <th className="text-right pb-1">Qty</th>
                        <th className="text-right pb-1">Unit Cost</th>
                        <th className="text-right pb-1">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.items.map((i) => (
                        <tr key={i.menuItemId} className="border-t">
                          <td className="py-1 font-medium">{i.name}</td>
                          <td className="py-1 text-right">{i.qty}</td>
                          <td className="py-1 text-right text-muted-foreground">{fmtMoney(i.unitCost)}</td>
                          <td className="py-1 text-right font-semibold">{fmtMoney(i.qty * i.unitCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {po.status === "sent" && (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => receiveOrder(po.id)}
                    >
                      <Check className="h-4 w-4 mr-1.5" /> Mark as Received — Update Stock
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>

          {/* New Order Panel */}
          <div>
            {showNewOrder && (
              <Card className="p-4 sticky top-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">New Purchase Order</h3>
                  <button onClick={() => setShowNewOrder(false)} className="h-6 w-6 rounded-full hover:bg-muted flex items-center justify-center">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Supplier</label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                    value={newOrder.supplier}
                    onChange={(e) => setNewOrder((p) => ({ ...p, supplier: e.target.value }))}
                  >
                    {SUPPLIER_LIST.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Items</label>
                  {newOrder.items.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4 border rounded-md border-dashed">
                      Use "Order" button in Stock tab to add items
                    </p>
                  )}
                  <div className="space-y-2">
                    {newOrder.items.map((item) => (
                      <div key={item.menuItemId} className="flex items-center gap-2 text-sm">
                        <div className="flex-1 font-medium truncate">{item.name}</div>
                        <Input
                          type="number"
                          className="h-7 w-16 text-center text-xs"
                          value={item.qty}
                          onChange={(e) => setNewOrder((p) => ({
                            ...p,
                            items: p.items.map((i) => i.menuItemId === item.menuItemId ? { ...i, qty: parseInt(e.target.value) || 1 } : i)
                          }))}
                        />
                        <span className="text-xs text-muted-foreground w-16 text-right">{fmtMoney(item.qty * item.unitCost)}</span>
                        <button
                          onClick={() => setNewOrder((p) => ({ ...p, items: p.items.filter((i) => i.menuItemId !== item.menuItemId) }))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {newOrder.items.length > 0 && (
                  <div className="pt-2 border-t flex justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span>{fmtMoney(newOrder.items.reduce((s, i) => s + i.qty * i.unitCost, 0))}</span>
                  </div>
                )}

                <Button className="w-full" onClick={submitOrder} disabled={newOrder.items.length === 0}>
                  <ShoppingCart className="h-4 w-4 mr-2" /> Send Purchase Order
                </Button>
              </Card>
            )}

            {!showNewOrder && (
              <Card className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  <h3 className="font-semibold text-sm">Low Stock Summary</h3>
                </div>
                {low.length === 0 ? (
                  <p className="text-xs text-muted-foreground">All items well stocked.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {low.map((m) => (
                      <li key={m.id} className="flex items-center justify-between">
                        <span>{m.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", m.stock <= 3 ? "bg-red-500/20 text-red-700" : "bg-yellow-500/20 text-yellow-700")}>
                            {m.stock} left
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={() => addToOrder(m)}
                          >
                            + Reorder
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
