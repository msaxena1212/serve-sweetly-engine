import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import {
  useConfig, newConfigId, useSyncToDb,
  type MenuCategory, type KitchenStation, type TableSection,
  type PaymentMethod, type StaffRole, type TaxSlab, type DiscountType,
  type Printer, type OnlineOrderChannel, type Branch,
} from "@/lib/config-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Settings2, Tag, ChefHat, LayoutGrid, CreditCard,
  Users, Percent, BadgePercent, Building2, MonitorSmartphone,
  ShoppingBag, Clock, Plus, Trash2, Pencil, Check, X,
  GripVertical, AlertCircle, RefreshCcw, Printer as PrinterIcon,
  Globe, Gift, Phone, Mail, MapPin, Link, AlarmClock, Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/masters")({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "Masters — Forno" },
      { name: "description", content: "Configuration masters for all data points." },
    ],
  }),
  component: MastersPage,
});

// ─── Tab Registry ──────────────────────────────────────────────
const TABS = [
  { id: "restaurant",   label: "Restaurant",        icon: Building2 },
  { id: "branches",     label: "Branches",          icon: MapPin },
  { id: "categories",   label: "Categories",         icon: Tag },
  { id: "stations",     label: "Kitchen Stations",   icon: ChefHat },
  { id: "sections",     label: "Table Sections",     icon: LayoutGrid },
  { id: "payments",     label: "Payment Methods",    icon: CreditCard },
  { id: "roles",        label: "Staff Roles",        icon: Users },
  { id: "tax",          label: "Tax Slabs",           icon: Percent },
  { id: "discounts",    label: "Discount Types",     icon: BadgePercent },
  { id: "printers",     label: "Printers",           icon: PrinterIcon },
  { id: "online",       label: "Online Channels",    icon: Globe },
  { id: "loyalty",      label: "Loyalty Program",    icon: Gift },
  { id: "kds",          label: "KDS Config",          icon: MonitorSmartphone },
  { id: "billing",      label: "Billing",             icon: ShoppingBag },
  { id: "takeaway",     label: "Takeaway",            icon: ShoppingBag },
  { id: "shift",        label: "Shift",               icon: Clock },
] as const;
type TabId = (typeof TABS)[number]["id"];

const CATEGORY_COLORS = [
  "#ef4444","#f97316","#eab308","#84cc16","#22c55e",
  "#14b8a6","#3b82f6","#8b5cf6","#ec4899","#6b7280",
];

function MastersPage() {
  const [tab, setTab] = useState<TabId>("restaurant");
  const [saving, setSaving] = useState(false);
  const syncToDb = useSyncToDb();

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await syncToDb();
      toast.success("All configuration saved to database!");
    } catch {
      toast.error("Failed to save to database.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="px-6 py-4 border-b bg-card flex items-center gap-3">
        <Settings2 className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Configuration Masters</h1>
          <p className="text-xs text-muted-foreground">All data points are configurable — changes apply immediately across the app.</p>
        </div>
        <Button onClick={handleSaveAll} disabled={saving} size="sm" className="gap-2">
          {saving ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? "Saving…" : "Save to Database"}
        </Button>
      </header>


      <div className="flex flex-1 min-h-0">
        {/* Vertical Tab Nav */}
        <aside className="w-52 border-r bg-muted/20 py-3 px-2 space-y-0.5 shrink-0 overflow-y-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
                  tab === t.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t.label}
              </button>
            );
          })}
          <div className="pt-4 px-3">
            <ResetButton />
          </div>
        </aside>

        {/* Content Panel */}
        <main className="flex-1 overflow-y-auto p-6">
          {tab === "restaurant"   && <RestaurantTab />}
          {tab === "branches"     && <BranchesTab />}
          {tab === "categories"   && <CategoriesTab />}
          {tab === "stations"     && <StationsTab />}
          {tab === "sections"     && <SectionsTab />}
          {tab === "payments"     && <PaymentsTab />}
          {tab === "roles"        && <RolesTab />}
          {tab === "tax"          && <TaxTab />}
          {tab === "discounts"    && <DiscountsTab />}
          {tab === "printers"     && <PrintersTab />}
          {tab === "online"       && <OnlineChannelsTab />}
          {tab === "loyalty"      && <LoyaltyTab />}
          {tab === "kds"          && <KDSTab />}
          {tab === "billing"      && <BillingTab />}
          {tab === "takeaway"     && <TakeawayTab />}
          {tab === "shift"        && <ShiftTab />}
        </main>
      </div>
    </div>
  );
}

