import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useState, useEffect } from "react";
import { usePos } from "@/lib/pos-store";
import { OrderPanel } from "@/components/order-panel";
import { MenuPicker } from "@/components/menu-picker";
import { cn } from "@/lib/utils";
import { useConfig } from "@/lib/config-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getShiftStatusFn, getReservationsFn, updateReservationStatusFn } from "@/lib/api";
import { RecentBillsModal } from "@/components/recent-bills";
import { ReservationModal } from "@/components/reservation-modal";
import { useRouter } from "@tanstack/react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { CalendarClock, User, Phone, AlertCircle, X, ArrowRightLeft, Merge } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pos")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' });
    }
  },
  loader: async () => {
    // Run both DB calls in parallel to halve loader wait time
    const [shiftData, reservations] = await Promise.all([
      getShiftStatusFn({ data: { branchId: 'br-1' } }),
      getReservationsFn({ data: { branchId: 'br-1' } }),
    ]);
    return { shiftData, reservations };
  },
  head: () => ({
    meta: [
      { title: "Dine-In POS — Forno" },
      { name: "description", content: "Manage table orders, send KOTs and take payment." },
    ],
  }),
  component: PosPage,
});

// ─── Main component ──────────────────────────────────────────
function PosPage() {
  const router = useRouter();
  const loaderData = Route.useLoaderData();
  const { shiftData } = loaderData;
  const [reservations, setReservations] = useState(loaderData.reservations);
  const { tables, orders, openOrderForTable, dispatch } = usePos();
  const { config } = useConfig();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showRecentBills, setShowRecentBills] = useState(false);

  const refreshReservations = useCallback(async () => {
    const res = await getReservationsFn({ data: { branchId: 'br-1', _t: Date.now() } });
    setReservations(res);
  }, []);

  useEffect(() => {
    setReservations(loaderData.reservations);
  }, [loaderData.reservations]);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        await refreshReservations();
      } catch (e) { }
    }, 5000);
    return () => clearInterval(id);
  }, [refreshReservations]);

  // Modals state
  const [modalOrderId, setModalOrderId] = useState<string | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string>("");

  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");

  const [showReserveModal, setShowReserveModal] = useState(false);
  const [reserveTableId, setReserveTableId] = useState<string>("");

  const [showSeatModal, setShowSeatModal] = useState(false);
  const [seatReservationId, setSeatReservationId] = useState<number | null>(null);
  const [seatTableId, setSeatTableId] = useState<string>("");

  const sections = config.tableSections
    .filter((s) => s.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.name);

  const orderForTable = (tid: string) =>
    orders.find((o) => o.tableId === tid && o.status === "open");

  const reservationForTable = (tid: string) =>
    reservations.find((r) => r.tableId?.toString() === tid && r.type === 'advance');

  const activeOrder = selectedTable ? orderForTable(selectedTable) : null;
  const showGrid = !selectedTable || !activeOrder;

  // ── Transfer / Merge ───────────────────────────
  const openTransferModal = (order: any) => {
    setModalOrderId(order.id);
    setTransferTargetId("");
    setShowTransferModal(true);
  };

  const executeTransfer = async () => {
    if (!modalOrderId || !transferTargetId) return;
    const targetTable = tables.find((t) => t.id === transferTargetId);
    if (!targetTable) return;

    dispatch({ type: "TRANSFER_TABLE", orderId: modalOrderId, newTableId: targetTable.id });
    setSelectedTable(targetTable.id);
    setShowTransferModal(false);

    try {
      const { transferTableFn } = await import("@/lib/api");
      await transferTableFn({ data: { orderId: modalOrderId, newTableId: targetTable.id } });
    } catch (e) {
      console.error("Failed to sync transfer", e);
    }
  };

  const openMergeModal = (order: any) => {
    setModalOrderId(order.id);
    setMergeTargetId("");
    setShowMergeModal(true);
  };

  const executeMerge = async () => {
    if (!modalOrderId || !mergeTargetId) return;
    const targetTable = tables.find((t) => t.id === mergeTargetId);
    if (!targetTable) return;
    const targetOrder = orders.find((o) => o.tableId === targetTable.id && o.status === "open");

    if (!targetOrder) {
      // If target table is vacant, it acts as a transfer.
      dispatch({ type: "TRANSFER_TABLE", orderId: modalOrderId, newTableId: targetTable.id });
      setSelectedTable(targetTable.id);
      setShowMergeModal(false);
      try {
        const { updateOrderFn } = await import("@/lib/api");
        await updateOrderFn({ data: { orderId: modalOrderId, tableId: targetTable.id } });
      } catch (e) {
        console.error("Failed to sync merge (transfer)", e);
      }
      return;
    }

    dispatch({ type: "MERGE_TABLES", sourceOrderId: modalOrderId, targetOrderId: targetOrder.id });
    setSelectedTable(targetTable.id);
    setShowMergeModal(false);

    try {
      const { mergeTablesFn } = await import("@/lib/api");
      await mergeTablesFn({ data: { sourceOrderId: modalOrderId, targetOrderId: targetOrder.id } });
    } catch (e) {
      console.error("Failed to sync merge", e);
    }
  };

  // ── Reservation handlers ───────────────────────
  const openReserveModal = (tableId?: string) => {
    setReserveTableId(tableId || "");
    setShowReserveModal(true);
  };

  const cancelReservation = async (id: number) => {
    try {
      await updateReservationStatusFn({ data: { id, status: 'cancelled' } });
      setReservations((current) => current.filter((r) => r.id !== id));
      toast.success("Reservation cancelled.");
      router.invalidate();
    } catch {
      toast.error("Failed to cancel reservation");
    }
  };

  const executeSeat = async () => {
    if (!seatReservationId || !seatTableId) return;
    try {
      await updateReservationStatusFn({ data: { id: seatReservationId, status: 'seated', tableId: seatTableId } });
      await openOrderForTable(seatTableId);
      setReservations((current) => current.filter((r) => r.id !== seatReservationId));
      setSelectedTable(seatTableId);
      toast.success("Guest seated successfully.");
      setShowSeatModal(false);
      router.invalidate();
    } catch {
      toast.error("Failed to seat guest");
    }
  };

  const openSeatModal = (id: number) => {
    setSeatReservationId(id);
    setSeatTableId("");
    setShowSeatModal(true);
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
                            onClick={async () => {
                              await openOrderForTable(t.id);
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
                                title={`${res.customerName} · ${res.customerPhone} · ${res.pax}pax · ${res.reservationTime}`}
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
                                  cancelReservation(res.id);
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
                    className="text-xs px-3 py-1.5 border rounded-md hover:bg-muted transition-colors font-medium flex items-center gap-1.5"
                    onClick={() => openTransferModal(activeOrder)}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer
                  </button>
                  <button
                    className="text-xs px-3 py-1.5 border rounded-md hover:bg-muted transition-colors font-medium flex items-center gap-1.5"
                    onClick={() => openMergeModal(activeOrder)}
                  >
                    <Merge className="h-3.5 w-3.5" /> Merge
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
                <div className="w-full space-y-4">
                  {reservations.filter(r => r.type === 'waitlist').length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                        Waitlist Queue
                      </p>
                      <div className="space-y-2">
                        {reservations.filter(r => r.type === 'waitlist').map(r => (
                          <div key={r.id} className="bg-card border border-primary/40 rounded-lg p-3 text-left space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-primary">
                                Waitlist
                              </span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => openSeatModal(r.id)}
                                  className="text-xs font-semibold text-green-600 hover:text-green-700 transition-colors"
                                >
                                  Seat
                                </button>
                                <button
                                  onClick={() => cancelReservation(r.id)}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-foreground font-medium">
                              <User className="h-3 w-3 text-muted-foreground" />
                              {r.customerName} · {r.pax} pax
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {r.customerPhone}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {reservations.filter(r => r.type === 'advance').length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                        Advance Reservations
                      </p>
                      <div className="space-y-2">
                        {reservations
                          .filter(r => r.type === 'advance')
                          .slice()
                          .sort((a, b) => (a.reservationTime || "").localeCompare(b.reservationTime || ""))
                          .map((r) => (
                            <div
                              key={r.id}
                              className="bg-card border border-amber-300 rounded-lg p-3 text-left space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                                  {tables.find(t => t.id === r.tableId?.toString())?.name} · {r.reservationTime}
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => cancelReservation(r.id)}
                                    className="text-muted-foreground hover:text-destructive transition-colors"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-foreground font-medium">
                                <User className="h-3 w-3 text-muted-foreground" />
                                {r.customerName} · {r.pax} pax
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {r.customerPhone}
                              </div>
                              {r.notes && (
                                <p className="text-[10px] text-muted-foreground italic">{r.notes}</p>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <span>Select a table to start or resume an order.</span>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* ── Transfer Modal ── */}
      <Dialog open={showTransferModal} onOpenChange={setShowTransferModal}>
        <DialogContent className="sm:max-w-sm backdrop-blur-xl bg-background/90 border-indigo-500/20 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-500">
              <ArrowRightLeft className="h-5 w-5" />
              Transfer Table
            </DialogTitle>
            <DialogDescription>
              Move the current order to an empty table.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Select Destination Table</label>
              <Select value={transferTargetId} onValueChange={setTransferTargetId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a table..." />
                </SelectTrigger>
                <SelectContent>
                  {tables.filter(t => t.id !== selectedTable && !orderForTable(t.id)).length === 0 ? (
                    <SelectItem value="none" disabled>No empty tables available</SelectItem>
                  ) : (
                    tables.map(t => {
                      const isOccupied = !!orderForTable(t.id);
                      if (t.id === selectedTable || isOccupied) return null;
                      return <SelectItem key={t.id} value={t.id}>{t.name} ({t.section})</SelectItem>;
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowTransferModal(false)}>Cancel</Button>
            <Button onClick={executeTransfer} disabled={!transferTargetId || transferTargetId === 'none'} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              Confirm Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Merge Modal ── */}
      <Dialog open={showMergeModal} onOpenChange={setShowMergeModal}>
        <DialogContent className="sm:max-w-sm backdrop-blur-xl bg-background/90 border-fuchsia-500/20 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-fuchsia-500">
              <Merge className="h-5 w-5" />
              Merge Tables
            </DialogTitle>
            <DialogDescription>
              Combine the current order into another occupied table.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Select Target Table</label>
              <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose target table..." />
                </SelectTrigger>
                <SelectContent>
                  {tables.filter(t => t.id !== selectedTable).length === 0 ? (
                    <SelectItem value="none" disabled>No other tables available</SelectItem>
                  ) : (
                    tables.filter(t => t.id !== selectedTable).map(t => {
                      const tgtOrder = orderForTable(t.id);
                      return (
                        <SelectItem key={t.id} value={t.id}>
                          <div className="flex justify-between items-center w-[250px]">
                            <span>{t.name} ({t.section})</span>
                            <span className="text-xs text-muted-foreground">
                              {tgtOrder ? `${tgtOrder.items.length} items` : `${t.seats} vacant seats`}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowMergeModal(false)}>Cancel</Button>
            <Button onClick={executeMerge} disabled={!mergeTargetId || mergeTargetId === 'none'} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white">
              Confirm Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Seat Guest Modal ── */}
      <Dialog open={showSeatModal} onOpenChange={setShowSeatModal}>
        <DialogContent className="sm:max-w-sm backdrop-blur-xl bg-background/90 border-green-500/20 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-500">
              <User className="h-5 w-5" />
              Seat Guest
            </DialogTitle>
            <DialogDescription>
              Select an empty table to seat this waitlist guest.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Select Empty Table</label>
              <Select value={seatTableId} onValueChange={setSeatTableId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a table..." />
                </SelectTrigger>
                <SelectContent>
                  {tables.filter(t => !orderForTable(t.id)).length === 0 ? (
                    <SelectItem value="none" disabled>No empty tables available</SelectItem>
                  ) : (
                    tables.map(t => {
                      if (orderForTable(t.id)) return null;
                      return <SelectItem key={t.id} value={t.id}>{t.name} ({t.section})</SelectItem>;
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSeatModal(false)}>Cancel</Button>
            <Button onClick={executeSeat} disabled={!seatTableId || seatTableId === 'none'} className="bg-green-600 hover:bg-green-700 text-white">
              Confirm Seating
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReservationModal
        isOpen={showReserveModal}
        onClose={() => setShowReserveModal(false)}
        tables={tables}
        defaultTableId={reserveTableId}
        onSuccess={refreshReservations}
      />
    </div>
  );
}
