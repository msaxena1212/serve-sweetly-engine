// Pure Software Thermal Receipt and KOT Slip Generator
// Generates 80mm / 58mm printable text slips, HTML printable layouts, and digital receipts
// Completely removes dependency on physical ESC/POS hardware.

export interface ReceiptLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string | null;
  modifiers?: string[];
}

export interface ReceiptData {
  restaurantName: string;
  branchName?: string;
  address?: string;
  phone?: string;
  gstin?: string;
  orderId: number;
  invoiceNumber?: string;
  tableNumber?: string | null;
  orderType: 'dine-in' | 'takeaway';
  cashierName?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  createdAt: Date | string;
  items: ReceiptLineItem[];
  subtotal: number;
  discountPct?: number;
  discountAmount?: number;
  taxPct?: number;
  taxAmount?: number;
  total: number;
  paymentMethod?: string;
  tenderAmount?: number;
  changeDue?: number;
}

export interface KotData {
  kotNumber: string | number;
  orderId: number;
  tableNumber?: string | null;
  orderType: 'dine-in' | 'takeaway';
  serverName?: string;
  station?: string;
  createdAt: Date | string;
  items: Array<{
    name: string;
    quantity: number;
    notes?: string | null;
    modifiers?: string[];
  }>;
}

const money = (n: number) => `₹${n.toFixed(2)}`;

/**
 * Generates an 80-column ASCII thermal receipt (48 characters wide)
 */
export function generateAsciiReceipt(data: ReceiptData, width = 42): string {
  const line = '-'.repeat(width);
  const dline = '='.repeat(width);
  const center = (text: string) => {
    const pad = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(pad) + text;
  };
  const row = (left: string, right: string) => {
    const pad = Math.max(1, width - left.length - right.length);
    return left + ' '.repeat(pad) + right;
  };

  const lines: string[] = [];
  lines.push(center(data.restaurantName.toUpperCase()));
  if (data.branchName) lines.push(center(data.branchName));
  if (data.address) lines.push(center(data.address));
  if (data.phone) lines.push(center(`Tel: ${data.phone}`));
  if (data.gstin) lines.push(center(`GSTIN: ${data.gstin}`));
  lines.push(dline);

  lines.push(row(`Bill #: ${data.invoiceNumber || `INV-${data.orderId}`}`, new Date(data.createdAt).toLocaleDateString('en-IN')));
  lines.push(row(`Time: ${new Date(data.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`, `Type: ${data.orderType.toUpperCase()}`));
  if (data.tableNumber) lines.push(row(`Table: ${data.tableNumber}`, `Server: ${data.cashierName || 'Staff'}`));
  if (data.customerName) lines.push(row(`Guest: ${data.customerName}`, data.customerPhone || ''));
  lines.push(line);

  lines.push(row('Item', 'Qty x Price     Total'));
  lines.push(line);

  for (const item of data.items) {
    const itemTotal = money(item.totalPrice);
    const detail = `${item.quantity} x ${item.unitPrice.toFixed(0)}`;
    lines.push(item.name);
    lines.push(row(`  ${detail}`, itemTotal));
    if (item.notes) lines.push(`  * Note: ${item.notes}`);
    if (item.modifiers?.length) lines.push(`  * Mod: ${item.modifiers.join(', ')}`);
  }

  lines.push(line);
  lines.push(row('Subtotal:', money(data.subtotal)));
  if (data.discountAmount && data.discountAmount > 0) {
    lines.push(row(`Discount (${data.discountPct || 0}%):`, `-${money(data.discountAmount)}`));
  }
  if (data.taxAmount && data.taxAmount > 0) {
    lines.push(row(`Tax (${data.taxPct || 0}%):`, money(data.taxAmount)));
  }
  lines.push(dline);
  lines.push(row('GRAND TOTAL:', money(data.total)));
  lines.push(dline);

  if (data.paymentMethod) {
    lines.push(row('Payment Mode:', data.paymentMethod.toUpperCase()));
    if (data.tenderAmount && data.tenderAmount >= data.total) {
      lines.push(row('Tendered:', money(data.tenderAmount)));
      lines.push(row('Change Due:', money(data.changeDue || 0)));
    }
  }

  lines.push(line);
  lines.push(center('Thank you for dining with us!'));
  lines.push(center('Please visit again'));
  lines.push('\n\n');

  return lines.join('\n');
}

/**
 * Generates an ASCII Kitchen Order Ticket (KOT) slip
 */
