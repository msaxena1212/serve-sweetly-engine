import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Users, CreditCard, Check, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '../api-client';

interface BillSplitterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  totalAmount: number;
  onSplitComplete?: () => void;
}

export function BillSplitterModal({
  open,
  onOpenChange,
  orderId,
  totalAmount,
  onSplitComplete,
}: BillSplitterModalProps) {
  const [splitsCount, setSplitsCount] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [splitsResult, setSplitsResult] = useState<any[] | null>(null);

  const calculatePreview = () => {
    const each = Math.round((totalAmount / splitsCount) * 100) / 100;
    return each;
  };

  const handleGenerateSplits = async () => {
    setLoading(true);
    try {
      const res = await apiClient.orders.splitEqually(orderId, splitsCount);
      setSplitsResult(res.splits);
      toast.success(`Bill split into ${splitsCount} shares of ₹${calculatePreview().toFixed(2)}`);
      if (onSplitComplete) onSplitComplete();
    } catch (err: any) {
      toast.error(err.message || 'Failed to split bill');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5">
        <DialogHeader className="mb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Calculator className="w-4 h-4 text-primary" />
            <span>Split Bill — Order #{orderId}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Total Bill Amount:</span>
            <span className="text-lg font-bold">₹{totalAmount.toFixed(2)}</span>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Select Number of Ways to Split:
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[2, 3, 4, 5, 6].map((num) => (
                <Button
                  key={num}
                  type="button"
                  variant={splitsCount === num ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSplitsCount(num);
                    setSplitsResult(null);
                  }}
                  className="font-medium"
                >
                  <Users className="w-3 h-3 mr-1" />
                  {num}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded border border-dashed p-3 text-center bg-background">
            <div className="text-xs text-muted-foreground mb-1">Each Person Pays:</div>
            <div className="text-2xl font-extrabold text-primary">₹{calculatePreview().toFixed(2)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">({splitsCount} equal split portions)</div>
          </div>

          {splitsResult ? (
            <div className="space-y-2 border-t pt-3">
              <div className="text-xs font-semibold">Generated Sub-splits:</div>
              {splitsResult.map((split, i) => (
                <div key={i} className="flex justify-between items-center bg-muted/40 p-2 rounded text-xs">
                  <span>Guest #{split.splitNumber} of {split.ofTotal}</span>
                  <span className="font-semibold">₹{split.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <Button
              className="w-full mt-2"
              onClick={handleGenerateSplits}
              disabled={loading}
            >
              {loading ? 'Processing Split…' : `Confirm ${splitsCount}-Way Split`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
