import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Utensils, ShoppingBag, ChefHat,
  BookOpen, Boxes, BarChart3, Settings2, ShoppingCart, Wallet, GitBranch, ChevronDown, Sparkles, Menu
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useConfig } from "@/lib/config-store";
import { useState, useRef, useEffect } from "react";

export const OPS_ITEMS = [
  { to: "/",         label: "Dashboard",     icon: LayoutDashboard, exact: true },
  { to: "/pos",      label: "Dine-In POS",   icon: Utensils },
  { to: "/takeaway", label: "Takeaway",       icon: ShoppingBag },
  { to: "/kds",      label: "Kitchen Display",icon: ChefHat },
];

export const MGMT_ITEMS = [
  { to: "/menu",      label: "Menu",       icon: BookOpen },
  { to: "/inventory", label: "Inventory",  icon: Boxes },
  { to: "/purchases", label: "Purchases",  icon: ShoppingCart },
  { to: "/reports",   label: "Reports",    icon: BarChart3 },
  { to: "/ai",        label: "AI Insights", icon: Sparkles },
  { to: "/masters",   label: "Masters",    icon: Settings2 },
  { to: "/shift",     label: "Shift",      icon: Wallet },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { config, dispatch: configDispatch } = useConfig();
  const activeBranch = config.branches.find(b => b.id === config.activeBranchId) || config.branches[0];
  const [branchOpen, setBranchOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setBranchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
    <aside className="hidden md:flex w-60 flex-col border-r bg-sidebar text-sidebar-foreground shrink-0 sticky top-0 h-screen self-start">
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

      {/* Branch Switcher */}
      {config.branches.length > 0 && (
        <div className="px-3 pt-3 pb-1" ref={dropRef}>
          <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold px-1 mb-1">Active Branch</div>
          <div className="relative">
            <button
              onClick={() => setBranchOpen(o => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-sidebar-border bg-sidebar-accent/30 text-sm hover:bg-sidebar-accent transition-colors"
            >
              <span className="flex items-center gap-2 truncate">
                <GitBranch className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate font-medium">{activeBranch?.name ?? "Select Branch"}</span>
              </span>
              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform", branchOpen && "rotate-180")} />
            </button>
            {branchOpen && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-sidebar-border bg-popover shadow-lg overflow-hidden">
                {config.branches.filter(b => b.active).map(branch => (
                  <button
                    key={branch.id}
                    onClick={() => {
                      configDispatch({ type: "SET_ACTIVE_BRANCH", id: branch.id });
                      setBranchOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent",
                      branch.id === config.activeBranchId && "bg-sidebar-primary/10 font-semibold text-sidebar-primary"
                    )}
                  >
                    <div className="font-medium">{branch.name}</div>
                    <div className="text-[10px] opacity-60">{branch.code}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
// Phones: the desktop sidebar is hidden below md, so a top bar opens the same navigation as a sheet.
export function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { config } = useConfig();

  const MobileLink = ({ to, label, icon: Icon, exact }: { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }) => {
    const active = exact ? pathname === to : pathname.startsWith(to);
    return (
      <Link
        to={to as "/"}
        onClick={() => setOpen(false)}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
          active ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium" : "hover:bg-sidebar-accent",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </Link>
    );
  };

  return (
    <div className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-3 border-b bg-sidebar text-sidebar-foreground px-4 py-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-8 w-8 shrink-0 rounded-md bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-bold">
          {config.restaurant.name[0]}
        </div>
        <div className="text-sm font-semibold truncate">{config.restaurant.name} POS</div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button aria-label="Open menu" className="p-2 -mr-2 rounded-md hover:bg-sidebar-accent">
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground border-sidebar-border">
          <SheetHeader className="px-4 py-4 border-b border-sidebar-border">
            <SheetTitle className="text-sidebar-foreground text-base">Navigate</SheetTitle>
          </SheetHeader>
          <nav className="p-2 space-y-4 overflow-y-auto">
            <div>
              <div className="px-3 mb-1 text-[10px] uppercase tracking-widest opacity-50 font-semibold">Operations</div>
              {OPS_ITEMS.map((it) => <MobileLink key={it.to} {...it} />)}
            </div>
            <div>
              <div className="px-3 mb-1 text-[10px] uppercase tracking-widest opacity-50 font-semibold">Management</div>
              {MGMT_ITEMS.map((it) => <MobileLink key={it.to} {...it} />)}
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
