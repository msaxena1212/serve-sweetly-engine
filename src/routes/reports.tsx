import { createFileRoute, redirect } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useMemo, useState } from "react";
import {
  BarChart3,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Users,
  CreditCard,
  Banknote,
  Smartphone,
  Star,
  Percent,
  Clock,
  Package,
  Archive,
  FileText,
  Database,
  DollarSign,
  Sparkles,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' });
    }
    if (!['owner', 'manager'].includes(context.session.role)) {
      throw redirect({ to: '/' });
    }
  },
  head: () => ({
    meta: [
      { title: "Reports — Forno" },
      { name: "description", content: "Browse sales, purchase, inventory, AI insights and financial reports." },
    ],
  }),
  component: ReportsPage,
});

const TAB_ORDER = ["AI Insights", "Sales", "Operations", "Purchases", "Inventory", "Financials"] as const;
const REPORT_CATEGORIES = {
  "AI Insights": [
    { title: "AI Demand Forecast", description: "Trend-adjusted run rate predictions for dish quantities & projected sales revenue.", icon: Sparkles, to: "/ai?tab=demand" },
    { title: "AI Purchasing & Ingredient Depletion", description: "Recipe-driven raw material consumption forecast and automated purchase recommendations.", icon: ShoppingCart, to: "/ai?tab=ingredients" },
    { title: "Dish Profitability & Popularity Matrix", description: "Classifies dishes into Champions, Crowd Pleasers, Hidden Gems, and Review based on margin vs popularity.", icon: Star, to: "/ai?tab=menu" },
    { title: "AI Sales Anomalies & Trends", description: "Statistical Z-score detection identifying days with abnormal revenue spikes or drops.", icon: TrendingUp, to: "/ai?tab=trends" },
    { title: "AI Executive Daily Summary", description: "Natural language LLM daily business briefing and operational risk analysis.", icon: FileText, to: "/ai?tab=summary" },
  ],
  Sales: [
    { title: "Sales Summary", description: "View sales summary over a period.", icon: Receipt },
    { title: "Product Sales Summary", description: "View sales by products over a period.", icon: ShoppingBag },
    { title: "Product Performance", description: "View product sales by performance.", icon: TrendingUp },
    { title: "Sales Category Summary", description: "View sales by product category summary.", icon: BarChart3 },
    { title: "Sales by Customer Type", description: "View sales by customer type summary.", icon: Users },
    { title: "Sales Tax Report", description: "View taxes by sales invoice.", icon: Percent },
    { title: "Product Sales Tax", description: "View taxes by products sold.", icon: Percent },
    { title: "User Reports", description: "View sales by users.", icon: Users },
    { title: "Top Selling Products Reports", description: "Top 10 best selling products.", icon: Star },
    { title: "Profit & Margin", description: "Show total cost, total sales and profit margins per product or category.", icon: DollarSign },
    { title: "Sales by Payment Method", description: "Breakdown sales by payment type (Cash, POS, Transfer, Credit, etc).", icon: CreditCard },
    { title: "Customer Purchase History", description: "Show total sales, frequency and last purchase date for each customer.", icon: Users },
    { title: "Sales Trend", description: "Line chart showing how sales move over time.", icon: TrendingUp },
    { title: "Branch Sales", description: "Compare sales per branch or warehouse.", icon: Banknote },
    { title: "Invoice & Receivables", description: "Track unpaid invoices and outstanding balances.", icon: FileText },
    { title: "Sales Return / Cr. Note", description: "Show returned or refunded items.", icon: Archive },
    { title: "Sales by Time of Day", description: "Breakdown of sales by hours.", icon: Clock },
    { title: "Average Basket Value", description: "Shows average sales per customer transaction.", icon: DollarSign },
    { title: "Salesperson Performance", description: "Track total sales, refunds, and commissions per user or cashier.", icon: Users },
  ],
  Purchases: [
    { title: "Purchase Summary", description: "View purchase summary overview.", icon: ShoppingBag },
    { title: "Products Purchases", description: "View purchase by products overview.", icon: Receipt },
    { title: "Purchase Price Trend", description: "Compare historical purchase prices by product or supplier across a date range.", icon: TrendingUp },
  ],
  Inventory: [
    { title: "Stock Summary", description: "Stock summary reports.", icon: Database },
    { title: "Stock Valuation Report", description: "Calculate the total value of current stock.", icon: DollarSign },
    { title: "Inventory Turnover Report", description: "Measure how often inventory is sold and replaced.", icon: Package },
    { title: "Expiring Product", description: "Identify products nearing their expiration dates to manage stock effectively and reduce waste.", icon: Clock },
    { title: "Expired Stock", description: "View a list of all products that have already passed their expiration date.", icon: Archive },
    { title: "Price List", description: "View products price list.", icon: CreditCard },
  ],
  Financials: [
    { title: "Profit by Day", description: "Revenue, food cost and gross profit for each day.", icon: TrendingUp },
    { title: "Profit by Category", description: "Gross profit and margin by menu category.", icon: BarChart3 },
    { title: "Price Advice", description: "Dishes priced below the target margin, with a suggested price.", icon: DollarSign },
    { title: "Expense Reports", description: "View expenses reports.", icon: Banknote },
    { title: "Balances Sheets", description: "Balance Sheet report.", icon: FileText },
    { title: "Trial Balance", description: "Trial Balance report.", icon: Percent },
  ],
  Operations: [
    { title: "Sales by Week", description: "Sales and orders grouped by week.", icon: Receipt },
    { title: "Sales by Month", description: "Monthly sales with growth against the previous month.", icon: TrendingUp },
    { title: "Bottom Selling Products", description: "Items with the fewest units sold in the period.", icon: Package },
    { title: "Sales by Channel", description: "Dine-in and takeaway sales. Delivery is not a separate order type yet.", icon: ShoppingBag },
    { title: "Discounts and Voids", description: "Discounts given, and voided or cancelled orders.", icon: Percent },
    { title: "Staff Voids and Discounts", description: "Voids and discounts per staff member.", icon: Users },
    { title: "Repeat Customer Rate", description: "How many customers came back, and their value.", icon: Users },
    { title: "Reservations and Waitlist", description: "Bookings, seated guests and no-show rate.", icon: Clock },
    { title: "Ingredient Cost per Dish", description: "Recipe cost, selling price and margin for each dish.", icon: DollarSign },
    { title: "Dish Profitability & Popularity", description: "Stars, plowhorses, puzzles and dogs, from sales and margin.", icon: Star },
    { title: "Waste and Shrinkage", description: "Damage, theft, expiry and wastage, with value lost.", icon: Archive },
    { title: "Supplier Price Changes", description: "Purchase price changes by supplier and product.", icon: TrendingUp },
    { title: "Shift Cash Variance", description: "Expected against counted cash for each shift.", icon: Banknote },
    { title: "Daily Cash-Up", description: "Money received by payment method each day, less refunds.", icon: CreditCard },
    { title: "Sales Anomalies", description: "Days whose sales are unusually high or low.", icon: BarChart3 },
    { title: "Preparation Time by Station", description: "Kitchen preparation times per station.", icon: Clock },
    { title: "KOT Delays", description: "Delays between sending and completing a KOT.", icon: Clock },
    { title: "Items Cancelled or Remade", description: "Items cancelled or remade in the kitchen.", icon: Archive },
    { title: "Tips Report", description: "Tips collected at payment.", icon: Banknote },
    { title: "Loyalty Tier Usage", description: "Customers by loyalty tier.", icon: Star },
    { title: "Purchase Order Lead Time", description: "Days from purchase order to goods received.", icon: Clock },
    { title: "Delivery Channel", description: "Sales through delivery partners.", icon: ShoppingBag },
  ],
};

