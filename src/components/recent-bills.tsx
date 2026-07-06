import { useState } from "react";
import { usePos, fmtMoney } from "@/lib/pos-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Receipt, AlertCircle, Ban } from "lucide-react";
import { toast } from "sonner";

export function RecentBillsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { orders, dispatch } = usePos();
  const [managerPin, setManagerPin] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundingOrderId, setRefundingOrderId] = useState<string | null>(null);

  // Show last 20 paid orders
  const paidOrders = orders.filter(o => o.status === "paid").slice(-20).reverse();

  const handleRefund = async () => {
    if (!managerPin || !refundReason) {
      toast.error("Manager PIN and Reason are required for refunds.");
      return;
    }

    const order = orders.find(o => o.id === refundingOrderId);
    if (!order) return;

    const total = order.items.reduce((s, i) => s + i.price * i.qty, 0) * (1 - order.discountPct/100) * (1 + order.taxPct/100);

    try {
      const { processRefundFn } = await import("@/lib/api");
      await processRefundFn({ data: { 
        orderId: parseInt(order.id), 
        amount: total, 
        reason: refundReason, 
        managerPin 
      }});
      
      // Mark local state as void for simplicity
      dispatch({ type: "VOID_ORDER", orderId: order.id });
      toast.success("Refund processed successfully.");
      setRefundingOrderId(null);
      setManagerPin("");
      setRefundReason("");
    } catch (e: any) {
      toast.error(e.message || "Refund failed.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Recent Paid Bills
          </DialogTitle>
          <DialogDescription>
            View recent transactions and process refunds. Refunds require a Manager PIN.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {paidOrders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No recent paid bills found.</p>
          )}
          {paidOrders.map(o => {
            const t = o.items.reduce((s, i) => s + i.price * i.qty, 0) * (1 - o.discountPct/100) * (1 + o.taxPct/100);
            return (
              <div key={o.id} className="p-4 border rounded-md flex justify-between items-center bg-card">
                <div>
                  <div className="font-semibold text-sm">Order #{o.id.slice(-4)} · {o.type}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{new Date(o.createdAt).toLocaleTimeString()} · {o.items.length} items</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold">{fmtMoney(t)}</span>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setRefundingOrderId(o.id)}>
                    Refund
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {refundingOrderId && (
          <Dialog open={true} onOpenChange={() => setRefundingOrderId(null)}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-destructive flex items-center gap-2">
                  <Ban className="h-5 w-5" /> Process Refund
                </DialogTitle>
                <DialogDescription>
                  Refunding Order #{refundingOrderId.slice(-4)}. This action is audited.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Reason *</label>
                  <Input placeholder="e.g. Customer complaint, wrong item" value={refundReason} onChange={e => setRefundReason(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Manager PIN *</label>
                  <Input type="password" placeholder="****" value={managerPin} onChange={e => setManagerPin(e.target.value)} maxLength={4} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setRefundingOrderId(null)}>Cancel</Button>
                <Button variant="destructive" onClick={handleRefund}>Confirm Refund</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