// ─── Restaurant Info ───────────────────────────────────────────
function RestaurantTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState(config.restaurant);
  const save = () => { dispatch({ type: "SET_RESTAURANT", data: draft }); toast.success("Restaurant info saved"); };

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "None"];

  return (
    <TabShell title="Restaurant Information" subtitle="Business details printed on receipts and used throughout the app.">
      {/* Identity */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Identity &amp; Contact</h3>
        <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
          <Field label="Restaurant Name" value={draft.name} onChange={v => setDraft(p => ({ ...p, name: v }))} />
          <Field label="Branch / Location" value={draft.branch} onChange={v => setDraft(p => ({ ...p, branch: v }))} />
          <Field label="Phone" value={draft.phone} onChange={v => setDraft(p => ({ ...p, phone: v }))} />
          <Field label="WhatsApp Number" value={draft.whatsapp ?? ""} onChange={v => setDraft(p => ({ ...p, whatsapp: v }))} />
          <Field label="Email" value={draft.email} onChange={v => setDraft(p => ({ ...p, email: v }))} />
          <Field label="Website" value={draft.website ?? ""} onChange={v => setDraft(p => ({ ...p, website: v }))} />
          <Field label="GST Number" value={draft.gstNo} onChange={v => setDraft(p => ({ ...p, gstNo: v }))} />
          <Field label="FSSAI License" value={draft.fssaiNo} onChange={v => setDraft(p => ({ ...p, fssaiNo: v }))} />
          <Field label="Currency Symbol" value={draft.currency} onChange={v => setDraft(p => ({ ...p, currency: v }))} className="w-28" />
          <Field label="Currency Code" value={draft.currencyCode} onChange={v => setDraft(p => ({ ...p, currencyCode: v }))} className="w-28" />
          <div className="md:col-span-2">
            <Field label="Address" value={draft.address} onChange={v => setDraft(p => ({ ...p, address: v }))} />
          </div>
          <div className="md:col-span-2">
            <Field label="Logo URL" value={draft.logoUrl ?? ""} onChange={v => setDraft(p => ({ ...p, logoUrl: v }))} />
          </div>
        </div>
      </Card>

      {/* Business Hours */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><AlarmClock className="h-4 w-4 text-primary" /> Business Hours</h3>
        <div className="grid md:grid-cols-3 gap-4 max-w-xl">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Opening Time</label>
            <input type="time" value={draft.openTime ?? "09:00"} onChange={e => setDraft(p => ({ ...p, openTime: e.target.value }))}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Closing Time</label>
            <input type="time" value={draft.closeTime ?? "23:00"} onChange={e => setDraft(p => ({ ...p, closeTime: e.target.value }))}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Weekly Off</label>
            <Select value={draft.weeklyOff ?? "Sunday"} onValueChange={v => setDraft(p => ({ ...p, weeklyOff: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Receipt Footer */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-4">Receipt Footer Message</h3>
        <textarea
          className="w-full max-w-lg rounded-md border bg-background px-3 py-2 text-sm resize-none min-h-[80px]"
          placeholder="Printed at the bottom of every bill..."
          value={draft.receiptFooter ?? ""}
          onChange={e => setDraft(p => ({ ...p, receiptFooter: e.target.value }))}
        />
      </Card>

      <Button onClick={save}><Check className="h-4 w-4 mr-2" /> Save Restaurant Info</Button>
    </TabShell>
  );
}

// ─── Branches ────────────────────────────────────────────────
function BranchesTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState<Omit<Branch, "id">>({ name: "", code: "", address: "", phone: "", email: "", gstNo: "", active: true, isMain: false });
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Branch>>({});

  const add = () => {
    if (!draft.name.trim() || !draft.code.trim()) { toast.error("Name and Code required"); return; }
    dispatch({ type: "ADD_BRANCH", item: { id: newConfigId("br"), ...draft } });
    setDraft({ name: "", code: "", address: "", phone: "", email: "", gstNo: "", active: true, isMain: false });
    toast.success("Branch added");
  };

  return (
    <TabShell title="Branches" subtitle="Manage multi-branch locations. The active branch is used for receipts and current session context.">
      <Card className="p-4 mb-4">
        <h3 className="text-sm font-semibold mb-3">Add Branch</h3>
        <div className="grid md:grid-cols-4 gap-3 items-end">
          <div><label className="text-xs text-muted-foreground mb-1 block">Name</label><Input placeholder="e.g. South End" value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))} /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Code</label><Input placeholder="e.g. SE01" value={draft.code} onChange={e=>setDraft(p=>({...p,code:e.target.value}))} /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Phone</label><Input value={draft.phone} onChange={e=>setDraft(p=>({...p,phone:e.target.value}))} /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Email</label><Input value={draft.email} onChange={e=>setDraft(p=>({...p,email:e.target.value}))} /></div>
          <div className="md:col-span-2"><label className="text-xs text-muted-foreground mb-1 block">Address</label><Input value={draft.address} onChange={e=>setDraft(p=>({...p,address:e.target.value}))} /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">GST No</label><Input value={draft.gstNo} onChange={e=>setDraft(p=>({...p,gstNo:e.target.value}))} /></div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
      </Card>

      <div className="space-y-3">
        {(config.branches || []).map(b => {
          const isActiveSessionBranch = config.activeBranchId === b.id;
          return (
            <Card key={b.id} className={cn("p-4", !b.active && "opacity-60", isActiveSessionBranch && "border-primary ring-1 ring-primary/20 bg-primary/5")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-semibold text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    {editId === b.id ? <Input value={editDraft.name ?? b.name} onChange={e=>setEditDraft(d=>({...d,name:e.target.value}))} className="h-7 w-48 inline-block" /> : b.name}
                    {!isActiveSessionBranch && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px] ml-2" onClick={()=>{dispatch({type:"SET_ACTIVE_BRANCH",id:b.id});toast.success(`Switched to ${b.name}`);}}>
                        Set as Active Context
                      </Button>
                    )}
                    {isActiveSessionBranch && <span className="text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Active</span>}
                  </div>
                  
                  {editId === b.id ? (
                    <div className="mt-3 grid md:grid-cols-3 gap-2">
                      <div><label className="text-[11px] text-muted-foreground block mb-0.5">Code</label><Input value={editDraft.code ?? b.code} onChange={e=>setEditDraft(d=>({...d,code:e.target.value}))} className="h-7 text-xs" /></div>
                      <div><label className="text-[11px] text-muted-foreground block mb-0.5">Phone</label><Input value={editDraft.phone ?? b.phone} onChange={e=>setEditDraft(d=>({...d,phone:e.target.value}))} className="h-7 text-xs" /></div>
                      <div><label className="text-[11px] text-muted-foreground block mb-0.5">Email</label><Input value={editDraft.email ?? b.email} onChange={e=>setEditDraft(d=>({...d,email:e.target.value}))} className="h-7 text-xs" /></div>
                      <div className="md:col-span-2"><label className="text-[11px] text-muted-foreground block mb-0.5">Address</label><Input value={editDraft.address ?? b.address} onChange={e=>setEditDraft(d=>({...d,address:e.target.value}))} className="h-7 text-xs" /></div>
                      <div><label className="text-[11px] text-muted-foreground block mb-0.5">GST No</label><Input value={editDraft.gstNo ?? b.gstNo} onChange={e=>setEditDraft(d=>({...d,gstNo:e.target.value}))} className="h-7 text-xs" /></div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                      <span>Code: <strong className="text-foreground">{b.code}</strong></span>
                      {b.phone && <span>Phone: {b.phone}</span>}
                      {b.email && <span>Email: {b.email}</span>}
                      {b.gstNo && <span>GST: {b.gstNo}</span>}
                      {b.address && <span className="w-full">Address: {b.address}</span>}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <label className="text-xs">Active</label>
                    <Switch checked={b.active} onCheckedChange={v=>dispatch({type:"UPDATE_BRANCH",item:{...b,active:v}})} />
                  </div>
                  <div className="flex items-center gap-1">
                    {editId === b.id ? (
                      <>
                        <Button size="icon" variant="default" className="h-7 w-7" onClick={()=>{dispatch({type:"UPDATE_BRANCH",item:{...b,...editDraft}});setEditId(null);toast.success("Saved");}}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </>
                    ) : (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>{setEditId(b.id);setEditDraft(b);}}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={()=>{dispatch({type:"DELETE_BRANCH",id:b.id});toast.success("Removed");}}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </TabShell>
  );
}

// ─── Menu Categories ───────────────────────────────────────────
function CategoriesTab() {
  const { config, dispatch } = useConfig();
  const [name, setName] = useState("");
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<MenuCategory>>({});

  const sorted = [...config.categories].sort((a, b) => a.sortOrder - b.sortOrder);

  const add = () => {
    if (!name.trim()) return;
    dispatch({ type: "ADD_CATEGORY", item: { id: newConfigId("cat"), name: name.trim(), color, active: true, sortOrder: config.categories.length + 1 } });
    setName(""); toast.success("Category added");
  };

  const saveEdit = () => {
    if (!editId) return;
    const base = config.categories.find(c => c.id === editId)!;
    dispatch({ type: "UPDATE_CATEGORY", item: { ...base, ...editDraft } });
    setEditId(null); toast.success("Category updated");
  };

  return (
    <TabShell title="Menu Categories" subtitle={`${config.categories.filter(c => c.active).length} active · drag to reorder`}>
      <Card className="p-4 mb-4">
        <h3 className="text-sm font-semibold mb-3">Add Category</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Name</label>
            <Input placeholder="e.g. Breads" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} className="w-44" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Colour</label>
            <div className="flex gap-1.5">
              {CATEGORY_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} className={cn("h-7 w-7 rounded-full border-2 transition-all", color === c ? "border-foreground scale-110" : "border-transparent")} style={{ background: c }} />
              ))}
            </div>
          </div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-8 px-2" />
              <th className="text-left px-4 py-2.5">Category</th>
              <th className="text-center px-4 py-2.5">Colour</th>
              <th className="text-center px-4 py-2.5">Sort</th>
              <th className="text-center px-4 py-2.5">Active</th>
              <th className="text-center px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => (
              <tr key={c.id} className="border-t hover:bg-muted/20">
                <td className="px-2 py-2 text-muted-foreground"><GripVertical className="h-4 w-4" /></td>
                <td className="px-4 py-2">
                  {editId === c.id
                    ? <Input value={editDraft.name ?? c.name} onChange={e => setEditDraft(p => ({ ...p, name: e.target.value }))} className="h-7 w-36" />
                    : <span className="font-medium flex items-center gap-2"><span className="h-3 w-3 rounded-full inline-block" style={{ background: c.color }} />{c.name}</span>}
                </td>
                <td className="px-4 py-2 text-center">
                  {editId === c.id
                    ? <div className="flex gap-1 justify-center">{CATEGORY_COLORS.map(col => <button key={col} onClick={() => setEditDraft(p => ({ ...p, color: col }))} className={cn("h-5 w-5 rounded-full border-2", (editDraft.color ?? c.color) === col ? "border-foreground" : "border-transparent")} style={{ background: col }} />)}</div>
                    : <span className="h-5 w-5 rounded-full inline-block mx-auto" style={{ background: c.color }} />}
                </td>
                <td className="px-4 py-2 text-center text-muted-foreground">{c.sortOrder}</td>
                <td className="px-4 py-2 text-center"><Switch checked={c.active} onCheckedChange={v => dispatch({ type: "UPDATE_CATEGORY", item: { ...c, active: v } })} /></td>
                <td className="px-4 py-2 text-center">
                  <ActionButtons editId={editId} id={c.id} onEdit={() => { setEditId(c.id); setEditDraft(c); }} onSave={saveEdit} onCancel={() => setEditId(null)} onDelete={() => { dispatch({ type: "DELETE_CATEGORY", id: c.id }); toast.success("Deleted"); }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </TabShell>
  );
}

// ─── Kitchen Stations ──────────────────────────────────────────
function StationsTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState({ name: "", printer: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<KitchenStation>>({});

  const add = () => {
    if (!draft.name.trim()) return;
    dispatch({ type: "ADD_STATION", item: { id: newConfigId("stn"), name: draft.name, printer: draft.printer, active: true, sortOrder: config.stations.length + 1 } });
    setDraft({ name: "", printer: "" }); toast.success("Station added");
  };

  return (
    <TabShell title="Kitchen Stations" subtitle="Stations define where KOTs are printed and how items are routed.">
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div><label className="text-xs text-muted-foreground mb-1 block">Station Name</label><Input placeholder="e.g. Grill" value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} className="w-36" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Printer Name</label><Input placeholder="e.g. Printer-1" value={draft.printer} onChange={e => setDraft(p => ({ ...p, printer: e.target.value }))} className="w-36" /></div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add Station</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">Station</th>
              <th className="text-left px-4 py-2.5">Printer</th>
              <th className="text-center px-4 py-2.5">Sort</th>
              <th className="text-center px-4 py-2.5">Active</th>
              <th className="text-center px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {config.stations.sort((a,b)=>a.sortOrder-b.sortOrder).map(s => (
              <tr key={s.id} className="border-t hover:bg-muted/20">
                <td className="px-4 py-2 font-medium">{editId===s.id ? <Input value={editDraft.name??s.name} onChange={e=>setEditDraft(p=>({...p,name:e.target.value}))} className="h-7 w-32" /> : s.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{editId===s.id ? <Input value={editDraft.printer??s.printer??""} onChange={e=>setEditDraft(p=>({...p,printer:e.target.value}))} className="h-7 w-32" /> : (s.printer||"—")}</td>
                <td className="px-4 py-2 text-center text-muted-foreground">{s.sortOrder}</td>
                <td className="px-4 py-2 text-center"><Switch checked={s.active} onCheckedChange={v=>dispatch({type:"UPDATE_STATION",item:{...s,active:v}})} /></td>
                <td className="px-4 py-2 text-center"><ActionButtons editId={editId} id={s.id} onEdit={()=>{setEditId(s.id);setEditDraft(s);}} onSave={()=>{dispatch({type:"UPDATE_STATION",item:{...s,...editDraft}});setEditId(null);toast.success("Saved");}} onCancel={()=>setEditId(null)} onDelete={()=>{dispatch({type:"DELETE_STATION",id:s.id});toast.success("Deleted");}} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </TabShell>
  );
}

// ─── Table Sections ────────────────────────────────────────────
function SectionsTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState({ name: "", prefix: "" });

  const add = () => {
    if (!draft.name.trim() || !draft.prefix.trim()) { toast.error("Name and prefix required"); return; }
    dispatch({ type: "ADD_SECTION", item: { id: newConfigId("sec"), name: draft.name, prefix: draft.prefix.toUpperCase(), active: true, sortOrder: config.tableSections.length + 1 } });
    setDraft({ name: "", prefix: "" }); toast.success("Section added");
  };

  return (
    <TabShell title="Table Sections" subtitle="Sections group tables in the POS floor view (e.g. Main, Patio, Rooftop).">
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div><label className="text-xs text-muted-foreground mb-1 block">Section Name</label><Input placeholder="e.g. Rooftop" value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))} className="w-36" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Table Prefix</label><Input placeholder="e.g. R" value={draft.prefix} onChange={e=>setDraft(p=>({...p,prefix:e.target.value}))} className="w-20" maxLength={3} /></div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add Section</Button>
        </div>
      </Card>

      <div className="grid md:grid-cols-3 gap-3">
        {config.tableSections.sort((a,b)=>a.sortOrder-b.sortOrder).map(s => (
          <Card key={s.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold flex items-center gap-2">
                <span className="h-7 w-7 rounded-md bg-primary/10 text-primary text-xs font-bold grid place-items-center">{s.prefix}</span>
                {s.name}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Prefix: {s.prefix} · Order: {s.sortOrder}</div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={s.active} onCheckedChange={v=>dispatch({type:"UPDATE_SECTION",item:{...s,active:v}})} />
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={()=>{dispatch({type:"DELETE_SECTION",id:s.id});toast.success("Deleted");}}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </TabShell>
  );
}

// ─── Payment Methods ───────────────────────────────────────────
function PaymentsTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState({ name: "", type: "custom" as PaymentMethod["type"], requiresReference: false });

  const typeColors = { cash: "text-green-600 bg-green-500/10", card: "text-blue-600 bg-blue-500/10", upi: "text-purple-600 bg-purple-500/10", custom: "text-orange-600 bg-orange-500/10" };

  const add = () => {
    if (!draft.name.trim()) return;
    dispatch({ type: "ADD_PAYMENT_METHOD", item: { id: newConfigId("pm"), ...draft, active: true } });
    setDraft({ name: "", type: "custom", requiresReference: false }); toast.success("Payment method added");
  };

  return (
    <TabShell title="Payment Methods" subtitle="Enable or disable payment methods shown in the payment modal.">
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div><label className="text-xs text-muted-foreground mb-1 block">Method Name</label><Input placeholder="e.g. Paytm" value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))} className="w-36" /></div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
            <Select value={draft.type} onValueChange={v=>setDraft(p=>({...p,type:v as any}))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{(["cash","card","upi","custom"] as const).map(t=><SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 self-end pb-1">
            <Switch checked={draft.requiresReference} onCheckedChange={v=>setDraft(p=>({...p,requiresReference:v}))} />
            <label className="text-sm">Requires Ref No.</label>
          </div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        {config.paymentMethods.map(pm => (
          <Card key={pm.id} className={cn("p-4 flex items-center justify-between gap-3", !pm.active && "opacity-50")}>
            <div className="flex items-center gap-3">
              <span className={cn("text-xs px-2.5 py-1 rounded-full font-semibold capitalize", typeColors[pm.type])}>{pm.type}</span>
              <div>
                <div className="font-semibold">{pm.name}</div>
                {pm.requiresReference && <div className="text-[11px] text-muted-foreground">Requires reference no.</div>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={pm.active} onCheckedChange={v=>dispatch({type:"UPDATE_PAYMENT_METHOD",item:{...pm,active:v}})} />
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={()=>{dispatch({type:"DELETE_PAYMENT_METHOD",id:pm.id});toast.success("Removed");}}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </TabShell>
  );
}

// ─── Staff Roles ───────────────────────────────────────────────
function RolesTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState({ name: "", label: "", permissions: "" });

  const ALL_PERMISSIONS = ["pos","kds","payment","table","kot","inventory","reports","void","shift","masters"];

  const add = () => {
    if (!draft.name.trim() || !draft.label.trim()) { toast.error("Name and label required"); return; }
    dispatch({ type: "ADD_STAFF_ROLE", item: { id: newConfigId("role"), name: draft.name.toLowerCase(), label: draft.label, permissions: draft.permissions.split(",").map(p=>p.trim()).filter(Boolean), active: true } });
    setDraft({ name: "", label: "", permissions: "" }); toast.success("Role added");
  };

  return (
    <TabShell title="Staff Roles" subtitle="Define roles and their module permissions.">
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div><label className="text-xs text-muted-foreground mb-1 block">Role ID</label><Input placeholder="e.g. supervisor" value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))} className="w-32" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Display Label</label><Input placeholder="e.g. Supervisor" value={draft.label} onChange={e=>setDraft(p=>({...p,label:e.target.value}))} className="w-36" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Permissions (comma-sep)</label><Input placeholder="pos,kds,reports" value={draft.permissions} onChange={e=>setDraft(p=>({...p,permissions:e.target.value}))} className="w-60" /></div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add Role</Button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="text-[11px] text-muted-foreground">Available permissions:</span>
          {ALL_PERMISSIONS.map(p=><span key={p} className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{p}</span>)}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        {config.staffRoles.map(role => (
          <Card key={role.id} className={cn("p-4", !role.active && "opacity-50")}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">{role.label}</div>
              <div className="flex items-center gap-2">
                <Switch checked={role.active} onCheckedChange={v=>dispatch({type:"UPDATE_STAFF_ROLE",item:{...role,active:v}})} />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={()=>{dispatch({type:"DELETE_STAFF_ROLE",id:role.id});toast.success("Deleted");}}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mb-1.5">ID: <code className="bg-muted px-1 rounded">{role.name}</code></div>
            <div className="flex flex-wrap gap-1">
              {(role.permissions.includes("*") ? ALL_PERMISSIONS : role.permissions).map(p=>(
                <span key={p} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{p}</span>
              ))}
              {role.permissions.includes("*") && <span className="text-[10px] text-primary font-bold">+ ALL</span>}
            </div>
          </Card>
        ))}
      </div>
    </TabShell>
  );
}

// ─── Tax Slabs ─────────────────────────────────────────────────
function TaxTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState({ name: "", rate: 0 });

  const add = () => {
    if (!draft.name.trim()) return;
    dispatch({ type: "ADD_TAX_SLAB", item: { id: newConfigId("tax"), name: draft.name, rate: draft.rate, isDefault: false, active: true } });
    setDraft({ name: "", rate: 0 }); toast.success("Tax slab added");
  };

  return (
    <TabShell title="Tax Slabs" subtitle="Define GST or other tax rates. Mark one as default for new orders.">
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div><label className="text-xs text-muted-foreground mb-1 block">Label</label><Input placeholder="e.g. GST 5%" value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))} className="w-36" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Rate %</label><Input type="number" min={0} max={100} value={draft.rate} onChange={e=>setDraft(p=>({...p,rate:Number(e.target.value)}))} className="w-24" /></div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add Slab</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">Name</th>
              <th className="text-center px-4 py-2.5">Rate %</th>
              <th className="text-center px-4 py-2.5">Default</th>
              <th className="text-center px-4 py-2.5">Active</th>
              <th className="text-center px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {config.taxSlabs.map(t => (
              <tr key={t.id} className="border-t hover:bg-muted/20">
                <td className="px-4 py-2 font-medium">{t.name}</td>
                <td className="px-4 py-2 text-center font-bold">{t.rate}%</td>
                <td className="px-4 py-2 text-center">
                  <button onClick={()=>dispatch({type:"SET_DEFAULT_TAX",id:t.id})} className={cn("text-xs px-2.5 py-1 rounded-full font-semibold border transition-colors", t.isDefault ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
                    {t.isDefault ? "✓ Default" : "Set Default"}
                  </button>
                </td>
                <td className="px-4 py-2 text-center"><Switch checked={t.active} onCheckedChange={v=>dispatch({type:"UPDATE_TAX_SLAB",item:{...t,active:v}})} /></td>
                <td className="px-4 py-2 text-center">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={()=>{dispatch({type:"DELETE_TAX_SLAB",id:t.id});toast.success("Deleted");}}><Trash2 className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </TabShell>
  );
}

// ─── Discount Types ────────────────────────────────────────────
function DiscountsTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState({ name: "", type: "percentage" as DiscountType["type"], maxValue: 10, requiresApproval: false });

  const add = () => {
    if (!draft.name.trim()) return;
    dispatch({ type: "ADD_DISCOUNT_TYPE", item: { id: newConfigId("disc"), ...draft, active: true } });
    setDraft({ name: "", type: "percentage", maxValue: 10, requiresApproval: false }); toast.success("Discount type added");
  };

  return (
    <TabShell title="Discount Types" subtitle="Define pre-set discount categories with approval workflows.">
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div><label className="text-xs text-muted-foreground mb-1 block">Name</label><Input placeholder="e.g. Birthday Offer" value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))} className="w-44" /></div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
            <Select value={draft.type} onValueChange={v=>setDraft(p=>({...p,type:v as any}))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="flat">Flat ₹</SelectItem></SelectContent>
            </Select>
          </div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Max Value</label><Input type="number" value={draft.maxValue} onChange={e=>setDraft(p=>({...p,maxValue:Number(e.target.value)}))} className="w-24" /></div>
          <div className="flex items-center gap-2 self-end pb-1">
            <Switch checked={draft.requiresApproval} onCheckedChange={v=>setDraft(p=>({...p,requiresApproval:v}))} />
            <label className="text-sm">Needs Approval</label>
          </div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">Name</th>
              <th className="text-center px-4 py-2.5">Type</th>
              <th className="text-center px-4 py-2.5">Max</th>
              <th className="text-center px-4 py-2.5">Approval?</th>
              <th className="text-center px-4 py-2.5">Active</th>
              <th className="text-center px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {config.discountTypes.map(d => (
              <tr key={d.id} className="border-t hover:bg-muted/20">
                <td className="px-4 py-2 font-medium">{d.name}</td>
                <td className="px-4 py-2 text-center"><span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", d.type === "percentage" ? "bg-blue-500/10 text-blue-700" : "bg-green-500/10 text-green-700")}>{d.type === "percentage" ? "%" : "₹"} Flat</span></td>
                <td className="px-4 py-2 text-center font-bold">{d.type === "percentage" ? `${d.maxValue}%` : `₹${d.maxValue}`}</td>
                <td className="px-4 py-2 text-center">{d.requiresApproval ? <span className="text-xs text-yellow-600 font-semibold">Yes</span> : <span className="text-xs text-muted-foreground">No</span>}</td>
                <td className="px-4 py-2 text-center"><Switch checked={d.active} onCheckedChange={v=>dispatch({type:"UPDATE_DISCOUNT_TYPE",item:{...d,active:v}})} /></td>
                <td className="px-4 py-2 text-center"><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={()=>{dispatch({type:"DELETE_DISCOUNT_TYPE",id:d.id});toast.success("Deleted");}}><Trash2 className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </TabShell>
  );
}

