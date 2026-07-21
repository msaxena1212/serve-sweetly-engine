import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Building2, Plus, Pencil, Trash2, ShoppingCart, Check, Package,
  Phone, Mail, X, ChevronRight, Loader2, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getSuppliersFn, upsertSupplierFn, deleteSupplierFn,
  getPurchaseOrdersFn, createPurchaseOrderFn, receivePurchaseOrderFn,
  getInventoryItemsFn,
} from "@/lib/api";
import { useConfig } from "@/lib/config-store";

export const Route = createFileRoute("/purchases")({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' });
    if (!['owner', 'manager'].includes(context.session.role)) throw redirect({ to: '/' });
  },
  loader: async () => {
    const [suppliers, purchaseOrders, inventoryItems] = await Promise.all([
      getSuppliersFn(),
      getPurchaseOrdersFn(),
      getInventoryItemsFn(),
    ]);
    return { suppliers, purchaseOrders, inventoryItems };
  },
  head: () => ({
    meta: [
      { title: "Purchases — Forno" },
      { name: "description", content: "Manage suppliers and purchase orders." },
    ],
  }),
  component: PurchasesPage,
});

// ─── Types ───────────────────────────────────────────────────
interface Supplier { id: string; name: string; contactInfo: string; }
interface POItem { inventoryId: string; name: string; qty: number; unitPrice: number; unit: string; expiryDate?: string; }
interface PurchaseOrder { id: string; invoiceNumber: string; supplierId: string; supplierName: string; status: string; totalAmount: number; createdAt: number; items: POItem[]; }