type ReportCategory = keyof typeof REPORT_CATEGORIES;

function ReportsPage() {
  const [tab, setTab] = useState<ReportCategory>("AI Insights");
  const [search, setSearch] = useState("");

  const reports = REPORT_CATEGORIES[tab];
  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return reports;
    return reports.filter((report) =>
      report.title.toLowerCase().includes(query) || report.description.toLowerCase().includes(query)
    );
  }, [reports, search]);

  return (
    <div className="p-6 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Reports
          </h1>
          <p className="text-xs text-muted-foreground">Browse sales, purchase, inventory and financial reports.</p>
        </div>

        <div className="flex flex-1 max-w-2xl items-center gap-3 flex-wrap">
          <div className="flex flex-wrap gap-2">
            {TAB_ORDER.map((category) => (
              <button
                key={category}
                onClick={() => setTab(category)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors border",
                  tab === category
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted"
                )}
              >
                {category} ({REPORT_CATEGORIES[category].length})
              </button>
            ))}
          </div>

          <div className="flex-1 min-w-[220px]">
            <Input
              placeholder="Search reports..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11"
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredReports.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No reports match your search.
          </Card>
        ) : (
          filteredReports.map((report) => (
            <Card
              key={report.title}
              onClick={() => {
                if ('to' in report && (report as any).to) {
                  window.location.assign((report as any).to);
                } else {
                  window.location.assign(`/report?name=${encodeURIComponent(report.title)}`);
                }
              }}
              className="p-5 hover:shadow-lg transition-shadow group cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-sm">{report.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground leading-6">{report.description}</p>
                </div>
                <report.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-4 text-sm font-semibold text-primary flex items-center gap-1">
                View Report <span className="transition-transform group-hover:translate-x-1">→</span>
              </div>
            </Card>
          ))
        )}
      </div>

    </div>
  );
}