// ─── KDS Config ────────────────────────────────────────────────
function KDSTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState(config.kds);
  const save = () => { dispatch({ type: "SET_KDS", data: draft }); toast.success("KDS config saved"); };

  return (
    <TabShell title="Kitchen Display System" subtitle="SLA thresholds, sound alerts and display behaviour.">
      <Card className="p-6 max-w-lg space-y-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Polling &amp; SLA</h3>
        <NumberField label="Refresh Interval (seconds)" value={draft.refreshIntervalSec} onChange={v=>setDraft(p=>({...p,refreshIntervalSec:v}))} min={1} max={60} />
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="⚠️ SLA Warning (minutes)" value={draft.slaWarningMin} onChange={v=>setDraft(p=>({...p,slaWarningMin:v}))} min={1} />
          <NumberField label="🔴 SLA Critical (minutes)" value={draft.slaCriticalMin} onChange={v=>setDraft(p=>({...p,slaCriticalMin:v}))} min={1} />
        </div>
        <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground flex gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Warning ({draft.slaWarningMin}m) = yellow, Critical ({draft.slaCriticalMin}m) = red + pulse.
        </div>

        <div className="border-t pt-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Display &amp; Behaviour</h3>
          <SwitchField label="Auto-advance ticket on Serve" value={draft.autoAdvanceOnServe} onChange={v=>setDraft(p=>({...p,autoAdvanceOnServe:v}))} />
          <SwitchField label="🔊 Sound alert on new KOT" value={draft.soundAlerts ?? true} onChange={v=>setDraft(p=>({...p,soundAlerts:v}))} />
          <SwitchField label="Bump-screen mode (full-screen touch)" value={draft.bumpScreenMode ?? false} onChange={v=>setDraft(p=>({...p,bumpScreenMode:v}))} />
          <SwitchField label="Show item notes / special instructions" value={draft.showItemNotes ?? true} onChange={v=>setDraft(p=>({...p,showItemNotes:v}))} />
          <SwitchField label="Group tickets by kitchen station" value={draft.groupByStation ?? false} onChange={v=>setDraft(p=>({...p,groupByStation:v}))} />
        </div>
        <Button onClick={save}><Check className="h-4 w-4 mr-2" /> Save KDS Config</Button>
      </Card>
    </TabShell>
  );
}

