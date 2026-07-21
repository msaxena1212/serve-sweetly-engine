import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, CalendarDays, Download, Filter, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/report")({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
    if (!['owner', 'manager'].includes(context.session.role)) throw redirect({ to: "/" });
  },
  validateSearch: (search: Record<string, unknown>) => ({
    name: typeof search.name === "string" ? search.name : "Sales Summary",
  }),
  head: () => ({ meta: [{ title: "Report Detail — Forno" }] }),
  component: ReportDetailPage,
});

const descriptions: Record<string, string> = {
  "Sales Summary": "View sales summary over a period.",
  "Product Sales Summary": "View sales by products over a period.",
  "Product Performance": "View product sales by performance.",
  "Sales Category Summary": "View sales by product category summary.",
  "Sales by Customer Type": "View sales by customer type summary.",
  "Sales Tax Report": "View taxes by sales invoice.",
  "Product Sales Tax": "View taxes by products sold.",
  "User Reports": "View sales by users.",
  "Top Selling Products Reports": "Top 10 best selling products.",
  "Profit & Margin": "Show total cost, total sales and profit margins per product or category.",
  "Sales by Payment Method": "Breakdown sales by payment type (Cash, POS, Transfer, Credit, etc).",
  "Customer Purchase History": "Show total sales, frequency and last purchase date for each customer.",
  "Sales Trend": "Line chart showing how sales move over time.",
  "Branch Sales": "Compare sales per branch or warehouse.",
  "Invoice & Receivables": "Track unpaid invoices and outstanding balances.",
  "Sales Return / Cr. Note": "Show returned or refunded items.",
  "Sales by Time of Day": "Breakdown of sales by hours.",
  "Average Basket Value": "Shows average sales per customer transaction.",
  "Salesperson Performance": "Track total sales, refunds, and commissions per user or cashier.",
  "Purchase Summary": "View purchase summary overview.",
  "Products Purchases": "View purchase by products overview.",
  "Purchase Price Trend": "Compare historical purchase prices by product or supplier across a date range.",
  "Stock Summary": "Stock summary reports.",
  "Stock Valuation Report": "Calculate the total value of current stock.",
  "Inventory Turnover Report": "Measure how often inventory is sold and replaced.",
  "Expiring Product": "Identify products nearing their expiration dates to manage stock effectively and reduce waste.",
  "Expired Stock": "View a list of all products that have already passed their expiration date.",
  "Price List": "View products price list.",
  "Expense Reports": "View expenses reports.",
  "Balances Sheets": "Balance Sheet report.",
  "Trial Balance": "Trial Balance report.",
};

