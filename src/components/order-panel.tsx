import { usePos, fmtMoney, newOrderItem, type Order } from "@/lib/pos-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Minus, Plus, Trash2, Send, CreditCard, Ban, Sparkles, Crown, Heart, User, Check, Calculator, Receipt, SlidersHorizontal } from "lucide-react";
import { getCustomerProfileFn } from "@/lib/api";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { PaymentModal } from "@/components/payment-modal";
import { BillSplitterModal } from "@/fe/components/bill-splitter-modal";
import { ItemModifiersDialog } from "@/fe/components/item-modifiers-dialog";
import { DigitalReceiptModal } from "@/fe/components/digital-receipt-modal";
import { generateAsciiReceipt, generateHtmlReceipt } from "@/be/services/receipt.service";

export function OrderPanel({ order }: { order: Order }) {
  const { dispatch, getOrderTotals, tables, menu } = usePos();
  const [showPayment, setShowPayment] = useState(false);
  const [showSplitter, setShowSplitter] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [modifierTarget, setModifierTarget] = useState<{ id: string; name: string } | null>(null);
  const totals = getOrderTotals(order);
  const hasUnsent = order.items.some((i) => i.status === "new");

  const tableName = order.tableId ? tables.find((t) => t.id === order.tableId)?.name : null;

  // VIP & Customer Profile state
  const [profile, setProfile] = useState<{
    id: number;
    name: string;
    phone: string;
    tier: string;
    visits: number;
    totalSpent: number;
    favorites: Array<{ id: string; name: string; price: number }>;
  } | null>(null);
  const [showCustInput, setShowCustInput] = useState(false);
  const [custInput, setCustInput] = useState("");
  const [custLoading, setCustLoading] = useState(false);

  useEffect(() => {
    if (order.customerName && order.customerName !== "Guest" && !order.customerName.startsWith("Order #")) {
      getCustomerProfileFn({ data: { phoneOrName: order.customerName } })
        .then((p) => { if (p) setProfile(p); })
        .catch(() => {});
    }
  }, [order.customerName]);

  const handleLookupCustomer = async () => {
    const query = custInput.trim();
    if (!query) return;
    setCustLoading(true);
    try {
      const p = await getCustomerProfileFn({ data: { phoneOrName: query } });
      if (p) {
        setProfile(p);
        toast.success(`Found ${p.name} (${p.tier})`);
        setShowCustInput(false);
      } else {
        toast.info("No prior visit history found for this number/name.");
      }
    } catch {
      toast.error("Failed to load customer profile");
    } finally {
      setCustLoading(false);
    }
  };

  // AI Pairings / Upsell Recommendation
  const currentItemIds = useMemo(() => new Set(order.items.map((i) => i.menuItemId)), [order.items]);
  const hasBeverage = useMemo(() => order.items.some((i) => {
    const item = menu.find((m) => m.id === i.menuItemId);
    return item?.category?.toLowerCase() === "beverages" || i.station?.toLowerCase() === "bar";
  }), [order.items, menu]);
  const hasDessert = useMemo(() => order.items.some((i) => {
    const item = menu.find((m) => m.id === i.menuItemId);
    return item?.category?.toLowerCase() === "desserts";
  }), [order.items, menu]);
  const hasMains = useMemo(() => order.items.some((i) => {
    const item = menu.find((m) => m.id === i.menuItemId);
    return item?.category?.toLowerCase() === "mains";
  }), [order.items, menu]);

  const recommendations = useMemo(() => {
    if (order.items.length === 0) return [];
    const suggestions: typeof menu = [];

    if (!hasBeverage) {
      const drinks = menu.filter((m) => m.available && !currentItemIds.has(m.id) && (m.category?.toLowerCase() === "beverages" || m.station?.toLowerCase() === "bar"));
      if (drinks.length) suggestions.push(drinks[0]);
    }
    if (hasMains && !hasDessert) {
      const desserts = menu.filter((m) => m.available && !currentItemIds.has(m.id) && m.category?.toLowerCase() === "desserts");
      if (desserts.length) suggestions.push(desserts[0]);
    }
    if (hasMains) {
      const sides = menu.filter((m) => m.available && !currentItemIds.has(m.id) && (m.category?.toLowerCase() === "sides" || m.category?.toLowerCase() === "starters"));
      if (sides.length) suggestions.push(sides[0]);
    }
    if (suggestions.length < 3) {
      const others = menu.filter((m) => m.available && !currentItemIds.has(m.id) && !suggestions.some(s => s.id === m.id));
      suggestions.push(...others.slice(0, 3 - suggestions.length));
    }
    return suggestions.slice(0, 3);
  }, [order.items, menu, hasBeverage, hasDessert, hasMains, currentItemIds]);

  const receiptPayload = useMemo(() => {
    const data = {
      restaurantName: "Forno Restaurant & Cafe",
      branchName: "Main Branch",
      orderId: parseInt(order.id) || 0,
      invoiceNumber: `INV-${order.id.slice(-5).toUpperCase()}`,
      tableNumber: tableName,
      orderType: order.type as "dine-in" | "takeaway",
      customerName: order.customerName,
      createdAt: order.createdAt || new Date(),
      items: order.items.map((i) => ({
        name: i.name,
        quantity: i.qty,
        unitPrice: i.price,
        totalPrice: i.price * i.qty,
        notes: i.notes,
      })),
      subtotal: totals.subtotal,
      discountPct: order.discountPct || 0,
      discountAmount: totals.discount,
      taxPct: order.taxPct || 0,
      taxAmount: totals.tax,
      total: totals.total,
    };
    return {
      text: generateAsciiReceipt(data),
      html: generateHtmlReceipt(data),
    };
  }, [order, tableName, totals]);

  return (
    <>
      {showPayment && <PaymentModal order={order} onClose={() => setShowPayment(false)} />}
      <BillSplitterModal
        open={showSplitter}
        onOpenChange={setShowSplitter}
        orderId={parseInt(order.id) || 0}
        totalAmount={totals.paid > 0 ? totals.balance : totals.total}
      />
      <DigitalReceiptModal
        open={showReceipt}
        onOpenChange={setShowReceipt}
        receiptText={receiptPayload.text}
        receiptHtml={receiptPayload.html}
        orderId={order.id}
      />
      {modifierTarget && (
        <ItemModifiersDialog
          open={!!modifierTarget}
          onOpenChange={(open) => !open && setModifierTarget(null)}
          itemName={modifierTarget.name}
          onApply={(mods, customNote) => {
            const combined = [...mods, customNote].filter(Boolean).join(", ");
            dispatch({ type: "UPDATE_NOTES", orderId: order.id, itemId: modifierTarget.id, notes: combined });
            toast.success(`Updated modifiers for ${modifierTarget.name}`);
          }}
        />
      )}
      <Card className="p-4 flex flex-col h-full">
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{order.type === "dine-in" ? `Table ${tableName}` : "Takeaway"}</div>
            <div className="font-semibold">{order.customerName ?? `Order #${order.id.slice(-4).toUpperCase()}`}</div>
          </div>
          <div className="flex items-center gap-1">
            {!profile && !showCustInput && (
              <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-primary hover:bg-primary/10" onClick={() => setShowCustInput(true)}>
                <User className="h-3 w-3 mr-1" /> VIP
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => { dispatch({ type: "VOID_ORDER", orderId: order.id }); toast.message("Order voided"); }}>
              <Ban /> Void
            </Button>
          </div>
        </div>

        {showCustInput && !profile && (
          <div className="mb-2 p-2 bg-muted/40 rounded-lg flex gap-1.5 items-center">
            <Input
              placeholder="10-digit phone or name..."
              value={custInput}
              onChange={(e) => setCustInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookupCustomer()}
              className="h-7 text-xs"
            />
            <Button size="sm" className="h-7 px-2" onClick={handleLookupCustomer} disabled={custLoading || !custInput.trim()}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-1.5 text-muted-foreground" onClick={() => setShowCustInput(false)}>
              ✕
            </Button>
          </div>
        )}

        {profile && (
          <div className="mb-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900/50 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                <Crown className="h-3.5 w-3.5 text-amber-600" />
                {profile.tier} ({profile.visits} visits · ₹{profile.totalSpent.toFixed(0)})
              </span>
              <span className="text-[10px] text-muted-foreground">{profile.phone}</span>
            </div>
            {profile.favorites.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-amber-200/60 dark:border-amber-800/40">
                <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1 font-medium">
                  <Heart className="h-3 w-3 text-red-500 fill-red-500" /> Past Favorites:
                </div>
                <div className="flex flex-wrap gap-1">
                  {profile.favorites.map((fav) => (
                    <button
                      key={fav.id}
                      type="button"
                      onClick={() => {
                        const m = menu.find((item) => String(item.id) === fav.id || item.name.toLowerCase() === fav.name.toLowerCase());
                        if (m) {
                          dispatch({ type: "ADD_ITEM", orderId: order.id, item: newOrderItem(m, 1) });
                          toast.success(`Reordered ${fav.name}`);
                        } else {
                          toast.info(`${fav.name} is currently not on the active menu`);
                        }
                      }}
                      className="px-1.5 py-0.5 bg-background hover:bg-amber-100 dark:hover:bg-amber-900/40 border rounded text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-2.5 w-2.5" /> {fav.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto -mx-2 px-2 divide-y">
          {order.items.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Tap items on the left to add.</p>}
          {order.items.map((i) => (
            <div key={i.id} className="py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{i.name}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  <span>{i.station} · {i.status}</span>
                  {i.status === "new" ? (
                    <button 
                      onClick={() => setModifierTarget({ id: i.id, name: i.name })}
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <SlidersHorizontal className="h-2.5 w-2.5" />
                      {i.notes ? `Modifiers: ${i.notes}` : "+ Modifiers"}
                    </button>
                  ) : (
                    i.notes && <span className="italic text-primary">Remarks: {i.notes}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => dispatch({ type: "UPDATE_QTY", orderId: order.id, itemId: i.id, qty: i.qty - 1 })}><Minus /></Button>
                <span className="w-6 text-center text-sm">{i.qty}</span>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => dispatch({ type: "UPDATE_QTY", orderId: order.id, itemId: i.id, qty: i.qty + 1 })}><Plus /></Button>
              </div>
              <div className="w-16 text-right text-sm font-medium">{fmtMoney(i.price * i.qty)}</div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => dispatch({ type: "REMOVE_ITEM", orderId: order.id, itemId: i.id })}><Trash2 /></Button>
            </div>
          ))}
        </div>

        {recommendations.length > 0 && (
          <div className="mt-2 pt-2 border-t">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              <span>AI Suggested Pairings</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recommendations.map((rec) => (
                <button
                  key={rec.id}
                  onClick={() => {
                    dispatch({ type: "ADD_ITEM", orderId: order.id, item: newOrderItem(rec, 1) });
                    toast.success(`Added ${rec.name} to order`);
                  }}
                  className="flex items-center gap-1.5 text-xs bg-muted hover:bg-primary/10 hover:border-primary/40 border rounded-lg px-2 py-1 transition-all group"
                  title={`Add ${rec.name} (${fmtMoney(rec.price)})`}
                >
                  <Plus className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
                  <span className="font-medium truncate max-w-[110px]">{rec.name}</span>
                  <span className="text-muted-foreground text-[10px]">{fmtMoney(rec.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 pt-3 border-t space-y-1 text-sm">
          <Row label="Subtotal" value={fmtMoney(totals.subtotal)} />
          <Row label={`Tax (${order.taxPct}%)`} value={fmtMoney(totals.tax)} />
          {totals.paid > 0 && (
            <>
              <Row label="Paid" value={fmtMoney(totals.paid)} />
              <Row label="Balance" value={fmtMoney(totals.balance)} />
            </>
          )}
          <div className="flex items-center justify-between pt-1 border-t font-semibold text-base">
            <span>{totals.paid > 0 ? "Balance Due" : "Total"}</span>
            <span className="text-primary">{fmtMoney(totals.paid > 0 ? totals.balance : totals.total)}</span>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs border"
            disabled={order.items.length === 0}
            onClick={() => setShowSplitter(true)}
          >
            <Calculator className="h-3.5 w-3.5 mr-1.5" /> Split Bill
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs border"
            disabled={order.items.length === 0}
            onClick={() => setShowReceipt(true)}
          >
            <Receipt className="h-3.5 w-3.5 mr-1.5" /> Digital Slip
          </Button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={!hasUnsent} onClick={async () => { 
            dispatch({ type: "SEND_KOT", orderId: order.id }); 
            
            const numericOrderId = parseInt(order.id);
            if (isNaN(numericOrderId)) {
              toast.error("Cannot sync offline order to KOT. DB connection needed.");
              return;
            }

            try {
              const { addOrderItemFn } = await import('@/lib/api');
              const unsent = order.items.filter((i) => i.status === "new");
              let syncError = false;
              for (const item of unsent) {
                const numericMenuItemId = parseInt(item.menuItemId);
                if (isNaN(numericMenuItemId)) {
                  toast.error(`Item ${item.name} is an offline seed. Sync skipped.`);
                  syncError = true;
                  continue;
                }
                await addOrderItemFn({ data: { orderId: order.id, menuItemId: item.menuItemId, quantity: item.qty, notes: item.notes } });
              }
              if (!syncError) toast.success("KOT synced to kitchen");
            } catch (e) {
              console.error(e);
              toast.error("Failed to sync KOT with server");
            }
          }}>
            <Send /> Send KOT
          </Button>
          <Button 
            disabled={order.items.length === 0}
            onClick={() => setShowPayment(true)}
          >
            <CreditCard /> Charge {fmtMoney(totals.paid > 0 ? totals.balance : totals.total)}
          </Button>
        </div>
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