// ─── Billing Config ────────────────────────────────────────────
function BillingTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState(config.billing);
  const save = () => { dispatch({ type: "SET_BILLING", data: draft }); toast.success("Billing config saved"); };

  return (
    <TabShell title="Billing Configuration" subtitle="Default tax, service charge, bill numbering and feature toggles.">
      <Card className="p-6 max-w-xl space-y-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tax &amp; Charges</h3>
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Default Tax %" value={draft.defaultTaxPct} onChange={v=>setDraft(p=>({...p,defaultTaxPct:v}))} min={0} max={100} />
          <NumberField label="Service Charge %" value={draft.serviceChargePct} onChange={v=>setDraft(p=>({...p,serviceChargePct:v}))} min={0} max={100} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Default Discount %" value={draft.defaultDiscountPct} onChange={v=>setDraft(p=>({...p,defaultDiscountPct:v}))} min={0} max={100} />
          <NumberField label="Cover Charge per Head (₹)" value={draft.coverChargePerHead ?? 0} onChange={v=>setDraft(p=>({...p,coverChargePerHead:v}))} min={0} />
        </div>
        <NumberField label="Minimum Order Value (₹, 0 = no minimum)" value={draft.minimumOrderValue ?? 0} onChange={v=>setDraft(p=>({...p,minimumOrderValue:v}))} min={0} />

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Bill Numbering</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Bill Prefix</label>
              <Input placeholder="e.g. INV-" value={draft.billPrefix ?? ""} onChange={e=>setDraft(p=>({...p,billPrefix:e.target.value}))} />
            </div>
            <NumberField label="Start Number" value={draft.billStartNumber ?? 1} onChange={v=>setDraft(p=>({...p,billStartNumber:v}))} min={1} />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">Bills will be numbered: {draft.billPrefix ?? "INV-"}{String(draft.billStartNumber ?? 1).padStart(4, "0")}, {draft.billPrefix ?? "INV-"}{String((draft.billStartNumber ?? 1) + 1).padStart(4, "0")}…</p>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Feature Toggles</h3>
          <SwitchField label="Round off bill total" value={draft.roundOffBill} onChange={v=>setDraft(p=>({...p,roundOffBill:v}))} />
          <SwitchField label="Print receipt on payment" value={draft.printReceiptOnPay} onChange={v=>setDraft(p=>({...p,printReceiptOnPay:v}))} />
          <SwitchField label="Show CGST / SGST breakdown on receipt" value={draft.showTaxBreakdown ?? true} onChange={v=>setDraft(p=>({...p,showTaxBreakdown:v}))} />
          <SwitchField label="Enable split bill" value={draft.splitBillEnabled} onChange={v=>setDraft(p=>({...p,splitBillEnabled:v}))} />
          <SwitchField label="Auto-print KOT on send" value={draft.autoKotPrint} onChange={v=>setDraft(p=>({...p,autoKotPrint:v}))} />
          <SwitchField label="Allow void/cancel without manager PIN" value={draft.allowVoidWithoutManager ?? false} onChange={v=>setDraft(p=>({...p,allowVoidWithoutManager:v}))} />
          <SwitchField label="Enable loyalty programme" value={draft.loyaltyEnabled ?? false} onChange={v=>setDraft(p=>({...p,loyaltyEnabled:v}))} />
        </div>
        <Button onClick={save}><Check className="h-4 w-4 mr-2" /> Save Billing Config</Button>
      </Card>
    </TabShell>
  );
}

