import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowRightLeft, Combine, Check } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '../api-client';

interface TableOperationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableTables: Array<{ id: number | string; number: string; status: string; activeOrderId?: number | null }>;
  onSuccess?: () => void;
}

export function TableOperationsModal({
  open,
  onOpenChange,
  availableTables,
  onSuccess,
}: TableOperationsModalProps) {
  const [tab, setTab] = useState<'transfer' | 'merge'>('transfer');
  const [fromTable, setFromTable] = useState('');
  const [toTable, setToTable] = useState('');
  const [primaryTable, setPrimaryTable] = useState('');
  const [secondaryTable, setSecondaryTable] = useState('');
  const [loading, setLoading] = useState(false);

  const occupiedTables = availableTables.filter((t) => t.status === 'occupied');
  const freeTables = availableTables.filter((t) => t.status === 'available');

  const handleTransfer = async () => {
    if (!fromTable || !toTable) {
      toast.error('Please select both source and destination tables');
      return;
    }
    const source = occupiedTables.find((t) => t.number === fromTable);
    if (!source || !source.activeOrderId) {
      toast.error(`Table ${fromTable} has no active order to transfer`);
      return;
    }

    setLoading(true);
    try {
      await apiClient.tables.transfer({
        orderId: source.activeOrderId,
        fromTableNumber: fromTable,
        toTableNumber: toTable,
      });
      toast.success(`Transferred order from Table ${fromTable} to ${toTable}`);
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Table transfer failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async () => {
    if (!primaryTable || !secondaryTable) {
      toast.error('Please select both primary and secondary tables to merge');
      return;
    }
    if (primaryTable === secondaryTable) {
      toast.error('Cannot merge a table into itself');
      return;
    }

    setLoading(true);
    try {
      await apiClient.tables.merge({
        primaryTableNumber: primaryTable,
        secondaryTableNumber: secondaryTable,
      });
      toast.success(`Merged Table ${secondaryTable} into Table ${primaryTable}`);
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Table merge failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5">
        <DialogHeader className="mb-2">
          <DialogTitle className="text-base font-semibold">Table Operations</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="transfer" className="gap-1.5 text-xs">
              <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer Table
            </TabsTrigger>
            <TabsTrigger value="merge" className="gap-1.5 text-xs">
              <Combine className="w-3.5 h-3.5" /> Merge Tables
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transfer" className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Source Table (Occupied):
              </label>
              <select
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                value={fromTable}
                onChange={(e) => setFromTable(e.target.value)}
              >
                <option value="">Select occupied table…</option>
                {occupiedTables.map((t) => (
                  <option key={t.number} value={t.number}>
                    Table {t.number} (Order #{t.activeOrderId || 'Active'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Destination Table (Available):
              </label>
              <select
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                value={toTable}
                onChange={(e) => setToTable(e.target.value)}
              >
                <option value="">Select free table…</option>
                {freeTables.map((t) => (
                  <option key={t.number} value={t.number}>
                    Table {t.number} (Available)
                  </option>
                ))}
              </select>
            </div>

            <Button className="w-full mt-2" onClick={handleTransfer} disabled={loading || !fromTable || !toTable}>
              {loading ? 'Transferring…' : 'Confirm Table Transfer'}
            </Button>
          </TabsContent>

          <TabsContent value="merge" className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Primary Table (Target Bill):
              </label>
              <select
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                value={primaryTable}
                onChange={(e) => setPrimaryTable(e.target.value)}
              >
                <option value="">Select primary table…</option>
                {occupiedTables.map((t) => (
                  <option key={t.number} value={t.number}>
                    Table {t.number}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Secondary Table (Items to join into primary):
              </label>
              <select
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                value={secondaryTable}
                onChange={(e) => setSecondaryTable(e.target.value)}
              >
                <option value="">Select table to merge…</option>
                {occupiedTables
                  .filter((t) => t.number !== primaryTable)
                  .map((t) => (
                    <option key={t.number} value={t.number}>
                      Table {t.number}
                    </option>
                  ))}
              </select>
            </div>

            <Button className="w-full mt-2" onClick={handleMerge} disabled={loading || !primaryTable || !secondaryTable}>
              {loading ? 'Merging…' : 'Confirm Table Merge'}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
