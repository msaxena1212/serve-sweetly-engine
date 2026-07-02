import { usePos, newOrderItem, fmtMoney } from "@/lib/pos-store";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import { useConfig } from "@/lib/config-store";

export function MenuPicker({ orderId }: { orderId: string }) {
  const { menu, dispatch } = usePos();
  const { config } = useConfig();
  const cats = ["All", ...config.categories.filter(c => c.active).map(c => c.name)];
  const [cat, setCat] = useState<string>("All");
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    return menu.filter((m) => (cat === "All" || m.category === cat) && m.name.toLowerCase().includes(q.toLowerCase()));
  }, [menu, cat, q]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap gap-2 mb-3">
        <Input placeholder="Search menu…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-64" />
        <div className="flex flex-wrap gap-1.5">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${cat === c ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto pr-1">
        {items.map((m) => (
          <Card
            key={m.id}
            role="button"
            tabIndex={0}
            onClick={() => dispatch({ type: "ADD_ITEM", orderId, item: newOrderItem(m) })}
            className="p-3 cursor-pointer hover:border-primary/60 hover:shadow-sm transition select-none"
          >
            <div className="text-sm font-medium leading-tight">{m.name}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{m.category} · {m.station}</div>
            <div className="mt-2 flex items-end justify-between">
              <span className="text-base font-semibold">{fmtMoney(m.price)}</span>
              <span className={`text-[10px] ${m.stock <= 10 ? "text-primary" : "text-muted-foreground"}`}>{m.stock} in stock</span>
            </div>
          </Card>
        ))}
        {items.length === 0 && <p className="col-span-full text-sm text-muted-foreground p-4">No items match.</p>}
      </div>
    </div>
  );
}