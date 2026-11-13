import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Banknote, Calculator, CheckCircle2, AlertTriangle } from 'lucide-react';

interface DenominationRow {
  denomination: number;
  count: number;
}

const DEFAULT_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 1];

interface CashDenominationsCounterProps {
  expectedCash: number;
  onTotalCalculated: (actualTotal: number, denominations: any[]) => void;
}

export function CashDenominationsCounter({
  expectedCash,
  onTotalCalculated,
}: CashDenominationsCounterProps) {
  const [counts, setCounts] = useState<Record<number, number>>({
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    1: 0,
  });

  const handleCountChange = (denom: number, countStr: string) => {
    const val = Math.max(0, parseInt(countStr) || 0);
    const updated = { ...counts, [denom]: val };
    setCounts(updated);

    const total = Object.entries(updated).reduce(
      (sum, [d, c]) => sum + parseInt(d) * c,
      0
    );

    const denomPayload = Object.entries(updated).map(([d, c]) => ({
      denomination: parseInt(d),
      count: c,
      total: parseInt(d) * c,
    }));

    onTotalCalculated(total, denomPayload);
  };

  const actualTotal = Object.entries(counts).reduce(
    (sum, [d, c]) => sum + parseInt(d) * c,
    0
  );
  const variance = actualTotal - expectedCash;
  const isBalanced = Math.abs(variance) < 0.01;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground pb-1 border-b">
        <span>Denomination</span>
        <span className="w-20 text-center">Count</span>
        <span className="w-24 text-right">Subtotal</span>
      </div>

      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
        {DEFAULT_DENOMINATIONS.map((d) => {
          const subtotal = d * (counts[d] || 0);
          return (
            <div key={d} className="flex items-center justify-between text-xs">
              <span className="font-mono font-medium flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-muted-foreground" />
                ₹{d}
              </span>
              <input
                type="number"
                min="0"
                className="w-20 h-7 rounded border bg-background px-2 text-center text-xs"
                value={counts[d] || ''}
                placeholder="0"
                onChange={(e) => handleCountChange(d, e.target.value)}
              />
              <span className="w-24 text-right font-mono tabular-nums text-foreground">
                ₹{subtotal.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="pt-2 border-t space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">Expected Cash (System):</span>
          <span className="font-mono font-semibold">₹{expectedCash.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-foreground">Counted Cash (Physical):</span>
          <span className="font-mono font-bold text-sm">₹{actualTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center text-xs pt-1 border-t">
          <span className="font-medium">Variance:</span>
          <span
            className={`font-mono font-bold flex items-center gap-1 ${
              isBalanced
                ? 'text-emerald-600'
                : variance > 0
                ? 'text-blue-600'
                : 'text-red-600'
            }`}
          >
            {isBalanced ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            {variance >= 0 ? `+₹${variance.toFixed(2)}` : `-₹${Math.abs(variance).toFixed(2)}`}
            {isBalanced ? ' (Balanced)' : variance > 0 ? ' (Surplus)' : ' (Shortage)'}
          </span>
        </div>
      </div>
    </div>
  );
}
