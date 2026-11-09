import { createFileRoute, redirect } from "@tanstack/react-router";
import { usePos, fmtMoney } from "@/lib/pos-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus, AlertTriangle, ShoppingCart, Package, X, Check, TrendingDown, ClipboardCheck, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getInventoryItemsFn, physicalStockCountFn, getSuppliersFn, createPurchaseOrderFn, getInventoryLedgerFn, recordWastageFn, getWastageLogsFn } from "@/lib/api";
import { useConfig } from "@/lib/config-store";

export const Route = createFileRoute("/inventory")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' });
    }
  },
  loader: async () => {
    try {
      const items = await getInventoryItemsFn();
      return { dbInventory: items };
    } catch {
      return { dbInventory: [] };
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
  supplierId?: string;
  items: PurchaseItem[];
  status: "draft" | "sent" | "received";
  createdAt: number;
}

interface Supplier { id: string; name: string; contactInfo: string; }

function InventoryPage() {
  const { dbInventory } = Route.useLoaderData();
  const { menu, dispatch } = usePos();
  const { config } = useConfig();
  const branchId = config.activeBranchId;
  const [tab, setTab] = useState<"stock" | "orders" | "count" | "ledger" | "wastage">("stock");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newOrder, setNewOrder] = useState<{ supplierId: string; items: PurchaseItem[] }>({
    supplierId: "",
    items: [],
  });
  const [adjustQty, setAdjustQty] = useState<Record<string, string>>({});

  // Wastage state
  const [wasteItemId, setWasteItemId] = useState("");
  const [wasteQty, setWasteQty] = useState("");
  const [wasteReason, setWasteReason] = useState("Expired / Spoiled");
  const [wasteNotes, setWasteNotes] = useState("");
  const [wasteLoading, setWasteLoading] = useState(false);
  const [wastageLogs, setWastageLogs] = useState<Array<{ id: string; itemName: string; unit: string; quantity: number; reason: string; createdAt: number; runningBalance: number }>>([]);

  const loadWastageLogs = async () => {
    try {
      const logs = await getWastageLogsFn();
      setWastageLogs(logs);
    } catch {}
  };

  const handleRecordWastage = async () => {
    if (!wasteItemId) { toast.error("Please select an item"); return; }
    const qty = parseFloat(wasteQty);
    if (!qty || qty <= 0 || isNaN(qty)) { toast.error("Please enter a valid quantity"); return; }

    setWasteLoading(true);
    try {
      const res = await recordWastageFn({
        data: {
          inventoryId: wasteItemId,
          quantity: qty,
          reason: wasteReason,
          notes: wasteNotes.trim(),
        },
      });
      toast.success(`Recorded ${qty} wastage for ${res.itemName}`);
      setWasteQty("");
      setWasteNotes("");
      loadWastageLogs();
    } catch (err: any) {
      toast.error(err.message || "Failed to record wastage");
    } finally {
      setWasteLoading(false);
    }
  };

  // Physical count state
  const [countValues, setCountValues] = useState<Record<string, string>>({});
  const [countResults, setCountResults] = useState<Array<{ id: string; name: string; systemQty: number; actualQty: number; variance: number }>>([]);
  const [countLoading, setCountLoading] = useState(false);
  const [countDone, setCountDone] = useState(false);

  const low = menu.filter((m) => m.stock <= 10);
  const filtered = menu.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.category.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const result = await getSuppliersFn();
        setSuppliers(result);
        if (result.length > 0 && !newOrder.supplierId) {
          setNewOrder((prev) => ({ ...prev, supplierId: result[0].id }));
        }
      } catch {
        setSuppliers([]);
      }
    };

    loadSuppliers();
  }, []);

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

  const submitOrder = async () => {
    if (!newOrder.supplierId) { toast.error("Select a supplier"); return; }
    if (newOrder.items.length === 0) { toast.error("Add at least one item"); return; }

    try {
      const supplier = suppliers.find((s) => s.id === newOrder.supplierId);
      if (!supplier) { toast.error("Selected supplier not found"); return; }

      const response = await createPurchaseOrderFn({
        data: {
          supplierId: newOrder.supplierId,
          branchId,
          items: newOrder.items.map((item) => ({ inventoryId: item.menuItemId, qty: item.qty, unitPrice: item.unitCost })),
        },
      });

      const order: PurchaseOrder = {
        id: response.id || `po-${Date.now()}`,
        supplier: supplier.name,
        supplierId: newOrder.supplierId,
        items: newOrder.items,
        status: "sent",
        createdAt: Date.now(),
      };
      setOrders((prev) => [order, ...prev]);
      setNewOrder({ supplierId: newOrder.supplierId, items: [] });
      setShowNewOrder(false);
      toast.success(`Purchase order sent to ${supplier.name}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to create purchase order");
    }
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

  // ─── Physical count submit ──────────────────────────────
  const submitPhysicalCount = async () => {
    const counts = dbInventory
      .filter(item => countValues[item.id] !== undefined && countValues[item.id] !== "")
      .map(item => ({ id: item.id, actualQty: parseFloat(countValues[item.id]) }));

    if (counts.length === 0) { toast.error("Enter at least one actual quantity."); return; }

    setCountLoading(true);
    try {
      const result = await physicalStockCountFn({ data: { counts } });
      const resultWithNames = result.results.map(r => ({
        ...r,
        name: dbInventory.find(i => i.id === r.id)?.name || r.id,
      }));
      setCountResults(resultWithNames);
      setCountDone(true);
      toast.success(`Physical count saved for ${counts.length} items.`);
    } catch (e: any) {
      toast.error(e.message || "Failed to save count.");
    } finally {
      setCountLoading(false);
    }
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
            variant={tab === "count" ? "default" : "outline"}
            size="sm"
            onClick={() => { setTab("count"); setCountDone(false); setCountValues({}); setCountResults([]); }}
          >
            <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" /> Physical Count
          </Button>
          <Button
            variant={tab === "ledger" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("ledger")}
          >
            <Package className="h-3.5 w-3.5 mr-1.5" /> Raw Materials & Ledger
          </Button>
          <Button
            variant={tab === "wastage" ? "default" : "outline"}
            size="sm"
            onClick={() => { setTab("wastage"); loadWastageLogs(); }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Wastage & Spoilage
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
                    value={newOrder.supplierId}
                    onChange={(e) => setNewOrder((p) => ({ ...p, supplierId: e.target.value }))}
                  >
                    <option value="">— Select Supplier —</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
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

      {/* PHYSICAL COUNT TAB */}
      {tab === "count" && (
        <div className="space-y-4">
          {!countDone ? (
            <>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-700">Physical Stock Count</p>
                  <p className="text-muted-foreground mt-0.5">Enter the actual counted quantities below. Leave blank to skip an item. Variances will be calculated and stock will be updated.</p>
                </div>
              </div>

              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2.5">Inventory Item</th>
                      <th className="text-center px-4 py-2.5">Unit</th>
                      <th className="text-right px-4 py-2.5">System Qty</th>
                      <th className="text-right px-4 py-2.5 w-36">Actual Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbInventory.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">No inventory items. Add items via Masters → Inventory.</td></tr>
                    )}
                    {dbInventory.map(item => (
                      <tr key={item.id} className="border-t">
                        <td className="px-4 py-2.5 font-medium">{item.name}</td>
                        <td className="px-4 py-2.5 text-center text-muted-foreground">{item.unit}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{item.quantity}</td>
                        <td className="px-4 py-2.5">
                          <Input
                            type="number"
                            placeholder="—"
                            className="h-7 w-24 text-center ml-auto"
                            value={countValues[item.id] || ""}
                            onChange={e => setCountValues(p => ({ ...p, [item.id]: e.target.value }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <div className="flex justify-end">
                <Button className="h-10 px-6" onClick={submitPhysicalCount} disabled={countLoading}>
                  {countLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ClipboardCheck className="h-4 w-4 mr-1.5" />}
                  Submit Count & Sync Inventory
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-sm flex items-start gap-3">
                <Check className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-700">Count Complete</p>
                  <p className="text-muted-foreground mt-0.5">Inventory has been updated. Review variances below.</p>
                </div>
              </div>

              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2.5">Item</th>
                      <th className="text-right px-4 py-2.5">System Qty</th>
                      <th className="text-right px-4 py-2.5">Actual Qty</th>
                      <th className="text-right px-4 py-2.5">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countResults.map(r => (
                      <tr key={r.id} className={cn("border-t", r.variance < 0 ? "bg-red-500/5" : r.variance > 0 ? "bg-green-500/5" : "")}>
                        <td className="px-4 py-2.5 font-medium">{r.name}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{r.systemQty}</td>
                        <td className="px-4 py-2.5 text-right">{r.actualQty}</td>
                        <td className={cn("px-4 py-2.5 text-right font-bold", r.variance < 0 ? "text-red-600" : r.variance > 0 ? "text-green-600" : "text-muted-foreground")}>
                          {r.variance > 0 ? `+${r.variance.toFixed(2)}` : r.variance.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => { setCountDone(false); setCountValues({}); setCountResults([]); }}>
                  Start Another Count
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* LEDGER TAB */}
      {tab === "ledger" && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">Raw Materials & Ledger History</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2">Item</th>
                    <th className="text-right px-4 py-2">In Stock</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {dbInventory.map(item => (
                    <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-2 font-medium">{item.name}</td>
                      <td className="px-4 py-2 text-right">{item.quantity} {item.unit}</td>
                      <td className="px-4 py-2 text-right">
                        <LedgerViewer inventoryId={item.id} itemName={item.name} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      )}

      {/* WASTAGE & SPOILAGE TAB */}
      {tab === "wastage" && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-5 md:col-span-1 space-y-4">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-destructive" />
                  Record Kitchen Wastage
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Log discarded, expired, or spoiled ingredients to adjust live inventory & food cost.
                </p>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Select Ingredient</label>
                  <select
                    value={wasteItemId}
                    onChange={(e) => setWasteItemId(e.target.value)}
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">-- Choose item --</option>
                    {dbInventory.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.quantity} {item.unit} available)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Quantity Discarded</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={wasteQty}
                      onChange={(e) => setWasteQty(e.target.value)}
                      className="h-9"
                    />
                    <div className="h-9 px-3 border rounded-md flex items-center bg-muted text-xs font-medium">
                      {dbInventory.find((i) => i.id === wasteItemId)?.unit || "unit"}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Reason</label>
                  <select
                    value={wasteReason}
                    onChange={(e) => setWasteReason(e.target.value)}
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="Expired / Spoiled">Expired / Spoiled</option>
                    <option value="Burnt / Prep Error">Burnt / Prep Error</option>
                    <option value="Dropped / Damaged">Dropped / Damaged</option>
                    <option value="Quality Rejection">Quality Rejection</option>
                    <option value="Customer Return">Customer Return</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Remarks / Details</label>
                  <Input
                    placeholder="e.g. Overheated in oven, smelled sour..."
                    value={wasteNotes}
                    onChange={(e) => setWasteNotes(e.target.value)}
                    className="h-9"
                  />
                </div>

                <Button
                  onClick={handleRecordWastage}
                  disabled={wasteLoading || !wasteItemId || !wasteQty}
                  className="w-full mt-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                >
                  {wasteLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Record & Deduct Stock
                </Button>
              </div>
            </Card>

            <Card className="p-5 md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-base">Recent Wastage Log</h2>
                  <p className="text-xs text-muted-foreground">Historical records of kitchen loss and inventory write-offs.</p>
                </div>
                <Button size="sm" variant="outline" onClick={loadWastageLogs}>Refresh</Button>
              </div>

              {wastageLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No wastage logged recently. Use the form on the left to record spoiled or lost items.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[480px]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2 rounded-l-md">Date</th>
                        <th className="text-left px-3 py-2">Item</th>
                        <th className="text-right px-3 py-2">Loss Qty</th>
                        <th className="text-left px-3 py-2">Reason / Details</th>
                        <th className="text-right px-3 py-2 rounded-r-md">New Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {wastageLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-3 py-2 font-medium">{log.itemName}</td>
                          <td className="px-3 py-2 text-right font-semibold text-destructive">
                            -{log.quantity} {log.unit}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                            {log.reason.replace(/^WASTE-/, '').replace(/_/g, ' ')}
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-mono">
                            {log.runningBalance} {log.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function LedgerViewer({ inventoryId, itemName }: { inventoryId: string; itemName: string }) {
  const [open, setOpen] = useState(false);
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLedger = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const data = await getInventoryLedgerFn({ data: { inventoryId } });
      setLedger(data);
    } catch {
      toast.error("Failed to load ledger");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={fetchLedger}>View Ledger</Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col shadow-lg border">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="font-semibold text-lg">Ledger: {itemName}</h2>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : ledger.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No ledger history found for this item.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 rounded-l-md">Date</th>
                      <th className="text-left px-4 py-2">Type</th>
                      <th className="text-right px-4 py-2">Ref</th>
                      <th className="text-right px-4 py-2">Change</th>
                      <th className="text-right px-4 py-2 rounded-r-md">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ledger.map(l => (
                      <tr key={l.id}>
                        <td className="px-4 py-2 text-muted-foreground">
                          {new Date(l.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 font-medium text-xs">
                          <span className={cn("px-2 py-1 rounded bg-muted", l.transactionType === 'PURCHASE' ? 'text-green-600 bg-green-500/10' : 'text-amber-600 bg-amber-500/10')}>
                            {l.transactionType}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-muted-foreground">{l.referenceId || '-'}</td>
                        <td className={cn("px-4 py-2 text-right font-medium", l.quantityChange > 0 ? 'text-green-600' : 'text-red-600')}>
                          {l.quantityChange > 0 ? '+' : ''}{l.quantityChange}
                        </td>
                        <td className="px-4 py-2 text-right font-bold">{l.runningBalance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