const mockPeriods = Array.from({ length: 5 }, (_, monthOffset) => {
  const date = new Date();
  date.setMonth(date.getMonth() - (4 - monthOffset));
  return date;
});
const mockDate = (monthIndex: number, day: number) => {
  const date = new Date(mockPeriods[monthIndex]);
  date.setDate(Math.min(day, 28));
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const mockSales = mockPeriods.flatMap((_, monthIndex) => [
  [mockDate(monthIndex, 5), "Paneer Tikka", "Starters", `${132 + monthIndex * 4}`, `₹${(39600 + monthIndex * 1200).toLocaleString("en-IN")}`],
  [mockDate(monthIndex, 12), "Butter Chicken", "Main Course", `${112 + monthIndex * 3}`, `₹${(50400 + monthIndex * 1260).toLocaleString("en-IN")}`],
  [mockDate(monthIndex, 19), "Masala Lemonade", "Beverages", `${180 + monthIndex * 6}`, `₹${(27000 + monthIndex * 900).toLocaleString("en-IN")}`],
  [mockDate(monthIndex, 26), "Gulab Jamun", "Desserts", `${78 + monthIndex * 3}`, `₹${(11700 + monthIndex * 450).toLocaleString("en-IN")}`],
]);
const mockPurchases = mockPeriods.flatMap((_, monthIndex) => [
  [mockDate(monthIndex, 4), `INV-${10000 + monthIndex}1`, ["Metro Foods", "Fresh Farm Co.", "Metro Foods", "Organic Mart", "Fresh Farm Co."][monthIndex], "Paneer", `${32 + monthIndex * 2} kg`, `₹${[280, 292, 275, 310, 286][monthIndex]}`, `₹${([32 + monthIndex * 2] * [280, 292, 275, 310, 286][monthIndex]).toLocaleString("en-IN")}`],
  [mockDate(monthIndex, 4), `INV-${10000 + monthIndex}1`, ["Metro Foods", "Fresh Farm Co.", "Metro Foods", "Organic Mart", "Fresh Farm Co."][monthIndex], "Tomatoes", `${10 + monthIndex} kg`, `₹${[48, 52, 45, 50, 47][monthIndex]}`, `₹${([10 + monthIndex] * [48, 52, 45, 50, 47][monthIndex]).toLocaleString("en-IN")}`],
  [mockDate(monthIndex, 11), `INV-${10000 + monthIndex}2`, ["Fresh Farm Co.", "Metro Foods", "Fresh Farm Co.", "Fresh Farm Co.", "Metro Foods"][monthIndex], "Tomatoes", `${52 + monthIndex * 3} kg`, `₹${[48, 52, 45, 50, 47][monthIndex]}`, `₹${([52 + monthIndex * 3] * [48, 52, 45, 50, 47][monthIndex]).toLocaleString("en-IN")}`],
  [mockDate(monthIndex, 18), `INV-${10000 + monthIndex}3`, ["Beverage Hub", "Metro Foods", "Beverage Hub", "Fresh Farm Co.", "Beverage Hub"][monthIndex], "Mineral Water", `${190 + monthIndex * 10} pcs`, `₹${[18, 17, 19, 16, 18][monthIndex]}`, `₹${([190 + monthIndex * 10] * [18, 17, 19, 16, 18][monthIndex]).toLocaleString("en-IN")}`],
  [mockDate(monthIndex, 25), `INV-${10000 + monthIndex}4`, ["Metro Foods", "Fresh Farm Co.", "Metro Foods", "Fresh Farm Co.", "Metro Foods"][monthIndex], "Cooking Oil", `${24 + monthIndex} liter`, `₹${[142, 150, 138, 145, 140][monthIndex]}`, `₹${([24 + monthIndex] * [142, 150, 138, 145, 140][monthIndex]).toLocaleString("en-IN")}`],
]);
const mockInventory = mockPeriods.flatMap((_, monthIndex) => [
  [mockDate(monthIndex, 6), "Paneer", `${34 + monthIndex * 2} kg`, `₹${(9520 + monthIndex * 560).toLocaleString("en-IN")}`, "Healthy"],
  [mockDate(monthIndex, 13), "Tomatoes", `${14 + monthIndex} kg`, `₹${(672 + monthIndex * 48).toLocaleString("en-IN")}`, "Low stock"],
  [mockDate(monthIndex, 20), "Cooking Oil", `${22 + monthIndex} liter`, `₹${(3124 + monthIndex * 142).toLocaleString("en-IN")}`, "Healthy"],
  [mockDate(monthIndex, 27), "Mineral Water", `${78 + monthIndex * 6} pcs`, `₹${(1404 + monthIndex * 108).toLocaleString("en-IN")}`, "Healthy"],
]);
const mockFinance = mockPeriods.flatMap((_, monthIndex) => [
  [mockDate(monthIndex, 7), "Food Sales", `₹${(118000 + monthIndex * 6800).toLocaleString("en-IN")}`, "₹0", `₹${(118000 + monthIndex * 6800).toLocaleString("en-IN")}`],
  [mockDate(monthIndex, 14), "Beverage Sales", `₹${(31000 + monthIndex * 1800).toLocaleString("en-IN")}`, "₹0", `₹${(31000 + monthIndex * 1800).toLocaleString("en-IN")}`],
  [mockDate(monthIndex, 21), "Supplier Purchases", "₹0", `₹${(36000 + monthIndex * 2100).toLocaleString("en-IN")}`, `-₹${(36000 + monthIndex * 2100).toLocaleString("en-IN")}`],
  [mockDate(monthIndex, 28), "Operating Expenses", "₹0", `₹${(15400 + monthIndex * 800).toLocaleString("en-IN")}`, `-₹${(15400 + monthIndex * 800).toLocaleString("en-IN")}`],
]);

const parseMockPrice = (value: string) => Number(value.replace(/[₹,]/g, ""));
const trendProducts = Array.from(new Set(mockPurchases.map(row => row[3]))).map(product => {
  const history = mockPurchases.filter(row => row[3] === product);
  const latest = history[history.length - 1];
  const averagePrice = history.reduce((sum, row) => sum + parseMockPrice(row[5]), 0) / history.length;
  const supplierStats = Array.from(new Set(history.map(row => row[2]))).map(supplier => {
    const supplierRows = history.filter(row => row[2] === supplier);
    return { supplier, average: supplierRows.reduce((sum, row) => sum + parseMockPrice(row[5]), 0) / supplierRows.length };
  }).sort((a, b) => a.average - b.average);
  return { product, history, latest, averagePrice, minPrice: Math.min(...history.map(row => parseMockPrice(row[5]))), recommendedSupplier: supplierStats[0] };
});

const reportProfiles: Record<string, { columns: string[]; rows: string[][] }> = {
  "Sales Summary": { columns: ["Period", "Gross Sales", "Discounts", "Tax", "Net Sales"], rows: [["Mar 2026", "₹1,42,500", "₹4,200", "₹12,870", "₹1,51,170"], ["Apr 2026", "₹1,58,300", "₹5,100", "₹14,220", "₹1,67,420"], ["May 2026", "₹1,74,800", "₹5,800", "₹15,732", "₹1,84,732"]] },
  "Product Sales Summary": { columns: ["Product", "Units Sold", "Orders", "Revenue", "Share"], rows: [["Butter Chicken", "126", "98", "₹56,700", "26%"], ["Paneer Tikka", "148", "112", "₹44,400", "20%"], ["Masala Lemonade", "203", "151", "₹30,450", "14%"]] },
  "Product Performance": { columns: ["Product", "Orders", "Avg Rating", "Repeat Rate", "Growth"], rows: [["Paneer Tikka", "148", "4.8/5", "42%", "+18%"], ["Butter Chicken", "126", "4.6/5", "38%", "+12%"], ["Gulab Jamun", "92", "4.7/5", "31%", "+8%"]] },
  "Sales Category Summary": { columns: ["Category", "Orders", "Revenue", "Share", "Growth"], rows: [["Main Course", "384", "₹98,400", "45%", "+14%"], ["Starters", "292", "₹62,300", "29%", "+9%"], ["Beverages", "251", "₹38,450", "18%", "+21%"]] },
  "Sales by Customer Type": { columns: ["Customer Type", "Customers", "Orders", "Revenue", "Avg Order"], rows: [["Dine-in", "482", "1,126", "₹1,62,400", "₹1,442"], ["Takeaway", "314", "684", "₹72,800", "₹1,064"], ["Delivery", "208", "421", "₹46,200", "₹1,097"]] },
  "Sales Tax Report": { columns: ["Invoice", "Taxable Amount", "Tax Rate", "Tax", "Status"], rows: [["INV-S-2041", "₹18,400", "5%", "₹920", "Filed"], ["INV-S-2042", "₹24,800", "5%", "₹1,240", "Filed"], ["INV-S-2043", "₹12,600", "12%", "₹1,512", "Pending"]] },
  "Product Sales Tax": { columns: ["Product", "Taxable Amount", "Tax Rate", "Tax", "Tax Share"], rows: [["Butter Chicken", "₹56,700", "5%", "₹2,835", "24%"], ["Paneer Tikka", "₹44,400", "5%", "₹2,220", "19%"], ["Soft Drinks", "₹18,200", "12%", "₹2,184", "18%"]] },
  "User Reports": { columns: ["User", "Orders", "Sales", "Refunds", "Net Sales"], rows: [["Admin Owner", "214", "₹82,400", "₹1,200", "₹81,200"], ["Manager John", "186", "₹68,700", "₹800", "₹67,900"], ["Cashier Jane", "142", "₹48,350", "₹450", "₹47,900"]] },
  "Top Selling Products Reports": { columns: ["Rank", "Product", "Units Sold", "Revenue", "Trend"], rows: [["1", "Masala Lemonade", "203", "₹30,450", "↑ 21%"], ["2", "Paneer Tikka", "148", "₹44,400", "↑ 18%"], ["3", "Butter Chicken", "126", "₹56,700", "↑ 12%"]] },
  "Profit & Margin": { columns: ["Product", "Cost", "Sales", "Profit", "Margin"], rows: [["Butter Chicken", "₹24,600", "₹56,700", "₹32,100", "56.6%"], ["Paneer Tikka", "₹18,200", "₹44,400", "₹26,200", "59.0%"], ["Masala Lemonade", "₹9,800", "₹30,450", "₹20,650", "67.8%"]] },
  "Sales by Payment Method": { columns: ["Payment Method", "Transactions", "Amount", "Share", "Avg Value"], rows: [["Cash", "482", "₹82,400", "38%", "₹1,441"], ["UPI", "614", "₹96,250", "44%", "₹1,432"], ["Card", "248", "₹39,800", "18%", "₹1,604"]] },
  "Customer Purchase History": { columns: ["Customer", "Purchases", "Frequency", "Last Purchase", "Lifetime Value"], rows: [["Aarav Mehta", "18", "Weekly", "21 Jul 2026", "₹28,400"], ["Priya Shah", "12", "Fortnightly", "19 Jul 2026", "₹19,650"], ["Rohan Das", "8", "Monthly", "15 Jul 2026", "₹11,200"]] },
  "Sales Trend": { columns: ["Month", "Sales", "Orders", "Avg Order", "Growth"], rows: [["Mar 2026", "₹1,51,170", "1,142", "₹1,323", "+6%"], ["Apr 2026", "₹1,67,420", "1,268", "₹1,320", "+11%"], ["May 2026", "₹1,84,732", "1,405", "₹1,315", "+10%"]] },
  "Branch Sales": { columns: ["Branch", "Orders", "Sales", "Costs", "Margin"], rows: [["Main Branch", "1,126", "₹1,62,400", "₹72,300", "55.5%"], ["Mall Kiosk", "684", "₹72,800", "₹38,200", "47.5%"], ["Airport Counter", "421", "₹46,200", "₹25,600", "44.6%"]] },
  "Invoice & Receivables": { columns: ["Invoice", "Customer", "Due Date", "Paid", "Balance"], rows: [["INV-R-1001", "Aarav Mehta", "25 Jul 2026", "₹18,000", "₹4,200"], ["INV-R-1002", "Priya Shah", "28 Jul 2026", "₹12,500", "₹0"], ["INV-R-1003", "Rohan Das", "02 Aug 2026", "₹6,800", "₹3,400"]] },
  "Sales Return / Cr. Note": { columns: ["Credit Note", "Invoice", "Reason", "Amount", "Status"], rows: [["CN-204", "INV-S-1940", "Damaged item", "₹1,200", "Approved"], ["CN-205", "INV-S-1951", "Wrong order", "₹850", "Approved"], ["CN-206", "INV-S-1964", "Customer return", "₹640", "Pending"]] },
  "Sales by Time of Day": { columns: ["Time Slot", "Orders", "Sales", "Share", "Avg Order"], rows: [["12 PM – 3 PM", "382", "₹62,400", "29%", "₹1,240"], ["6 PM – 9 PM", "514", "₹88,750", "41%", "₹1,318"], ["9 PM – 12 AM", "286", "₹49,600", "23%", "₹1,247"]] },
  "Average Basket Value": { columns: ["Period", "Customers", "Sales", "Items Sold", "Avg Basket"], rows: [["Mar 2026", "1,142", "₹1,51,170", "3,428", "₹1,323"], ["Apr 2026", "1,268", "₹1,67,420", "3,814", "₹1,320"], ["May 2026", "1,405", "₹1,84,732", "4,226", "₹1,315"]] },
  "Salesperson Performance": { columns: ["Salesperson", "Sales", "Orders", "Refunds", "Commission"], rows: [["Admin Owner", "₹82,400", "214", "₹1,200", "₹4,120"], ["Manager John", "₹68,700", "186", "₹800", "₹3,435"], ["Cashier Jane", "₹48,350", "142", "₹450", "₹2,418"]] },
  "Purchase Summary": { columns: ["Supplier", "Invoices", "Quantity", "Total Purchase", "Avg Invoice"], rows: [["Metro Foods", "12", "428 kg", "₹42,600", "₹3,550"], ["Fresh Farm Co.", "9", "316 kg", "₹27,840", "₹3,093"], ["Beverage Hub", "7", "1,240 pcs", "₹22,320", "₹3,189"]] },
  "Products Purchases": { columns: ["Invoice", "Product", "Supplier", "Quantity", "Unit Price", "Total"], rows: [["INV-10001", "Paneer", "Metro Foods", "42 kg", "₹280", "₹11,760"], ["INV-10001", "Tomatoes", "Metro Foods", "10 kg", "₹48", "₹480"], ["INV-10002", "Tomatoes", "Fresh Farm Co.", "65 kg", "₹48", "₹3,120"], ["INV-10003", "Cooking Oil", "Metro Foods", "30 liter", "₹142", "₹4,260"]] },
  "Stock Summary": { columns: ["Product", "On Hand", "Minimum", "Status", "Last Count"], rows: [["Paneer", "42 kg", "20 kg", "Healthy", "21 Jul 2026"], ["Tomatoes", "18 kg", "25 kg", "Low stock", "21 Jul 2026"], ["Cooking Oil", "26 liter", "15 liter", "Healthy", "20 Jul 2026"]] },
  "Stock Valuation Report": { columns: ["Product", "Quantity", "Cost / Unit", "Stock Value", "Method"], rows: [["Paneer", "42 kg", "₹280", "₹11,760", "Weighted Avg"], ["Tomatoes", "18 kg", "₹48", "₹864", "Weighted Avg"], ["Cooking Oil", "26 liter", "₹142", "₹3,692", "Weighted Avg"]] },
  "Inventory Turnover Report": { columns: ["Product", "Opening Qty", "Consumed", "Closing Qty", "Turnover"], rows: [["Paneer", "68 kg", "44 kg", "42 kg", "1.05x"], ["Tomatoes", "92 kg", "74 kg", "18 kg", "3.36x"], ["Cooking Oil", "54 liter", "28 liter", "26 liter", "1.12x"]] },
  "Expiring Product": { columns: ["Product", "Batch", "Expiry Date", "Quantity", "Alert"], rows: [["Paneer", "PN-2407", "25 Jul 2026", "8 kg", "3 days"], ["Cream", "CR-182", "02 Aug 2026", "12 liter", "11 days"], ["Yogurt", "YG-091", "10 Aug 2026", "16 kg", "19 days"]] },
  "Expired Stock": { columns: ["Product", "Batch", "Expired On", "Quantity", "Action"], rows: [["Spinach", "SP-044", "16 Jul 2026", "6 kg", "Dispose"], ["Fresh Cream", "FC-211", "12 Jul 2026", "4 liter", "Blocked"], ["Curd", "CD-098", "08 Jul 2026", "8 kg", "Dispose"]] },
  "Price List": { columns: ["Product", "Unit", "Cost Price", "Selling Price", "Margin"], rows: [["Paneer", "kg", "₹280", "₹520", "46.2%"], ["Tomatoes", "kg", "₹48", "₹120", "60.0%"], ["Cooking Oil", "liter", "₹142", "₹260", "45.4%"]] },
  "Expense Reports": { columns: ["Expense", "Category", "Date", "Amount", "Status"], rows: [["Electricity", "Utilities", "18 Jul 2026", "₹12,400", "Paid"], ["Equipment Repair", "Maintenance", "14 Jul 2026", "₹8,600", "Paid"], ["Cleaning Supplies", "Operations", "09 Jul 2026", "₹3,200", "Pending"]] },
  "Balances Sheets": { columns: ["Account", "Assets", "Liabilities", "Equity", "Balance"], rows: [["Cash & Bank", "₹2,84,500", "₹0", "₹2,84,500", "₹2,84,500"], ["Inventory", "₹1,42,300", "₹18,000", "₹1,24,300", "₹1,24,300"], ["Equipment", "₹4,80,000", "₹72,000", "₹4,08,000", "₹4,08,000"]] },
  "Trial Balance": { columns: ["Account", "Debit", "Credit", "Net Balance", "Type"], rows: [["Cash", "₹2,84,500", "₹0", "₹2,84,500", "Asset"], ["Sales Revenue", "₹0", "₹3,21,500", "-₹3,21,500", "Income"], ["Supplier Payable", "₹0", "₹42,900", "-₹42,900", "Liability"]] },
};

function ReportDetailPage() {
  const { name } = Route.useSearch();
  const defaultFrom = new Date();
  defaultFrom.setMonth(defaultFrom.getMonth() - 5);
  const [from, setFrom] = useState(defaultFrom.toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const title = descriptions[name] ? name : "Sales Summary";
  const isPurchase = title.toLowerCase().includes("purchase");
  const isPriceTrend = title === "Purchase Price Trend";
  const isInventory = ["Stock Summary", "Stock Valuation Report", "Inventory Turnover Report", "Expiring Product", "Expired Stock", "Price List"].includes(title);
  const isFinance = ["Expense Reports", "Balances Sheets", "Trial Balance", "Invoice & Receivables"].includes(title);
  const profile = reportProfiles[title];
  const rows = isPriceTrend ? mockPurchases : profile?.rows ?? (isPurchase ? mockPurchases : isInventory ? mockInventory : isFinance ? mockFinance : mockSales);
  const columns = isPriceTrend ? ["Product", "Date", "Supplier", "Invoice", "Quantity", "Unit Price", "Total"] : profile?.columns ?? (isPurchase ? ["Date", "Invoice", "Supplier", "Product", "Quantity", "Unit Price", "Total"] : isInventory ? ["Date", "Product", "Quantity", "Value", "Status"] : isFinance ? ["Date", "Account", "Debit", "Credit", "Balance"] : ["Date", "Product", "Category", "Orders", "Amount"]);
  const visibleRows = useMemo(() => isPriceTrend
    ? [...mockPurchases].sort((a, b) => a[3].localeCompare(b[3]) || a[0].localeCompare(b[0])).map(row => [row[3], row[0], row[2], row[1], row[4], row[5], row[6]])
    : rows, [isPriceTrend, rows]);
  const selectedTrend = trendProducts.find(item => item.product === selectedProduct);
  const isPurchaseSummary = title === "Purchase Summary";
  const totalInvoices = isPurchaseSummary ? (profile?.rows ?? []).reduce((sum, row) => sum + Number(row[1]), 0) : 0;
  const totalPurchaseValue = isPurchaseSummary ? (profile?.rows ?? []).reduce((sum, row) => sum + parseMockPrice(row[3]), 0) : 0;
  const recordLabel = isPurchaseSummary ? "Total invoices" : "Total records";
  const recordValue = isPurchaseSummary ? totalInvoices.toString() : (visibleRows.length * 37).toString();
  const valueLabel = isPurchaseSummary ? "Total purchase value" : "Total value";
  const valueAmount = isPurchaseSummary ? `₹${totalPurchaseValue.toLocaleString("en-IN")}` : "₹2,18,450";

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/reports" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"><ArrowLeft className="h-4 w-4" /> Back to Reports</Link>
          <h1 className="text-xl font-semibold flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /> {title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{descriptions[title]}</p>
        </div>
        <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" /> Export Mock Report</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">{recordLabel}</p><p className="text-2xl font-semibold mt-1">{recordValue}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">{valueLabel}</p><p className="text-2xl font-semibold mt-1">{valueAmount}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Period change</p><p className="text-2xl font-semibold mt-1 text-emerald-600">+12.8%</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Report status</p><p className="text-2xl font-semibold mt-1 text-primary">Ready</p></Card>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2 font-semibold text-sm"><Filter className="h-4 w-4 text-primary" /> Filters</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs text-muted-foreground">From date<Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1" /></label>
          <label className="text-xs text-muted-foreground">To date<Input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1" /></label>
          <label className="text-xs text-muted-foreground">View<select className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"><option>All records</option><option>Top performers</option><option>Exceptions only</option></select></label>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Showing mock data for {from} to {to}.</p>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4"><div><h2 className="font-semibold">{isPriceTrend ? "Product-wise price history" : `${title} details`}</h2><p className="text-xs text-muted-foreground mt-1">{isPriceTrend ? "Each product is grouped together so supplier and date-wise unit price changes are easy to compare." : "Sample rows demonstrate the final report layout."}</p></div><TrendingUp className="h-5 w-5 text-primary" /></div>
        {isPriceTrend ? (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs uppercase text-muted-foreground border-b"><tr><th className="text-left py-2 pr-4">Product</th><th className="text-right py-2 pr-4">Purchases</th><th className="text-right py-2 pr-4">Average Price</th><th className="text-right py-2 pr-4">Lowest Price</th><th className="text-left py-2 pr-4">Best Supplier (Avg)</th><th className="text-right py-2">Action</th></tr></thead><tbody>{trendProducts.map(item => <tr key={item.product} className="border-b last:border-0"><td className="py-3 pr-4 font-medium">{item.product}</td><td className="py-3 pr-4 text-right">{item.history.length}</td><td className="py-3 pr-4 text-right">₹{item.averagePrice.toFixed(2)}</td><td className="py-3 pr-4 text-right font-semibold text-emerald-600">₹{item.minPrice.toFixed(2)}</td><td className="py-3 pr-4">{item.recommendedSupplier.supplier} <span className="text-muted-foreground">(₹{item.recommendedSupplier.average.toFixed(2)})</span></td><td className="py-3 text-right"><Button size="sm" variant="outline" onClick={() => setSelectedProduct(item.product)}>View Trend</Button></td></tr>)}</tbody></table></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs uppercase text-muted-foreground border-b"><tr>{columns.map(column => <th key={column} className="text-left py-2 pr-4">{column}</th>)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={index} className="border-b last:border-0">{row.map((cell, cellIndex) => <td key={cellIndex} className={`py-3 pr-4 ${cellIndex === row.length - 1 ? "font-semibold" : ""}`}>{cell}</td>)}</tr>)}</tbody></table></div>
        )}
      </Card>

      <Dialog open={Boolean(selectedTrend)} onOpenChange={open => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedTrend?.product} — Purchase Price Trend</DialogTitle>
            <DialogDescription>Date-wise purchase history by supplier and invoice.</DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-xs uppercase text-muted-foreground border-b"><tr><th className="text-left py-2 pr-4">Date</th><th className="text-left py-2 pr-4">Invoice Number</th><th className="text-left py-2 pr-4">Supplier</th><th className="text-right py-2">Unit Price</th></tr></thead><tbody>{selectedTrend?.history.map((row, index) => <tr key={index} className="border-b last:border-0"><td className="py-3 pr-4">{row[0]}</td><td className="py-3 pr-4 font-medium">{row[1]}</td><td className="py-3 pr-4">{row[2]}</td><td className="py-3 text-right font-semibold">{row[5]}</td></tr>)}</tbody></table></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
