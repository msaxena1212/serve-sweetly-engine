import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Utensils, ShoppingBag, ChefHat, BookOpen, Boxes, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const items: { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/pos", label: "Dine-In POS", icon: Utensils },
  { to: "/takeaway", label: "Takeaway", icon: ShoppingBag },
  { to: "/kds", label: "Kitchen Display", icon: ChefHat },
  { to: "/menu", label: "Menu", icon: BookOpen },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="hidden md:flex w-60 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-bold">F</div>
          <div>
            <div className="text-sm font-semibold leading-tight">Forno POS</div>
            <div className="text-[11px] opacity-60">Main Street Branch</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-1 text-sm">
        {items.map((it) => {
          const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
          <Link
              key={it.to}
              to={it.to as "/"}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground opacity-90",
              )}
            >
              <Icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-sidebar-border text-xs opacity-70">
        <div>Signed in as <span className="font-medium opacity-100">Alex (Manager)</span></div>
        <div className="mt-1">Shift: Evening · Open</div>
      </div>
    </aside>
  );
}