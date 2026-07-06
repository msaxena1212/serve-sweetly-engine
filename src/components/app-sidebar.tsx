import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Utensils, ShoppingBag, ChefHat,
  BookOpen, Boxes, BarChart3, Settings2, ShoppingCart, Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfig } from "@/lib/config-store";

const OPS_ITEMS = [
  { to: "/",         label: "Dashboard",     icon: LayoutDashboard, exact: true },
  { to: "/pos",      label: "Dine-In POS",   icon: Utensils },
  { to: "/takeaway", label: "Takeaway",       icon: ShoppingBag },
  { to: "/kds",      label: "Kitchen Display",icon: ChefHat },
];

const MGMT_ITEMS = [
  { to: "/menu",      label: "Menu",       icon: BookOpen },
  { to: "/inventory", label: "Inventory",  icon: Boxes },
  { to: "/purchases", label: "Purchases",  icon: ShoppingCart },
  { to: "/reports",   label: "Reports",    icon: BarChart3 },
  { to: "/masters",   label: "Masters",    icon: Settings2 },
  { to: "/shift",     label: "Shift",      icon: Wallet },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { config } = useConfig();

  const NavItem = ({ to, label, icon: Icon, exact }: { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }) => {
    const active = exact ? pathname === to : pathname.startsWith(to);
    return (
      <Link
        to={to as "/"}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
            : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground opacity-90",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </Link>
    );
  };

  return (
    <aside className="hidden md:flex w-60 flex-col border-r bg-sidebar text-sidebar-foreground shrink-0">
      {/* Branding */}
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-bold text-lg">
            {config.restaurant.name[0]}
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">{config.restaurant.name} POS</div>
            <div className="text-[11px] opacity-60">{config.restaurant.branch}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
        {/* Operations */}
        <div>
          <div className="px-3 mb-1 text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold">Operations</div>
          <div className="space-y-0.5">
            {OPS_ITEMS.map((it) => <NavItem key={it.to} {...it} />)}
          </div>
        </div>

        {/* Management */}
        <div>
          <div className="px-3 mb-1 text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold">Management</div>
          <div className="space-y-0.5">
            {MGMT_ITEMS.map((it) => <NavItem key={it.to} {...it} />)}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-sidebar-border text-xs opacity-70">
        <div>GST: <span className="font-medium opacity-100">{config.restaurant.gstNo}</span></div>
        <div className="mt-0.5 text-[10px]">{config.restaurant.phone}</div>
      </div>
    </aside>
  );
}