// ─── Takeaway Config ───────────────────────────────────────────
function TakeawayTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState(config.takeaway);
  const save = () => { dispatch({ type: "SET_TAKEAWAY", data: draft }); toast.success("Takeaway config saved"); };

  return (
    <TabShell title="Takeaway &amp; Delivery" subtitle="Queue tokens, prep time, delivery charges and defaults.">
      <Card className="p-6 max-w-xl space-y-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Defaults</h3>
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Token Number Range (1–N)" value={draft.tokenMax} onChange={v=>setDraft(p=>({...p,tokenMax:v}))} min={10} max={9999} />
          <NumberField label="Default Prep Time (minutes)" value={draft.defaultPrepTimeMins} onChange={v=>setDraft(p=>({...p,defaultPrepTimeMins:v}))} min={1} max={120} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Default Order Type</label>
          <Select value={draft.defaultOrderType ?? "dine-in"} onValueChange={v=>setDraft(p=>({...p,defaultOrderType:v as any}))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dine-in">Dine-In</SelectItem>
              <SelectItem value="takeaway">Takeaway</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Charges</h3>
          <div className="grid grid-cols-2 gap-4">
            <NumberField label="Packaging Charge (₹/order)" value={draft.packagingCharge ?? 0} onChange={v=>setDraft(p=>({...p,packagingCharge:v}))} min={0} />
            <NumberField label="Delivery Charge (₹ flat)" value={draft.deliveryChargeFlatRate ?? 40} onChange={v=>setDraft(p=>({...p,deliveryChargeFlatRate:v}))} min={0} />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <NumberField label="Free Delivery Above (₹, 0=always charge)" value={draft.freeDeliveryAbove ?? 500} onChange={v=>setDraft(p=>({...p,freeDeliveryAbove:v}))} min={0} />
            <NumberField label="Delivery Radius (km, 0=unlimited)" value={draft.deliveryRadiusKm ?? 0} onChange={v=>setDraft(p=>({...p,deliveryRadiusKm:v}))} min={0} />
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Toggles</h3>
          <SwitchField label="Require customer phone number" value={draft.requirePhone} onChange={v=>setDraft(p=>({...p,requirePhone:v}))} />
          <SwitchField label="Enable delivery orders" value={draft.enableDelivery} onChange={v=>setDraft(p=>({...p,enableDelivery:v}))} />
          <SwitchField label="Require delivery address" value={draft.requireDeliveryAddress ?? true} onChange={v=>setDraft(p=>({...p,requireDeliveryAddress:v}))} />
        </div>
        <Button onClick={save}><Check className="h-4 w-4 mr-2" /> Save Takeaway Config</Button>
      </Card>
    </TabShell>
  );
}

