import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Copy, Download, Check, Share2 } from 'lucide-react';
import { toast } from 'sonner';

interface DigitalReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptText?: string;
  receiptHtml?: string;
  orderId?: number | string;
}

export function DigitalReceiptModal({
  open,
  onOpenChange,
  receiptText = '',
  receiptHtml = '',
  orderId,
}: DigitalReceiptModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!receiptText) return;
    navigator.clipboard.writeText(receiptText);
    setCopied(true);
    toast.success('Thermal receipt text copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    if (!receiptText) return;
    const blob = new Blob([receiptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-order-${orderId || Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Receipt downloaded');
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
      toast.error('Please allow popups to print receipt');
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt #${orderId || ''}</title>
          <style>
            @page { margin: 0; size: 80mm auto; }
            body { margin: 8px; font-family: monospace; font-size: 12px; }
          </style>
        </head>
        <body>
          ${receiptHtml || `<pre style="font-family: monospace; font-size: 12px;">${receiptText}</pre>`}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-4">
        <DialogHeader className="mb-2">
          <DialogTitle className="flex items-center justify-between text-base">
            <span>Digital Thermal Slip</span>
            <span className="text-xs text-muted-foreground font-normal">80mm Software Receipt</span>
          </DialogTitle>
        </DialogHeader>

        {/* Thermal Slip Visual Preview */}
        <div className="bg-amber-50/50 dark:bg-stone-900 border border-stone-300 dark:border-stone-800 rounded p-4 shadow-inner max-h-[360px] overflow-y-auto">
          {receiptHtml ? (
            <div dangerouslySetInnerHTML={{ __html: receiptHtml }} />
          ) : (
            <pre className="font-mono text-xs whitespace-pre-wrap leading-relaxed text-stone-900 dark:text-stone-100">
              {receiptText || 'No receipt data available.'}
            </pre>
          )}
        </div>

        {/* Action Controls */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Text'}
          </Button>

          <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" />
            Download
          </Button>

          <Button size="sm" onClick={handlePrint} className="gap-1.5 text-xs bg-stone-900 text-white hover:bg-stone-800">
            <Printer className="w-3.5 h-3.5" />
            Print / PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
