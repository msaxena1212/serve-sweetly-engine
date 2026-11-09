import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarClock, User, Phone, AlertCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createReservationFn } from "@/lib/api";
import { useRouter } from "@tanstack/react-router";

interface ReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tables: any[];
  defaultTableId?: string;
  onSuccess?: () => void | Promise<void>;
}

export function ReservationModal({ isOpen, onClose, tables, defaultTableId, onSuccess }: ReservationModalProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"waitlist" | "advance">("waitlist");
  
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pax, setPax] = useState("2");
  const [time, setTime] = useState("");
  const [tableId, setTableId] = useState(defaultTableId || "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Reset when opened
  if (isOpen && !name && errors.name) {
    setErrors({});
  }

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Guest name is required.";
    if (!phone.trim()) errs.phone = "Phone number is required.";
    else if (!/^\d{10}$/.test(phone.trim())) errs.phone = "Enter a valid 10-digit number.";
    
    if (tab === "advance") {
      if (!tableId) errs.table = "Select a table.";
      if (!time) errs.time = "Reservation time is required.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      await createReservationFn({
        data: {
          branchId: 'br-1',
          type: tab,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          pax: parseInt(pax) || 2,
          reservationTime: tab === "advance" ? time : undefined,
          tableId: tab === "advance" && tableId ? tableId : undefined,
          notes: note.trim()
        }
      });

      // Simulate SMS
      if (tab === "waitlist") {
        toast.success(`Message Sent: "Hello ${name}, you have been added to the waitlist. We will text you when a table is ready."`, { duration: 5000 });
      } else {
        const table = tables.find(t => t.id === tableId);
        toast.success(`Message Sent: "Hello ${name}, your table (${table?.name}) is confirmed for ${time}."`, { duration: 5000 });
      }

      await onSuccess?.();
      router.invalidate();
      onClose();

      // Reset form
      setName("");
      setPhone("");
      setPax("2");
      setTime("");
      setTableId("");
      setNote("");
    } catch (e) {
      toast.error("Failed to save reservation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md backdrop-blur-xl bg-background/90 border-amber-500/20 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-500">
            <CalendarClock className="h-5 w-5" />
            Reserve or Waitlist
          </DialogTitle>
          <DialogDescription>
            Add a customer to the waitlist queue or reserve a table for later.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v: any) => setTab(v)} className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-2 bg-muted/50">
            <TabsTrigger value="waitlist">Waitlist Queue</TabsTrigger>
            <TabsTrigger value="advance">Advance Reservation</TabsTrigger>
          </TabsList>

          <div className="space-y-4 py-4">
            {/* Common Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Guest Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="e.g. Priya"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setErrors(p => ({...p, name: ""})); }}
                    className={cn("pl-8", errors.name && "border-destructive")}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Mobile Number *</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="10-digit mobile"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setErrors(p => ({...p, phone: ""})); }}
                    className={cn("pl-8", errors.phone && "border-destructive")}
                    inputMode="numeric"
                    maxLength={10}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1 w-1/2 pr-1.5">
              <label className="text-xs font-medium text-muted-foreground">Guests (Pax) *</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="number" min={1} max={50}
                  value={pax}
                  onChange={(e) => setPax(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <TabsContent value="waitlist" className="mt-0">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-900/50 text-sm text-amber-800 dark:text-amber-400 mt-2">
                Waitlisted guests will be shown on the Dashboard Queue. They will receive an SMS notification confirming their spot.
              </div>
            </TabsContent>

            <TabsContent value="advance" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Time *</label>
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => { setTime(e.target.value); setErrors(p => ({...p, time: ""})); }}
                    className={cn(errors.time && "border-destructive")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Table *</label>
                  <Select value={tableId} onValueChange={(val) => { setTableId(val); setErrors((p) => ({ ...p, table: "" })); }}>
                    <SelectTrigger className={cn("w-full", errors.table && "border-destructive ring-1 ring-destructive")}>
                      <SelectValue placeholder="— Select table —" />
                    </SelectTrigger>
                    <SelectContent>
                      {tables.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.name} ({t.section})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* Note Field (Common) */}
            <div className="space-y-1 pt-2">
              <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
              <Textarea
                placeholder="e.g. Window seat, Anniversary, Needs high chair..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="text-sm resize-none h-16"
              />
            </div>
          </div>
        </Tabs>

        <DialogFooter className="gap-2 pt-2 border-t">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-amber-500 hover:bg-amber-600 text-white">
            <CalendarClock className="h-4 w-4 mr-1.5" />
            {tab === "waitlist" ? "Add to Waitlist" : "Confirm Reservation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
