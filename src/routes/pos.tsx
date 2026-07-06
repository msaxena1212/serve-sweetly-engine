import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { usePos } from "@/lib/pos-store";
import { OrderPanel } from "@/components/order-panel";
import { MenuPicker } from "@/components/menu-picker";
import { cn } from "@/lib/utils";
import { useConfig } from "@/lib/config-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getShiftStatusFn } from "@/lib/api";
import { RecentBillsModal } from "@/components/recent-bills";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { CalendarClock, User, Phone, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pos")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' });
    }
  },
  loader: async () => {
    const shiftData = await getShiftStatusFn();
    return { shiftData };
  },
  head: () => ({
    meta: [
      { title: "Dine-In POS — Forno" },
      { name: "description", content: "Manage table orders, send KOTs and take payment." },
    ],
  }),
  component: PosPage,
});

// ─── Types ───────────────────────────────────────────────────
interface Reservation {
  tableId: string;
  tableName: string;
  guestName: string;
  phone: string;
  pax: number;
  time: string; // "HH:MM"
  note: string;
  reservedAt: number; // timestamp
}

// ─── Reservation storage (sessionStorage) ────────────────────
const RES_KEY = "pos-reservations-v1";

function loadReservations(): Reservation[] {
  try {
    return JSON.parse(sessionStorage.getItem(RES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveReservations(list: Reservation[]) {
  sessionStorage.setItem(RES_KEY, JSON.stringify(list));
}

// ─── Main component ──────────────────────────────────────────
function PosPage() {
  const { shiftData } = Route.useLoaderData();
  const { tables, orders, openOrderForTable, dispatch } = usePos();
  const { config } = useConfig();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showRecentBills, setShowRecentBills] = useState(false);

  // Reservations state
  const [reservations, setReservations] = useState<Reservation[]>(loadReservations);
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [reserveTableId, setReserveTableId] = useState<string>("");
  const [resName, setResName] = useState("");
  const [resPhone, setResPhone] = useState("");
  const [resPax, setResPax] = useState("2");
  const [resTime, setResTime] = useState("");
  const [resNote, setResNote] = useState("");
  const [resErrors, setResErrors] = useState<Record<string, string>>({});

  const sections = config.tableSections
    .filter((s) => s.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.name);

  const orderForTable = (tid: string) =>
    orders.find((o) => o.tableId === tid && o.status === "open");

  const reservationForTable = (tid: string) =>
    reservations.find((r) => r.tableId === tid);

  const activeOrder = selectedTable ? orderForTable(selectedTable) : null;
  const showGrid = !selectedTable || !activeOrder;

  // ── Transfer / Merge ───────────────────────────
  const handleTransfer = async (order: any) => {
    const targetName = prompt("Enter target table name (e.g., T2, P1):");
    if (!targetName) return;
    const targetTable = tables.find(
      (t) => t.name.toLowerCase() === targetName.toLowerCase()
    );
    if (!targetTable) { toast.error("Table not found"); return; }

    const existingOrder = orders.find(
      (o) => o.tableId === targetTable.id && o.status === "open"
    );
    if (existingOrder) {
      toast.error("Target table is occupied. Use Merge instead.");
      return;
    }

    dispatch({ type: "TRANSFER_TABLE", orderId: order.id, newTableId: targetTable.id });
    setSelectedTable(targetTable.id);

    try {
      const { transferTableFn } = await import("@/lib/api");
      await transferTableFn({ data: { orderId: order.id, newTableId: targetTable.id } });
    } catch (e) {
      console.error("Failed to sync transfer", e);
    }
  };

  const handleMerge = async (order: any) => {
    const targetName = prompt("Enter target table name to merge into (e.g., T2):");
    if (!targetName) return;
    const targetTable = tables.find(
      (t) => t.name.toLowerCase() === targetName.toLowerCase()
    );
    if (!targetTable) { toast.error("Table not found"); return; }

    const targetOrder = orders.find(
      (o) => o.tableId === targetTable.id && o.status === "open"
    );
    if (!targetOrder) { toast.error("Target table has no open order."); return; }
    if (targetOrder.id === order.id) { toast.error("Cannot merge into itself."); return; }

    dispatch({ type: "MERGE_TABLES", sourceOrderId: order.id, targetOrderId: targetOrder.id });
    setSelectedTable(targetTable.id);

    try {
      const { mergeTablesFn } = await import("@/lib/api");
      await mergeTablesFn({ data: { sourceOrderId: order.id, targetOrderId: targetOrder.id } });
    } catch (e) {
      console.error("Failed to sync merge", e);
    }
  };

  // ── Reservation handlers ───────────────────────
  const openReserveModal = (tableId?: string) => {
    setReserveTableId(tableId || (tables[0]?.id ?? ""));
    setResName("");
    setResPhone("");
    setResPax("2");
    setResTime("");
    setResNote("");
    setResErrors({});
    setShowReserveModal(true);
  };

  const handleReserveSave = () => {
    const errors: Record<string, string> = {};
    if (!resName.trim()) errors.name = "Guest name is required.";
    if (!resPhone.trim()) errors.phone = "Phone number is required.";
    else if (!/^\d{10}$/.test(resPhone.trim())) errors.phone = "Enter a valid 10-digit number.";
    if (!reserveTableId) errors.table = "Select a table.";
    if (!resTime) errors.time = "Reservation time is required.";

    if (Object.keys(errors).length > 0) {
      setResErrors(errors);
      return;
    }

    const table = tables.find((t) => t.id === reserveTableId);
    const newRes: Reservation = {
      tableId: reserveTableId,
      tableName: table?.name ?? reserveTableId,
      guestName: resName.trim(),
      phone: resPhone.trim(),
      pax: parseInt(resPax) || 2,
      time: resTime,
      note: resNote.trim(),
      reservedAt: Date.now(),
    };

    const updated = [...reservations.filter((r) => r.tableId !== reserveTableId), newRes];
    setReservations(updated);
    saveReservations(updated);
    setShowReserveModal(false);
    toast.success(`Table ${table?.name} reserved for ${resName.trim()} at ${resTime}.`);
  };

  const cancelReservation = (tableId: string) => {
    const updated = reservations.filter((r) => r.tableId !== tableId);
    setReservations(updated);
    saveReservations(updated);
    toast.success("Reservation cancelled.");
  };

  // ── Render ─────────────────────────────────────
  
  if (!shiftData.isActive) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-muted/30">
        <div className="bg-card border-2 shadow-sm rounded-xl p-8 max-w-sm text-center space-y-4">
          <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-xl font-bold">Shift Closed</h2>
          <p className="text-sm text-muted-foreground">
            You cannot open the POS because there is no active cashier shift.
          </p>
          <Button className="w-full" onClick={() => window.location.href = '/shift'}>
            Open Shift
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="px-6 py-4 border-b bg-card flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dine-In POS</h1>
          <p className="text-xs text-muted-foreground">Tap a table to open or resume its order.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowRecentBills(true)}>
            Recent Bills
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => openReserveModal()}>
            <CalendarClock className="h-4 w-4" />
            Reserve Table
          </Button>
        </div>
      </header>

      <RecentBillsModal isOpen={showRecentBills} onClose={() => setShowRecentBills(false)} />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px]">
        <div className="overflow-y-auto p-6 space-y-6">
          {showGrid &&
            sections.map((s) => (
              <section key={s}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {s}
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {tables
                    .filter((t) => t.section === s)
                    .map((t) => {
                      const o = orderForTable(t.id);
                      const res = reservationForTable(t.id);
                      const isReserved = !!res && !o;
                      return (
                        <div key={t.id} className="relative group">
                          <button
                            onClick={() => {
                              openOrderForTable(t.id);
                              setSelectedTable(t.id);
                            }}
                            className={cn(
                              "w-full aspect-square rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition",
                              o
                                ? "bg-primary/10 border-primary text-foreground"
                                : isReserved
                                ? "bg-amber-50 border-amber-400 text-amber-900 dark:bg-amber-900/20 dark:text-amber-300"
                                : "bg-card border-border hover:border-primary/40"
                            )}
                          >
                            <span className="text-lg font-semibold">{t.name}</span>
                            <span className="text-[10px] text-muted-foreground">{t.seats} seats</span>
                            {o && (
                              <span className="text-[10px] text-primary font-medium">
                                {o.items.length} items
                              </span>
                            )}
                            {isReserved && (
                              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                Reserved
                              </span>
                            )}
                          </button>

                          {/* Reservation badge actions */}
                          {isReserved && (
                            <div className="absolute -top-1.5 -right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                title={`${res.guestName} · ${res.phone} · ${res.pax}pax · ${res.time}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openReserveModal(t.id);
                                }}
                                className="h-5 w-5 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center shadow hover:bg-amber-600"
                              >
                                ✏
                              </button>
                              <button
                                title="Cancel reservation"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cancelReservation(t.id);
                                }}
                                className="h-5 w-5 rounded-full bg-destructive text-white text-[9px] flex items-center justify-center shadow hover:bg-destructive/80"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </section>
            ))}

          {selectedTable && activeOrder && (
            <div className="h-full flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <button
                  onClick={() => setSelectedTable(null)}
                  className="text-sm text-primary hover:underline self-start"
                >
                  ← All tables
                </button>
                <div className="flex gap-2">
                  <button
                    className="text-xs px-3 py-1.5 border rounded-md hover:bg-muted transition-colors font-medium"
                    onClick={() => handleTransfer(activeOrder)}
                  >
                    Transfer Table
                  </button>
                  <button
                    className="text-xs px-3 py-1.5 border rounded-md hover:bg-muted transition-colors font-medium"
                    onClick={() => handleMerge(activeOrder)}
                  >
                    Merge Tables
                  </button>
                  <button
                    className="text-xs px-3 py-1.5 border border-amber-400 text-amber-700 rounded-md hover:bg-amber-50 transition-colors font-medium"
                    onClick={() => openReserveModal(selectedTable)}
                  >
                    Reserve
                  </button>
                </div>
              </div>
              <MenuPicker orderId={activeOrder.id} />
            </div>
          )}
        </div>

        <aside className="border-l bg-muted/30 p-4 overflow-hidden">
          {activeOrder ? (
            <OrderPanel order={activeOrder} />
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted-foreground text-center px-6">
              {/* Upcoming reservations list */}
              {reservations.length > 0 ? (
                <div className="w-full space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    Reservations Today
                  </p>
                  {reservations
                    .slice()
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map((r) => (
                      <div
                        key={r.tableId}
                        className="bg-card border border-amber-300 rounded-lg p-3 text-left space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                            {r.tableName} · {r.time}
                          </span>
                          <button
                            onClick={() => cancelReservation(r.tableId)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-foreground font-medium">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {r.guestName} · {r.pax} pax
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {r.phone}
                        </div>
                        {r.note && (
                          <p className="text-[10px] text-muted-foreground italic">{r.note}</p>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <span>Select a table to start or resume an order.</span>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* ── Reservation Modal ── */}
      <Dialog open={showReserveModal} onOpenChange={setShowReserveModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-500" />
              Reserve a Table
            </DialogTitle>
            <DialogDescription>
              Enter guest details and preferred time. Reserved tables show an amber border on the floor map.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Table Select */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Table *</label>
              <select
                value={reserveTableId}
                onChange={(e) => setReserveTableId(e.target.value)}
                className={cn(
                  "w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
                  resErrors.table && "border-destructive"
                )}
              >
                <option value="">— Select table —</option>
                {tables.map((t) => {
                  const hasOrder = !!orderForTable(t.id);
                  const hasRes = !!reservationForTable(t.id);
                  return (
                    <option key={t.id} value={t.id} disabled={hasOrder}>
                      {t.name} ({t.section}){hasOrder ? " — Occupied" : hasRes ? " — Reserved" : ""}
                    </option>
                  );
                })}
              </select>
              {resErrors.table && (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {resErrors.table}
                </p>
              )}
            </div>

            {/* Guest Name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Guest Name *</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="e.g. Priya Sharma"
                  value={resName}
                  onChange={(e) => { setResName(e.target.value); setResErrors((p) => ({ ...p, name: "" })); }}
                  className={cn("pl-8", resErrors.name && "border-destructive")}
                />
              </div>
              {resErrors.name && (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {resErrors.name}
                </p>
              )}
            </div>

            {/* Phone */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mobile Number *</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="10-digit mobile"
                  value={resPhone}
                  onChange={(e) => {
                    setResPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                    setResErrors((p) => ({ ...p, phone: "" }));
                  }}
                  className={cn("pl-8", resErrors.phone && "border-destructive")}
                  inputMode="numeric"
                  maxLength={10}
                />
              </div>
              {resErrors.phone && (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {resErrors.phone}
                </p>
              )}
            </div>

            {/* Pax + Time row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Guests (Pax)</label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={resPax}
                  onChange={(e) => setResPax(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Time *</label>
                <Input
                  type="time"
                  value={resTime}
                  onChange={(e) => { setResTime(e.target.value); setResErrors((p) => ({ ...p, time: "" })); }}
                  className={cn("text-sm", resErrors.time && "border-destructive")}
                />
                {resErrors.time && (
                  <p className="text-[11px] text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {resErrors.time}
                  </p>
                )}
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
              <Input
                placeholder="e.g. Window seat, Anniversary"
                value={resNote}
                onChange={(e) => setResNote(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowReserveModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleReserveSave} className="bg-amber-500 hover:bg-amber-600 text-white">
              <CalendarClock className="h-4 w-4 mr-1.5" />
              Confirm Reservation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
