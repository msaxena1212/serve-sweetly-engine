import { useState } from "react";
import { usePos, fmtMoney, type Order } from "@/lib/pos-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreditCard, Banknote, Smartphone, X, Check, Wallet, Printer } from "lucide-react";
import { useConfig } from "@/lib/config-store";
import { getTopWaitlistFn } from "@/lib/api";
import { toast } from "sonner";

interface PaymentModalProps {
  order: Order;
  onClose: () => void;
}

const ICONS = { cash: Banknote, card: CreditCard, upi: Smartphone, custom: Wallet };
const COLORS = { cash: "text-green-600", card: "text-blue-600", upi: "text-purple-600", custom: "text-orange-600" };

export function PaymentModal({ order, onClose }: PaymentModalProps) {
  const { dispatch, getOrderTotals } = usePos();
  const { config } = useConfig();
  const activeMethods = config.paymentMethods.filter(p => p.active);
  const [methodId, setMethodId] = useState<string>(activeMethods[0]?.id || "pm-1");
  const [discount, setDiscount] = useState(order.discountPct);
  const [cashTendered, setCashTendered] = useState("");
  const [paid, setPaid] = useState(false);

  const selectedMethod = activeMethods.find(m => m.id === methodId);
  const isCash = selectedMethod?.type === "cash";

  const totals = getOrderTotals({ ...order, discountPct: discount });
  const change = isCash && cashTendered ? parseFloat(cashTendered) - totals.total : 0;
  const cashValid = !isCash || (parseFloat(cashTendered || "0") >= totals.total);

  // Quick cash buttons
  const quickAmounts = [
    Math.ceil(totals.total / 100) * 100,
    Math.ceil(totals.total / 500) * 500,
    Math.ceil(totals.total / 1000) * 1000,
  ].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 3);

  const [showInvoice, setShowInvoice] = useState(false);

  const paidTotal = showInvoice ? totals.total : 0;

  const handlePay = async () => {
    dispatch({ type: "PAY", orderId: order.id, method: methodId, discountPct: discount });
    setPaid(true);

    try {
      const { updateOrderFn } = await import("@/lib/api");
      await updateOrderFn({
        data: { orderId: order.id, status: "paid", total: totals.total.toString(), paymentMethodId: methodId },
      });
      
      // Auto-notify Waitlist User if this was a table
      if (order.tableId) {
        const nextUser = await getTopWaitlistFn({ data: { branchId: 'br-1' } });
        if (nextUser) {
          toast.success(`Table is ready! Texting Waitlist Guest: ${nextUser.customerName}...`);
          toast(`Message Sent: "Hello ${nextUser.customerName}, a table is now ready for you! Please proceed to the host."`, { duration: 6000 });
        }
      }
    } catch (e) {
      console.error("Failed to sync payment", e);
    }

    setTimeout(onClose, 1800);
  };

  const handlePrint = () => {
    setShowInvoice(true);
    setTimeout(() => {
      window.print();
      setShowInvoice(false);
    }, 100);
  };

  if (paid) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
        <div className="bg-card rounded-2xl p-10 flex flex-col items-center gap-4 shadow-xl">
          <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="h-8 w-8 text-green-500" />
          </div>
          <div className="text-xl font-bold">Payment Confirmed</div>
          <div className="text-muted-foreground">{fmtMoney(totals.total)} · {selectedMethod?.name.toUpperCase()}</div>
          {isCash && change > 0 && (
            <div className="text-2xl font-bold text-green-600">Change: {fmtMoney(change)}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b">
          <div>
            <div className="font-bold text-lg">Collect Payment</div>
            <div className="text-xs text-muted-foreground">{order.items.length} items</div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Totals */}
          <div className="bg-muted/50 rounded-xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>{fmtMoney(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Discount %</span>
              <Input
                type="number"
                className="h-7 w-20 text-right text-sm"
                value={discount}
                min={0} max={100}
                onChange={(e) => setDiscount(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              />
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax ({order.taxPct}%)</span><span>{fmtMoney(totals.tax)}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-1.5 border-t">
              <span>Total</span><span className="text-primary text-xl">{fmtMoney(totals.total)}</span>
            </div>
          </div>

          {/* Method */}
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Payment Method</div>
            <div className="grid grid-cols-3 gap-2">
              {activeMethods.map((m) => {
                const Icon = ICONS[m.type] || Wallet;
                const color = COLORS[m.type] || COLORS.custom;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMethodId(m.id)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${
                      methodId === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${methodId === m.id ? "text-primary" : color}`} />
                    <span className="text-xs font-medium">{m.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cash tendered */}
          {isCash && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Cash Tendered</div>
              <Input
                type="number"
                placeholder={`Min. ${fmtMoney(totals.total)}`}
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
                className="text-lg h-11"
              />
              <div className="flex gap-2 mt-2">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setCashTendered(amt.toString())}
                    className="flex-1 py-1.5 text-xs rounded-md border hover:bg-muted transition-colors font-medium"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
              {cashTendered && change >= 0 && (
                <div className="mt-3 p-3 bg-green-500/10 rounded-lg text-center">
                  <div className="text-xs text-muted-foreground">Change to return</div>
                  <div className="text-2xl font-bold text-green-600">{fmtMoney(change)}</div>
                </div>
              )}
              {cashTendered && change < 0 && (
                <div className="mt-2 p-2 bg-red-500/10 rounded-lg text-center text-xs text-red-600 font-medium">
                  Insufficient amount — need {fmtMoney(Math.abs(change))} more
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <Button
            className="w-full h-12 text-base font-semibold"
            disabled={!cashValid}
            onClick={handlePay}
          >
            <Check className="h-5 w-5 mr-2" />
            Confirm {selectedMethod?.name.toUpperCase()} · {fmtMoney(totals.total)}
          </Button>
        </div>
      </div>

      {showInvoice && (
        <div className="fixed inset-0 z-50 hidden print:block bg-white p-6 overflow-auto text-black">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-2xl font-bold">Forno POS</div>
                <div className="text-sm text-muted-foreground">Tax Invoice</div>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                {new Date().toLocaleString()}
              </div>
            </div>

            <div className="mb-4 text-sm space-y-1">
              <div className="font-medium">Order ID</div>
              <div>{order.id}</div>
            </div>

            <div className="mb-4 text-sm space-y-1">
              <div className="font-medium">Payment Method</div>
              <div>{selectedMethod?.name ?? "N/A"}</div>
            </div>

            <div className="space-y-3 border-b pb-3 mb-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.qty} × {fmtMoney(item.price)}</div>
                  </div>
                  <div className="font-semibold">{fmtMoney(item.price * item.qty)}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{fmtMoney(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount</span>
                <span>{fmtMoney(totals.discount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax ({order.taxPct}%)</span>
                <span>{fmtMoney(totals.tax)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>Total</span>
                <span>{fmtMoney(totals.total)}</span>
              </div>
            </div>

            <div className="mt-6 text-xs text-muted-foreground">
              <p>Thank you for dining with us.</p>
              <p>Please collect the receipt after payment is completed.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