// ─── Shift Config ──────────────────────────────────────────────
function ShiftTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState(config.shift);
  const save = () => { dispatch({ type: "SET_SHIFT", data: draft }); toast.success("Shift config saved"); };

  return (
    <TabShell title="Shift Configuration" subtitle="Opening and closing procedures, overtime thresholds and petty cash limits.">
      <Card className="p-6 max-w-xl space-y-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Timing</h3>
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Break Duration (minutes)" value={draft.breakDurationMins} onChange={v=>setDraft(p=>({...p,breakDurationMins:v}))} min={0} max={120} />
          <NumberField label="Max Shift Length (hours, 0=off)" value={draft.maxShiftHours ?? 12} onChange={v=>setDraft(p=>({...p,maxShiftHours:v}))} min={0} max={24} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="Overtime Threshold (hours)" value={draft.overtimeThresholdHours ?? 9} onChange={v=>setDraft(p=>({...p,overtimeThresholdHours:v}))} min={0} max={24} />
          <NumberField label="Auto-close After (hours, 0=never)" value={draft.autoCloseShiftAfterHours ?? 0} onChange={v=>setDraft(p=>({...p,autoCloseShiftAfterHours:v}))} min={0} max={48} />
        </div>
        <NumberField label="Petty Cash Limit per Shift (₹)" value={draft.pettyCashLimit ?? 500} onChange={v=>setDraft(p=>({...p,pettyCashLimit:v}))} min={0} />

        <div className="border-t pt-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Procedures</h3>
          <SwitchField label="Require shift to be opened before billing" value={draft.requireOpenShift} onChange={v=>setDraft(p=>({...p,requireOpenShift:v}))} />
          <SwitchField label="Cash count on shift open" value={draft.cashCountOnOpen} onChange={v=>setDraft(p=>({...p,cashCountOnOpen:v}))} />
          <SwitchField label="Cash count on shift close" value={draft.cashCountOnClose} onChange={v=>setDraft(p=>({...p,cashCountOnClose:v}))} />
          <SwitchField label="Allow multiple shifts open simultaneously" value={draft.allowMultipleOpenShifts ?? false} onChange={v=>setDraft(p=>({...p,allowMultipleOpenShifts:v}))} />
        </div>
        <Button onClick={save}><Check className="h-4 w-4 mr-2" /> Save Shift Config</Button>
      </Card>
    </TabShell>
  );
}