function PurchasesPage() {
  const loaderData = Route.useLoaderData();
  const { config } = useConfig();
  const branchId = config.activeBranchId;
  const [tab, setTab] = useState<"suppliers" | "orders">("suppliers");
  const [suppliers, setSuppliers] = useState<Supplier[]>(loaderData.suppliers);
  const [purchaseOrders, setPurchaseOrders] = useState(loaderData.purchaseOrders);
  const inventoryItems = loaderData.inventoryItems;

  // Supplier form state
  const [supplierForm, setSupplierForm] = useState<{ id?: string; name: string; contactInfo: string }>({ name: "", contactInfo: "" });
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // PO creation state
  const [showNewPO, setShowNewPO] = useState(false);
  const [newPO, setNewPO] = useState<{ supplierId: string; invoiceNumber: string; items: POItem[] }>({ supplierId: "", invoiceNumber: "", items: [] });

  // ─── Supplier handlers ─────────────────────────────────────────
  const openNewSupplier = () => {
    setSupplierForm({ name: "", contactInfo: "" });
    setShowSupplierForm(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setSupplierForm({ id: s.id, name: s.name, contactInfo: s.contactInfo });
    setShowSupplierForm(true);
  };

  const saveSupplier = async () => {
    if (!supplierForm.name.trim()) { toast.error("Supplier name is required."); return; }
    setLoading(true);
    try {
      await upsertSupplierFn({ data: { id: supplierForm.id, name: supplierForm.name, contactInfo: supplierForm.contactInfo } });
      const updated = await getSuppliersFn();
      setSuppliers(updated);
      setShowSupplierForm(false);
      toast.success(supplierForm.id ? "Supplier updated." : "Supplier created.");
    } catch (e: any) {
      toast.error(e.message || "Failed to save supplier.");
    } finally {
      setLoading(false);
    }
  };

  const deleteSupplier = async (id: string) => {
    setLoading(true);
    try {
      await deleteSupplierFn({ data: { id } });
      setSuppliers(prev => prev.filter(s => s.id !== id));
      setDeletingId(null);
      toast.success("Supplier deleted.");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete supplier.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Purchase Order handlers ────────────────────────────────────
  const addPOItem = (inv: typeof inventoryItems[0]) => {
    setNewPO(prev => {
      if (prev.items.find(i => i.inventoryId === inv.id)) {
        return { ...prev, items: prev.items.map(i => i.inventoryId === inv.id ? { ...i, qty: i.qty + 1 } : i) };
      }
      return { ...prev, items: [...prev.items, { inventoryId: inv.id, name: inv.name, qty: 1, unitPrice: 0, unit: inv.unit }] };
    });
  };

  const submitPO = async () => {
    if (!newPO.supplierId) { toast.error("Select a supplier."); return; }
    if (newPO.items.length === 0) { toast.error("Add at least one item."); return; }
    if (newPO.items.some(i => i.unitPrice <= 0)) { toast.error("All items must have a unit price > 0."); return; }

    setLoading(true);
    try {
      await createPurchaseOrderFn({ data: { supplierId: newPO.supplierId, invoiceNumber: newPO.invoiceNumber, branchId, items: newPO.items.map(i => ({ inventoryId: i.inventoryId, qty: i.qty, unitPrice: i.unitPrice, expiryDate: i.expiryDate })) } });
      const updated = await getPurchaseOrdersFn({ data: { branchId } });
      setPurchaseOrders(updated);
      setShowNewPO(false);
      setNewPO({ supplierId: "", invoiceNumber: "", items: [] });
      toast.success("Purchase order created.");
    } catch (e: any) {
      toast.error(e.message || "Failed to create purchase order.");
    } finally {
      setLoading(false);
    }
  };

  const receiveOrder = async (po: typeof purchaseOrders[0]) => {
    setLoading(true);
    try {
      await receivePurchaseOrderFn({ data: { poId: po.id, items: [] } });
      const updated = await getPurchaseOrdersFn({ data: { branchId } });
      setPurchaseOrders(updated);
      toast.success("Purchase order received — inventory updated.");
    } catch (e: any) {
      toast.error(e.message || "Failed to receive purchase order.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Purchasing</h1>
          <p className="text-xs text-muted-foreground">Manage suppliers and purchase orders to update inventory.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={tab === "suppliers" ? "default" : "outline"} size="sm" onClick={() => setTab("suppliers")}>
            <Building2 className="h-3.5 w-3.5 mr-1.5" /> Suppliers ({suppliers.length})
          </Button>
          <Button variant={tab === "orders" ? "default" : "outline"} size="sm" onClick={() => setTab("orders")}>
            <ShoppingCart className="h-3.5 w-3.5 mr-1.5" /> Purchase Orders ({purchaseOrders.filter(p => p.status === "pending").length})
          </Button>
        </div>
      </header>

      {/* ─── SUPPLIERS TAB ─────────────────────────────────── */}
      {tab === "suppliers" && (
        <>
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{suppliers.length} supplier(s) registered.</p>
            <Button size="sm" onClick={openNewSupplier}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Supplier
            </Button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.length === 0 && (
              <Card className="col-span-3 p-10 text-center text-muted-foreground text-sm">
                <Building2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
                No suppliers yet. Add your first supplier to get started.
              </Card>
            )}
            {suppliers.map(s => (
              <Card key={s.id} className="p-4 flex flex-col gap-2 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-semibold text-sm">{s.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditSupplier(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeletingId(s.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {s.contactInfo && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Phone className="h-3 w-3" /> {s.contactInfo}
                  </p>
                )}
                <Button size="sm" variant="outline" className="mt-1 text-xs h-7" onClick={() => { setNewPO(p => ({ ...p, supplierId: s.id })); setTab("orders"); setShowNewPO(true); }}>
                  <ShoppingCart className="h-3 w-3 mr-1" /> New PO from this Supplier
                </Button>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ─── PURCHASE ORDERS TAB ───────────────────────────── */}
      {tab === "orders" && (
        <div className="grid lg:grid-cols-[1fr_380px] gap-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">All Purchase Orders</h2>
              <Button size="sm" onClick={() => setShowNewPO(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> New PO
              </Button>
            </div>

            {purchaseOrders.length === 0 && (
              <Card className="p-10 text-center text-muted-foreground text-sm">
                <ShoppingCart className="h-8 w-8 mx-auto mb-3 opacity-20" />
                No purchase orders yet.
              </Card>
            )}

            {purchaseOrders.map(po => (
              <Card key={po.id} className={cn("p-4", po.status === "received" && "opacity-60")}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-semibold">{po.supplierName}</div>
                    <div className="text-xs text-muted-foreground">
                      Invoice: {po.invoiceNumber} · {" "}
                      {new Date(po.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold">₹{po.totalAmount.toFixed(2)}</span>
                    <span className={cn(
                      "text-[10px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide shrink-0",
                      po.status === "pending" ? "bg-amber-500/20 text-amber-700" :
                      po.status === "received" ? "bg-green-500/20 text-green-700" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {po.status}
                    </span>
                  </div>
                </div>

                {po.items && po.items.length > 0 ? (
                  <div className="overflow-x-auto mb-3">
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-muted-foreground border-b">
                        <tr>
                          <th className="text-left py-2">Item</th>
                          <th className="text-center py-2">Qty</th>
                          <th className="text-right py-2">Unit Price</th>
                          <th className="text-right py-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {po.items.map(item => (
                          <tr key={item.inventoryId} className="border-t">
                            <td className="py-2 font-medium">{item.name} <span className="text-muted-foreground text-xs">({item.unit})</span></td>
                            <td className="py-2 text-center">{item.qty}</td>
                            <td className="py-2 text-right text-muted-foreground">₹{item.unitPrice.toFixed(2)}</td>
                            <td className="py-2 text-right font-semibold">₹{(item.qty * item.unitPrice).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mb-3">No items recorded for this order.</p>
                )}

                {po.status === "pending" && (
                  <Button size="sm" className="w-full" onClick={() => receiveOrder(po)} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                    Mark Received — Update Stock
                  </Button>
                )}
              </Card>
            ))}
          </div>

          {/* New PO Panel */}
          {showNewPO && (
            <Card className="p-4 sticky top-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">New Purchase Order</h3>
                <button onClick={() => setShowNewPO(false)} className="h-6 w-6 rounded-full hover:bg-muted flex items-center justify-center">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Invoice Number (optional)</label>
                <Input placeholder="e.g. INV-10024" value={newPO.invoiceNumber} onChange={e => setNewPO(p => ({ ...p, invoiceNumber: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Supplier *</label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  value={newPO.supplierId}
                  onChange={e => setNewPO(p => ({ ...p, supplierId: e.target.value }))}
                >
                  <option value="">— Select Supplier —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Inventory Items</label>
                <div className="max-h-36 overflow-y-auto border rounded-md divide-y">
                  {inventoryItems.map(inv => (
                    <button key={inv.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between" onClick={() => addPOItem(inv)}>
                      <span>{inv.name} <span className="text-muted-foreground text-xs">({inv.unit})</span></span>
                      <span className="text-xs font-medium text-primary">{inv.quantity} on hand</span>
                    </button>
                  ))}
                </div>
              </div>

              {newPO.items.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Order Lines</label>
                  {newPO.items.map(item => (
                    <div key={item.inventoryId} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 font-medium truncate">{item.name}</span>
                      <Input type="number" className="h-7 w-14 text-center text-xs" value={item.qty} min={1}
                        onChange={e => setNewPO(p => ({ ...p, items: p.items.map(i => i.inventoryId === item.inventoryId ? { ...i, qty: parseInt(e.target.value) || 1 } : i) }))}
                      />
                      <Input type="number" className="h-7 w-20 text-xs" placeholder="₹/unit" value={item.unitPrice || ""}
                        onChange={e => setNewPO(p => ({ ...p, items: p.items.map(i => i.inventoryId === item.inventoryId ? { ...i, unitPrice: parseFloat(e.target.value) || 0 } : i) }))}
                      />
                      <Input type="date" className="h-7 w-32 text-xs" title="Expiry date (optional)" value={item.expiryDate || ""}
                        onChange={e => setNewPO(p => ({ ...p, items: p.items.map(i => i.inventoryId === item.inventoryId ? { ...i, expiryDate: e.target.value || undefined } : i) }))}
                      />
                      <button onClick={() => setNewPO(p => ({ ...p, items: p.items.filter(i => i.inventoryId !== item.inventoryId) }))} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="pt-2 border-t flex justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span>₹{newPO.items.reduce((s, i) => s + i.qty * i.unitPrice, 0).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <Button className="w-full" onClick={submitPO} disabled={loading || newPO.items.length === 0 || !newPO.supplierId}>
                {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-1.5" />}
                Create Purchase Order
              </Button>
            </Card>
          )}
        </div>
      )}

      {/* ─── Supplier Form Modal ──────────────────────────── */}
      <Dialog open={showSupplierForm} onOpenChange={open => !open && setShowSupplierForm(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{supplierForm.id ? "Edit Supplier" : "New Supplier"}</DialogTitle>
            <DialogDescription>Enter the supplier's details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <Input placeholder="e.g. Metro Cash & Carry" value={supplierForm.name} onChange={e => setSupplierForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Contact / Phone</label>
              <Input placeholder="e.g. 9876543210" value={supplierForm.contactInfo} onChange={e => setSupplierForm(p => ({ ...p, contactInfo: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSupplierForm(false)}>Cancel</Button>
            <Button onClick={saveSupplier} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {supplierForm.id ? "Save Changes" : "Create Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirm Modal ─────────────────────────── */}
      <Dialog open={!!deletingId} onOpenChange={open => !open && setDeletingId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete Supplier
            </DialogTitle>
            <DialogDescription>This will permanently remove the supplier. Existing POs will remain.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingId && deleteSupplier(deletingId)} disabled={loading}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
