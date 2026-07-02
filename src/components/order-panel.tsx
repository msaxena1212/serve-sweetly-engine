import { usePos, fmtMoney, type Order } from "@/lib/pos-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Minus, Plus, Trash2, Send, CreditCard, Ban } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PaymentModal } from "@/components/payment-modal";

export function OrderPanel({ order }: { order: Order }) {
  const { dispatch, getOrderTotals, tables } = usePos();
  const [showPayment, setShowPayment] = useState(false);
  const totals = getOrderTotals(order);
  const hasUnsent = order.items.some((i) => i.status === "new");

  const tableName = order.tableId ? tables.find((t) => t.id === order.tableId)?.name : null;

  return (
    <>
      {showPayment && <PaymentModal order={order} onClose={() => setShowPayment(false)} />}
      <Card className="p-4 flex flex-col h-full">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{order.type === "dine-in" ? `Table ${tableName}` : "Takeaway"}</div>
            <div className="font-semibold">{order.customerName ?? `Order #${order.id.slice(-4).toUpperCase()}`}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => { dispatch({ type: "VOID_ORDER", orderId: order.id }); toast.message("Order voided"); }}>
            <Ban /> Void
          </Button>
        </div>

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
                      onClick={() => {
                        const notes = prompt("Add remarks for " + i.name, i.notes || "");
                        if (notes !== null) {
                          dispatch({ type: "UPDATE_NOTES", orderId: order.id, itemId: i.id, notes });
                        }
                      }}
                      className="text-primary hover:underline"
                    >
                      {i.notes ? `Remarks: ${i.notes}` : "+ Remarks"}
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

        <div className="mt-3 pt-3 border-t space-y-1 text-sm">
          <Row label="Subtotal" value={fmtMoney(totals.subtotal)} />
          <Row label={`Tax (${order.taxPct}%)`} value={fmtMoney(totals.tax)} />
          <div className="flex items-center justify-between pt-1 border-t font-semibold text-base">
            <span>Total</span>
            <span className="text-primary">{fmtMoney(totals.total)}</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={!hasUnsent} onClick={async () => { 
            dispatch({ type: "SEND_KOT", orderId: order.id }); 
            toast.success("KOT sent to kitchen"); 
            try {
              const { addOrderItemFn } = await import('@/lib/api');
              const unsent = order.items.filter((i) => i.status === "new");
              for (const item of unsent) {
                await addOrderItemFn({ data: { orderId: order.id, menuItemId: item.menuItemId, quantity: item.qty, notes: item.notes } });
              }
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
            <CreditCard /> Charge {fmtMoney(totals.total)}
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