export function generateAsciiKot(data: KotData, width = 40): string {
  const line = '-'.repeat(width);
  const dline = '='.repeat(width);
  const center = (text: string) => {
    const pad = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(pad) + text;
  };
  const row = (left: string, right: string) => {
    const pad = Math.max(1, width - left.length - right.length);
    return left + ' '.repeat(pad) + right;
  };

  const lines: string[] = [];
  lines.push(dline);
  lines.push(center('*** KITCHEN ORDER TICKET ***'));
  if (data.station) lines.push(center(`[ STATION: ${data.station.toUpperCase()} ]`));
  lines.push(dline);

  lines.push(row(`KOT #: ${data.kotNumber}`, `Order #: ${data.orderId}`));
  lines.push(row(`Table: ${data.tableNumber || 'Takeaway'}`, `Type: ${data.orderType.toUpperCase()}`));
  lines.push(row(`Time: ${new Date(data.createdAt).toLocaleTimeString('en-IN')}`, `By: ${data.serverName || 'Staff'}`));
  lines.push(line);
  lines.push(row('QTY', 'ITEM / INSTRUCTIONS'));
  lines.push(line);

  for (const item of data.items) {
    lines.push(`${item.quantity} x  ${item.name.toUpperCase()}`);
    if (item.notes) lines.push(`     >>> NOTE: ${item.notes}`);
    if (item.modifiers?.length) lines.push(`     >>> MOD: ${item.modifiers.join(', ')}`);
  }

  lines.push(line);
  lines.push(center('END OF TICKET'));
  lines.push('\n\n');

  return lines.join('\n');
}

/**
 * Generates HTML formatted thermal receipt for in-browser print dialog or display
 */
export function generateHtmlReceipt(data: ReceiptData): string {
  return `
    <div style="font-family: 'Courier New', Courier, monospace; width: 300px; padding: 16px; margin: 0 auto; color: #000; background: #fff; font-size: 13px; line-height: 1.4;">
      <div style="text-align: center; margin-bottom: 8px;">
        <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">${data.restaurantName}</h2>
        ${data.branchName ? `<div>${data.branchName}</div>` : ''}
        ${data.address ? `<div>${data.address}</div>` : ''}
        ${data.phone ? `<div>Tel: ${data.phone}</div>` : ''}
        ${data.gstin ? `<div>GSTIN: ${data.gstin}</div>` : ''}
      </div>
      <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 8px; font-size: 11px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Bill: ${data.invoiceNumber || `INV-${data.orderId}`}</span>
          <span>${new Date(data.createdAt).toLocaleDateString('en-IN')} ${new Date(data.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>${data.tableNumber ? `Table: ${data.tableNumber}` : `Type: ${data.orderType}`}</span>
          <span>Server: ${data.cashierName || 'Staff'}</span>
        </div>
        ${data.customerName ? `<div>Guest: ${data.customerName} (${data.customerPhone || ''})</div>` : ''}
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 12px;">
        <thead>
          <tr style="border-bottom: 1px dashed #000; text-align: left;">
            <th style="padding: 4px 0;">Item</th>
            <th style="text-align: center; padding: 4px 0;">Qty</th>
            <th style="text-align: right; padding: 4px 0;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${data.items
            .map(
              (i) => `
            <tr>
              <td style="padding: 4px 0;">
                <div>${i.name}</div>
                ${i.notes ? `<div style="font-size: 10px; color: #555;">* ${i.notes}</div>` : ''}
              </td>
              <td style="text-align: center; vertical-align: top; padding: 4px 0;">${i.quantity}</td>
              <td style="text-align: right; vertical-align: top; padding: 4px 0;">${money(i.totalPrice)}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
      <div style="border-top: 1px dashed #000; padding-top: 6px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between;"><span>Subtotal</span><span>${money(data.subtotal)}</span></div>
        ${data.discountAmount ? `<div style="display: flex; justify-content: space-between;"><span>Discount (${data.discountPct}%)</span><span>-${money(data.discountAmount)}</span></div>` : ''}
        ${data.taxAmount ? `<div style="display: flex; justify-content: space-between;"><span>Tax (${data.taxPct}%)</span><span>${money(data.taxAmount)}</span></div>` : ''}
        <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; margin-top: 4px; border-top: 1px solid #000; padding-top: 4px;">
          <span>Total</span><span>${money(data.total)}</span>
        </div>
      </div>
      ${
        data.paymentMethod
          ? `
        <div style="border-top: 1px dashed #000; padding-top: 4px; margin-bottom: 8px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between;"><span>Paid via</span><span>${data.paymentMethod.toUpperCase()}</span></div>
          ${data.tenderAmount ? `<div style="display: flex; justify-content: space-between;"><span>Tendered</span><span>${money(data.tenderAmount)}</span></div>` : ''}
          ${data.changeDue ? `<div style="display: flex; justify-content: space-between;"><span>Change</span><span>${money(data.changeDue)}</span></div>` : ''}
        </div>
      `
          : ''
      }
      <div style="text-align: center; margin-top: 12px; font-size: 11px; border-top: 1px dashed #000; padding-top: 8px;">
        <div>Thank you for visiting!</div>
        <div>Software Generated Digital Slip</div>
      </div>
    </div>
  `;
}