// ─── Printers ─────────────────────────────────────────────────
function PrintersTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState<Omit<Printer, "id">>({ name: "", ipAddress: "", port: 9100, type: "receipt", paperWidth: "80mm", active: true });
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Printer>>({});

  const add = () => {
    if (!draft.name.trim()) { toast.error("Printer name required"); return; }
    dispatch({ type: "ADD_PRINTER", item: { id: newConfigId("ptr"), ...draft } });
    setDraft({ name: "", ipAddress: "", port: 9100, type: "receipt", paperWidth: "80mm", active: true });
    toast.success("Printer added");
  };

  const typeColors: Record<string, string> = {
    receipt: "bg-blue-500/10 text-blue-700",
    kot: "bg-orange-500/10 text-orange-700",
    both: "bg-purple-500/10 text-purple-700",
  };

  return (
    <TabShell title="Printers" subtitle="Configure network or USB printers for receipts and KOT slips.">
      <Card className="p-4 mb-4">
        <h3 className="text-sm font-semibold mb-3">Add Printer</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <div><label className="text-xs text-muted-foreground mb-1 block">Name</label><Input placeholder="e.g. Counter Printer" value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))} className="w-40" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">IP Address</label><Input placeholder="192.168.1.100" value={draft.ipAddress} onChange={e=>setDraft(p=>({...p,ipAddress:e.target.value}))} className="w-36" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Port</label><Input type="number" value={draft.port} onChange={e=>setDraft(p=>({...p,port:Number(e.target.value)}))} className="w-20" /></div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Type</label>
            <Select value={draft.type} onValueChange={v=>setDraft(p=>({...p,type:v as any}))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="receipt">Receipt</SelectItem><SelectItem value="kot">KOT</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Paper</label>
            <Select value={draft.paperWidth} onValueChange={v=>setDraft(p=>({...p,paperWidth:v as any}))}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="58mm">58 mm</SelectItem><SelectItem value="80mm">80 mm</SelectItem></SelectContent>
            </Select>
          </div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">Name</th>
              <th className="text-left px-4 py-2.5">IP / Port</th>
              <th className="text-center px-4 py-2.5">Type</th>
              <th className="text-center px-4 py-2.5">Paper</th>
              <th className="text-center px-4 py-2.5">Active</th>
              <th className="text-center px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(config.printers ?? []).map(p => (
              <tr key={p.id} className="border-t hover:bg-muted/20">
                <td className="px-4 py-2 font-medium">
                  {editId === p.id ? <Input value={editDraft.name ?? p.name} onChange={e=>setEditDraft(d=>({...d,name:e.target.value}))} className="h-7 w-32" /> : p.name}
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  {editId === p.id
                    ? <div className="flex gap-1"><Input value={editDraft.ipAddress ?? p.ipAddress} onChange={e=>setEditDraft(d=>({...d,ipAddress:e.target.value}))} className="h-7 w-28" /><Input type="number" value={editDraft.port ?? p.port} onChange={e=>setEditDraft(d=>({...d,port:Number(e.target.value)}))} className="h-7 w-16" /></div>
                    : <>{p.ipAddress}:{p.port}</>}
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize", typeColors[p.type])}>{p.type}</span>
                </td>
                <td className="px-4 py-2 text-center text-muted-foreground text-xs">{p.paperWidth}</td>
                <td className="px-4 py-2 text-center"><Switch checked={p.active} onCheckedChange={v=>dispatch({type:"UPDATE_PRINTER",item:{...p,active:v}})} /></td>
                <td className="px-4 py-2 text-center">
                  <ActionButtons editId={editId} id={p.id}
                    onEdit={()=>{setEditId(p.id);setEditDraft(p);}}
                    onSave={()=>{dispatch({type:"UPDATE_PRINTER",item:{...p,...editDraft}});setEditId(null);toast.success("Saved");}}
                    onCancel={()=>setEditId(null)}
                    onDelete={()=>{dispatch({type:"DELETE_PRINTER",id:p.id});toast.success("Deleted");}}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </TabShell>
  );
}

