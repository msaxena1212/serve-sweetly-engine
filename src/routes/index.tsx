import { createFileRoute, redirect } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { usePos, fmtMoney } from "@/lib/pos-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Utensils, ShoppingBag, ChefHat, AlertTriangle, TrendingUp, Receipt, LogIn, LogOut, Clock, CalendarClock, Users, Phone } from "lucide-react";
import { useState, useEffect } from "react";
import { getReservationsFn, updateReservationStatusFn } from "@/lib/api";
import { ReservationModal } from "@/components/reservation-modal";
import { toast } from "sonner";
import { useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' });
    }
  },
  loader: async () => {
    const reservations = await getReservationsFn({ data: { branchId: 'br-1' } });
    return { reservations };
  },
  head: () => ({
    meta: [
      { title: "Dashboard — Forno POS" },
      { name: "description", content: "Live overview of sales, open tables, kitchen queue and low stock." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const router = useRouter();
  const { session } = Route.useRouteContext();
  const { reservations } = Route.useLoaderData();
  const { orders, tables, menu, getOrderTotals } = usePos();
  const [shiftOpen, setShiftOpen] = useState(() => {
    try { return sessionStorage.getItem("shift-open") === "true"; } catch { return false; }
  });
  const [shiftStart, setShiftStart] = useState<number | null>(() => {
    try { const s = sessionStorage.getItem("shift-start"); return s ? parseInt(s) : null; } catch { return null; }
  });
  const [now, setNow] = useState(Date.now());
  const [showResModal, setShowResModal] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      router.invalidate();
    }, 5000);
    return () => clearInterval(id);
  }, [router]);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const paidToday = orders.filter((o) => o.status === "paid" && (o.closedAt ?? 0) >= startOfDay);
  const revenue = paidToday.reduce((s, o) => s + getOrderTotals(o).total, 0);
  const openOrders = orders.filter((o) => o.status === "open");
  const occupiedTables = new Set(openOrders.filter((o) => o.tableId).map((o) => o.tableId)).size;
  const kitchenQueue = openOrders.flatMap((o) => o.items).filter((i) => ["sent", "preparing"].includes(i.status)).length;
  const takeawayQueue = openOrders.filter((o) => o.type === "takeaway").length;
  const lowStock = menu.filter((m) => m.stock <= 10);

  const shiftMinutes = shiftStart ? Math.floor((now - shiftStart) / 60000) : 0;

  const openShift = () => {
    const t = Date.now();
    setShiftOpen(true);
    setShiftStart(t);
    try { sessionStorage.setItem("shift-open", "true"); sessionStorage.setItem("shift-start", t.toString()); } catch {}
  };
  const closeShift = () => {
    setShiftOpen(false);
    setShiftStart(null);
    try { sessionStorage.removeItem("shift-open"); sessionStorage.removeItem("shift-start"); } catch {}
  };

  const handleCancelReservation = async (id: number) => {
    try {
      await updateReservationStatusFn({ data: { id, status: 'cancelled' } });
      toast.success("Reservation cancelled.");
      router.invalidate();
    } catch {
      toast.error("Failed to cancel reservation");
    }
  };

  const stats = [
    { label: "Revenue (today)", value: fmtMoney(revenue), icon: TrendingUp, tint: "bg-primary/10 text-primary" },
    { label: "Orders paid", value: paidToday.length.toString(), icon: Receipt, tint: "bg-emerald-500/10 text-emerald-600" },
    { label: "Tables occupied", value: `${occupiedTables}/${tables.length}`, icon: Utensils, tint: "bg-sky-500/10 text-sky-600" },
    { label: "Kitchen queue", value: kitchenQueue.toString(), icon: ChefHat, tint: "bg-amber-500/10 text-amber-600" },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {today.getHours() < 12 ? "Good morning" : today.getHours() < 17 ? "Good afternoon" : "Good evening"}, {session?.name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <Clock className="h-3.5 w-3.5" />
            {today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            {shiftOpen && shiftMinutes > 0 && <span className="text-primary font-medium">· Shift: {shiftMinutes}m</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {shiftOpen ? (
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={closeShift}>
              <LogOut className="h-4 w-4 mr-1" /> Close Shift
            </Button>
          ) : (
            <Button variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" onClick={openShift}>
              <LogIn className="h-4 w-4 mr-1" /> Open Shift
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowResModal(true)}>
            <CalendarClock className="h-4 w-4 mr-1.5" /> Reserve / Waitlist
          </Button>
          <Button asChild><Link to="/pos"><Utensils className="mr-1.5 h-4 w-4"/>Open POS</Link></Button>
          <Button asChild variant="outline"><Link to="/takeaway"><ShoppingBag className="mr-1.5 h-4 w-4"/>Takeaway {takeawayQueue > 0 && <span className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">{takeawayQueue}</span>}</Link></Button>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4 lift">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</span>
              <span className={`kpi-icon ${s.tint}`}><s.icon className="h-4 w-4" /></span>
            </div>
            <div className="mt-3 text-2xl font-semibold tabular-nums">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/pos" className="group rounded-xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="kpi-icon h-10 w-10 bg-primary/10 text-primary"><Utensils className="h-5 w-5" /></span>
            <span className="text-xs text-muted-foreground">{occupiedTables} of {tables.length} tables occupied</span>
          </div>
          <div className="mt-4 text-lg font-semibold">Dine-In</div>
          <div className="text-sm text-muted-foreground">Seat guests, take orders, send to the kitchen and settle bills.</div>
          <div className="mt-3 text-sm font-medium text-primary group-hover:underline">Open dine-in POS →</div>
        </Link>
        <Link to="/takeaway" className="group rounded-xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="kpi-icon h-10 w-10 bg-emerald-500/10 text-emerald-600"><ShoppingBag className="h-5 w-5" /></span>
            <span className="text-xs text-muted-foreground">{takeawayQueue} open takeaway</span>
          </div>
          <div className="mt-4 text-lg font-semibold">Takeaway</div>
          <div className="text-sm text-muted-foreground">Take a pickup or delivery order with the customer's name and mobile number.</div>
          <div className="mt-3 text-sm font-medium text-emerald-700 group-hover:underline">Start takeaway →</div>
        </Link>
        <button type="button" onClick={() => setShowResModal(true)} className="group rounded-xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="kpi-icon h-10 w-10 bg-amber-500/10 text-amber-600"><CalendarClock className="h-5 w-5" /></span>
            <span className="text-xs text-muted-foreground">{reservations.filter((r) => r.type === "waitlist").length} waiting · {reservations.filter((r) => r.type === "advance").length} booked</span>
          </div>
          <div className="mt-4 text-lg font-semibold">Reserve or Waitlist</div>
          <div className="text-sm text-muted-foreground">Book a table for a later time, or add a walk-in to the queue.</div>
          <div className="mt-3 text-sm font-medium text-amber-700 group-hover:underline">Add a booking →</div>
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Open orders</h2>
            <Link to="/pos" className="text-xs text-primary hover:underline">Manage</Link>
          </div>
          {openOrders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="kpi-icon bg-primary/10 text-primary h-10 w-10"><Utensils className="h-5 w-5" /></span>
              <p className="font-medium">No open orders right now</p>
              <p className="text-sm text-muted-foreground">Start a dine-in order or a takeaway to see it here.</p>
              <Button asChild size="sm" className="mt-2"><Link to="/pos">Open POS</Link></Button>
            </div>
          ) : (
            <div className="divide-y">
              {openOrders.slice(0, 8).map((o) => {
                const t = getOrderTotals(o);
                const readyItems = o.items.filter((i) => i.status === "ready").length;
                return (
                  <div key={o.id} className="py-2 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">
                        {o.type === "dine-in" ? `Table ${tables.find((t) => t.id === o.tableId)?.name ?? "?"}` : `Takeaway · ${o.customerName ?? "Guest"}`}
                      </div>
                      <div className="text-xs text-muted-foreground">{o.items.length} items · {new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {readyItems > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-700 font-semibold">{readyItems} ready</span>
                      )}
                      <div className="font-semibold">{fmtMoney(t.total)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Low stock</h2>
            </div>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All items well stocked.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {lowStock.map((m) => (
                  <li key={m.id} className="flex items-center justify-between">
                    <span>{m.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.stock <= 3 ? "bg-red-500/20 text-red-700" : "bg-yellow-500/20 text-yellow-700"}`}>
                      {m.stock} left
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <ReservationModal 
        isOpen={showResModal} 
        onClose={() => setShowResModal(false)} 
        tables={tables} 
      />
    </div>
  );
}
