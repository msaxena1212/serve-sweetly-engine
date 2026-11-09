import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, CalendarDays, Download, Filter, Info, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ReportChart } from "@/components/report-chart";
import { getReportFn, type ColType, type ReportResult } from "@/lib/reports";

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
  "Profit by Day": "Revenue, food cost and gross profit for each day.",
  "Profit by Category": "Gross profit and margin by menu category.",
  "Price Advice": "Dishes priced below the target margin, with a suggested price.",
  "Sales by Week": "Sales and orders grouped by week.",
  "Sales by Month": "Monthly sales with growth against the previous month.",
  "Bottom Selling Products": "Items with the fewest units sold in the period.",
  "Sales by Channel": "Dine-in and takeaway sales. Delivery is not a separate order type yet.",
  "Discounts and Voids": "Discounts given, and voided or cancelled orders.",
  "Staff Voids and Discounts": "Voids and discounts per staff member.",
  "Repeat Customer Rate": "How many customers came back, and their value.",
  "Reservations and Waitlist": "Bookings, seated guests and no-show rate.",
  "Ingredient Cost per Dish": "Recipe cost, selling price and margin for each dish.",
  "Dish Profitability & Popularity": "Stars, plowhorses, puzzles and dogs, from sales and margin.",
  "Menu Engineering": "Stars, plowhorses, puzzles and dogs, from sales and margin.",
  "Waste and Shrinkage": "Damage, theft, expiry and wastage, with value lost.",
  "Supplier Price Changes": "Purchase price changes by supplier and product.",
  "Shift Cash Variance": "Expected against counted cash for each shift.",
  "Daily Cash-Up": "Money received by payment method each day, less refunds.",
  "Sales Anomalies": "Days whose sales are unusually high or low.",
  "Preparation Time by Station": "Kitchen preparation times per station.",
  "KOT Delays": "Delays between sending and completing a KOT.",
  "Items Cancelled or Remade": "Items cancelled or remade in the kitchen.",
  "Tips Report": "Tips collected at payment.",
  "Loyalty Tier Usage": "Customers by loyalty tier.",
  "Purchase Order Lead Time": "Days from purchase order to goods received.",
  "Delivery Channel": "Sales through delivery partners.",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

function formatCell(type: ColType, value: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "money") return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (type === "int") return Number(value).toLocaleString("en-IN");
  if (type === "pct") return `${value}%`;
  return String(value);
}

function ReportDetailPage() {
  const { name } = Route.useSearch();
  const title = descriptions[name] ? name : "Sales Summary";
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return iso(d); });
  const [to, setTo] = useState(() => iso(new Date()));
  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getReportFn({ data: { name: title, from, to } })
      .then((r) => { if (!cancelled) setReport(r); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [title, from, to]);

  const exportCsv = () => {
    if (!report || !report.available) return;
    const header = report.columns.map((c) => c.label);
    const body = report.rows.map((r) => report.columns.map((c) => r[c.key] ?? ""));
    const csv = [header, ...body]
      .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\W+/g, "_")}_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-5 animate-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/reports" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"><ArrowLeft className="h-4 w-4" /> Back to Reports</Link>
          <h1 className="text-xl font-semibold flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /> {title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{descriptions[title]}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!report?.available || loading}>
          <Download className="h-4 w-4 mr-1.5" /> Export CSV
        </Button>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2 font-semibold text-sm"><Filter className="h-4 w-4 text-primary" /> Period</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <label className="text-xs text-muted-foreground">From date<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" /></label>
          <label className="text-xs text-muted-foreground">To date<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" /></label>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" /> Live data from {from} to {to}{loading ? " · updating…" : ""}.
        </p>
      </Card>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {report && !report.available && (
        <Card className="p-5 flex gap-3 items-start">
          <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold">Not available yet</h2>
            <p className="text-sm text-muted-foreground mt-1">{report.message}</p>
          </div>
        </Card>
      )}

      {report?.available && (
        <>
          {report.summary.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {report.summary.slice(0, 4).map((s) => (
                <Card key={s.label} className="p-4 lift">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-semibold mt-1 tabular-nums">{formatCell(s.type, s.value)}</p>
                </Card>
              ))}
            </div>
          )}

          <ReportChart columns={report.columns} rows={report.rows} />
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold">{title} details</h2>
                {report.message && <p className="text-xs text-muted-foreground mt-1">{report.message}</p>}
              </div>
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            {report.rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No records for this period. Try a wider date range.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b">
                    <tr>{report.columns.map((c) => <th key={c.key} className={`py-2 pr-4 ${c.type === "text" || c.type === "date" ? "text-left" : "text-right"}`}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {report.columns.map((c, j) => (
                          <td key={c.key} className={`py-3 pr-4 ${c.type === "text" || c.type === "date" ? "" : "text-right tabular-nums"} ${j === report.columns.length - 1 ? "font-semibold" : ""}`}>
                            {formatCell(c.type, row[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