// ─── Online Order Channels ─────────────────────────────────────
function OnlineChannelsTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState<Omit<OnlineOrderChannel, "id">>({ name: "", platformFeePercent: 0, active: false, autoAccept: false, printerName: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<OnlineOrderChannel>>({});

  const add = () => {
    if (!draft.name.trim()) { toast.error("Channel name required"); return; }
    dispatch({ type: "ADD_ONLINE_CHANNEL", item: { id: newConfigId("oc"), ...draft } });
    setDraft({ name: "", platformFeePercent: 0, active: false, autoAccept: false, printerName: "" });
    toast.success("Channel added");
  };

  return (
    <TabShell title="Online Order Channels" subtitle="Manage third-party delivery platforms and their commission rates.">
      <Card className="p-4 mb-4">
        <h3 className="text-sm font-semibold mb-3">Add Channel</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <div><label className="text-xs text-muted-foreground mb-1 block">Platform Name</label><Input placeholder="e.g. Zomato" value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))} className="w-36" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Commission %</label><Input type="number" min={0} max={100} value={draft.platformFeePercent} onChange={e=>setDraft(p=>({...p,platformFeePercent:Number(e.target.value)}))} className="w-24" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Linked Printer</label><Input placeholder="Printer name" value={draft.printerName} onChange={e=>setDraft(p=>({...p,printerName:e.target.value}))} className="w-36" /></div>
          <div className="flex items-center gap-2 self-end pb-1"><Switch checked={draft.autoAccept} onCheckedChange={v=>setDraft(p=>({...p,autoAccept:v}))} /><label className="text-sm">Auto-accept</label></div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        {(config.onlineChannels ?? []).map(ch => (
          <Card key={ch.id} className={cn("p-4", !ch.active && "opacity-55")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-base flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-primary" />{ch.name}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Commission: <strong>{ch.platformFeePercent}%</strong> · Printer: <code className="bg-muted px-1 rounded">{ch.printerName || "—"}</code>
                </div>
                {ch.autoAccept && <span className="text-[10px] bg-green-500/10 text-green-700 px-2 py-0.5 rounded-full font-semibold mt-1.5 inline-block">Auto-accept ON</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={ch.active} onCheckedChange={v=>dispatch({type:"UPDATE_ONLINE_CHANNEL",item:{...ch,active:v}})} />
                {editId === ch.id ? (
                  <>
                    <Button size="icon" variant="default" className="h-7 w-7" onClick={()=>{dispatch({type:"UPDATE_ONLINE_CHANNEL",item:{...ch,...editDraft}});setEditId(null);toast.success("Saved");}}><Check className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
                  </>
                ) : (
                  <>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={()=>{setEditId(ch.id);setEditDraft(ch);}}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={()=>{dispatch({type:"DELETE_ONLINE_CHANNEL",id:ch.id});toast.success("Removed");}}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </>
                )}
              </div>
            </div>
            {editId === ch.id && (
              <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2">
                <div><label className="text-[11px] text-muted-foreground block mb-0.5">Platform Name</label><Input value={editDraft.name ?? ch.name} onChange={e=>setEditDraft(d=>({...d,name:e.target.value}))} className="h-7 text-xs" /></div>
                <div><label className="text-[11px] text-muted-foreground block mb-0.5">Commission %</label><Input type="number" value={editDraft.platformFeePercent ?? ch.platformFeePercent} onChange={e=>setEditDraft(d=>({...d,platformFeePercent:Number(e.target.value)}))} className="h-7 text-xs" /></div>
                <div><label className="text-[11px] text-muted-foreground block mb-0.5">Printer Name</label><Input value={editDraft.printerName ?? ch.printerName} onChange={e=>setEditDraft(d=>({...d,printerName:e.target.value}))} className="h-7 text-xs" /></div>
                <div className="flex items-center gap-2 pt-3"><Switch checked={editDraft.autoAccept ?? ch.autoAccept} onCheckedChange={v=>setEditDraft(d=>({...d,autoAccept:v}))} /><label className="text-xs">Auto-accept</label></div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </TabShell>
  );
}

// ─── Loyalty Program ───────────────────────────────────────────
function LoyaltyTab() {
  const { config, dispatch } = useConfig();
  const [draft, setDraft] = useState(config.loyalty ?? {
    enabled: false, pointsPerRupee: 0.1, rupeePerPoint: 0.25,
    minPointsToRedeem: 100, expiryDays: 365,
    earnOnDiscountedBills: false, redeemOnDelivery: false,
  });
  const save = () => { dispatch({ type: "SET_LOYALTY", data: draft }); toast.success("Loyalty config saved"); };

  const exampleSpend = 1000;
  const earned = Math.floor(exampleSpend * (draft.pointsPerRupee ?? 0.1));
  const worth = (earned * (draft.rupeePerPoint ?? 0.25)).toFixed(2);

  return (
    <TabShell title="Loyalty Programme" subtitle="Reward customers with points earned on every bill.">
      <Card className="p-6 max-w-xl space-y-5">
        <SwitchField label="Enable Loyalty Programme" value={draft.enabled ?? false} onChange={v=>setDraft(p=>({...p,enabled:v}))} />

        <div className={cn("space-y-5", !draft.enabled && "opacity-40 pointer-events-none")}>
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Earning Rules</h3>
            <div className="grid grid-cols-2 gap-4">
              <NumberField label="Points earned per ₹1 spent" value={draft.pointsPerRupee ?? 0.1} onChange={v=>setDraft(p=>({...p,pointsPerRupee:v}))} min={0} />
              <NumberField label="Points expiry (days, 0=never)" value={draft.expiryDays ?? 365} onChange={v=>setDraft(p=>({...p,expiryDays:v}))} min={0} />
            </div>
            <SwitchField label="Earn points on discounted bills" value={draft.earnOnDiscountedBills ?? false} onChange={v=>setDraft(p=>({...p,earnOnDiscountedBills:v}))} />
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Redemption Rules</h3>
            <div className="grid grid-cols-2 gap-4">
              <NumberField label="₹ value per point redeemed" value={draft.rupeePerPoint ?? 0.25} onChange={v=>setDraft(p=>({...p,rupeePerPoint:v}))} min={0} />
              <NumberField label="Minimum points to redeem" value={draft.minPointsToRedeem ?? 100} onChange={v=>setDraft(p=>({...p,minPointsToRedeem:v}))} min={0} />
            </div>
            <SwitchField label="Allow redemption on delivery orders" value={draft.redeemOnDelivery ?? false} onChange={v=>setDraft(p=>({...p,redeemOnDelivery:v}))} />
          </div>

          {/* Live Preview */}
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-xs font-semibold text-primary mb-2">💡 Example Simulation</p>
            <p className="text-sm text-muted-foreground">
              Customer spends <strong>₹{exampleSpend}</strong> → earns <strong>{earned} pts</strong> → worth <strong>₹{worth}</strong> off next bill.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Min to redeem: <strong>{draft.minPointsToRedeem} pts</strong> · {earned >= (draft.minPointsToRedeem ?? 100) ? "✅ Eligible" : "❌ Not eligible yet"}
            </p>
          </div>
        </div>
        <Button onClick={save}><Check className="h-4 w-4 mr-2" /> Save Loyalty Config</Button>
      </Card>
    </TabShell>
  );
}

// ─── Shared UI Helpers ─────────────────────────────────────────
function TabShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, className }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Input value={value} onChange={e => onChange(e.target.value)} className={className} />
    </div>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Input type="number" value={value} min={min} max={max} onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}

function SwitchField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function ActionButtons({ editId, id, onEdit, onSave, onCancel, onDelete }: { editId: string | null; id: string; onEdit: () => void; onSave: () => void; onCancel: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-center gap-1">
      {editId === id ? (
        <>
          <Button size="icon" variant="default" className="h-7 w-7" onClick={onSave}><Check className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancel}><X className="h-3.5 w-3.5" /></Button>
        </>
      ) : (
        <>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
        </>
      )}
    </div>
  );
}

function ResetButton() {
  const { dispatch } = useConfig();
  return (
    <button
      onClick={() => {
        if (confirm("Reset ALL configuration to factory defaults? This cannot be undone.")) {
          dispatch({ type: "RESET_CONFIG" });
          toast.success("Configuration reset to defaults");
        }
      }}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-red-500/10 rounded-md transition-colors"
    >
      <RefreshCcw className="h-3.5 w-3.5" />
      Reset to Defaults
    </button>
  );
}
