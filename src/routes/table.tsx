import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { getPublicMenuFn } from "@/lib/public-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Utensils, 
  Search, 
  Bell, 
  Receipt, 
  Plus, 
  Minus, 
  ShoppingBag, 
  Sparkles, 
  CheckCircle2, 
  Wine,
  Coffee,
  HelpCircle
} from "lucide-react";

export const Route = createFileRoute("/table")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      id: (search.id as string) || (search.table as string) || "T1",
    };
  },
  loader: async () => {
    try {
      const data = await getPublicMenuFn();
      return data;
    } catch {
      return { items: [], categories: [] };
    }
  },
  component: TableDigitalMenuPage,
});

function TableDigitalMenuPage() {
  const { id: tableNumber } = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const menuItems = loaderData?.items || [];
  const categoriesList = ["All", ...(loaderData?.categories || [])];

  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<Record<string, { name: string; price: number; qty: number }>>({});
  const [waiterCalled, setWaiterCalled] = useState(false);
  const [billRequested, setBillRequested] = useState(false);
  const [showOrderSheet, setShowOrderSheet] = useState(false);

  // Filtered items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesCat = selectedCategory === "All" || item.category === selectedCategory;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  // Cart operations
  const addToCart = (item: { id: string; name: string; price: number }) => {
    setCart((prev) => {
      const existing = prev[item.id];
      const nextQty = existing ? existing.qty + 1 : 1;
      return {
        ...prev,
        [item.id]: { name: item.name, price: item.price, qty: nextQty },
      };
    });
    toast.success(`Added ${item.name} to list`);
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      if (existing.qty <= 1) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return {
        ...prev,
        [itemId]: { ...existing, qty: existing.qty - 1 },
      };
    });
  };

  const totalItemsCount = Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = Object.values(cart).reduce((sum, item) => sum + item.price * item.qty, 0);

  const handleCallWaiter = (reason: string = "assistance") => {
    setWaiterCalled(true);
    toast.success(`Captain notified for Table ${tableNumber} (${reason}). A waiter will be right with you!`, {
      duration: 4000,
    });
  };

  const handleRequestBill = () => {
    setBillRequested(true);
    toast.success(`Bill requested for Table ${tableNumber}. Your steward will bring the printed check.`, {
      duration: 5000,
    });
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-28">
      {/* Top Banner */}
      <header className="sticky top-0 z-30 bg-neutral-900/90 backdrop-blur-md border-b border-neutral-800 px-4 py-3 shadow-md">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-red-600/20 text-red-500 flex items-center justify-center font-bold text-lg border border-red-500/30">
              <Utensils className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">Forno Restaurant</h1>
              <p className="text-xs text-neutral-400">
                Table <span className="font-semibold text-red-400">{tableNumber}</span> · Dine-In Digital Menu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCallWaiter("assistance")}
              className="h-8 border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 text-xs gap-1.5"
            >
              <Bell className="h-3.5 w-3.5 text-amber-400" />
              {waiterCalled ? "Called" : "Call Captain"}
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="max-w-xl mx-auto mt-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <Input
              type="text"
              placeholder="Search dishes, drinks, desserts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-neutral-800/80 border-neutral-700 text-neutral-100 placeholder:text-neutral-500 h-9 text-sm rounded-lg focus-visible:ring-red-500"
            />
          </div>
        </div>

        {/* Horizontal Category Chips */}
        <div className="max-w-xl mx-auto mt-3 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {categoriesList.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? "bg-red-600 text-white shadow-sm shadow-red-600/30"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* Main Menu Grid */}
      <main className="max-w-xl mx-auto px-4 py-4 space-y-4">
        {/* Quick Assistance Banner */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            onClick={() => handleCallWaiter("water / cutlery")}
            className="flex items-center justify-center gap-2 p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg hover:border-neutral-700 text-neutral-300 transition"
          >
            <Coffee className="h-4 w-4 text-sky-400" />
            <span>Water / Cutlery</span>
          </button>
          <button
            onClick={handleRequestBill}
            className="flex items-center justify-center gap-2 p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg hover:border-neutral-700 text-neutral-300 transition"
          >
            <Receipt className="h-4 w-4 text-emerald-400" />
            <span>{billRequested ? "Bill Requested" : "Request Bill"}</span>
          </button>
        </div>

        {/* Section Heading */}
        <div className="flex items-center justify-between text-xs text-neutral-400 pt-1">
          <span>{filteredItems.length} dishes available</span>
          <span>Prices inclusive of taxes</span>
        </div>

        {/* Item List */}
        <div className="space-y-2.5">
          {filteredItems.map((item) => {
            const inCartQty = cart[item.id]?.qty || 0;
            return (
              <Card
                key={item.id}
                className="bg-neutral-900 border-neutral-800 hover:border-neutral-700 transition shadow-sm overflow-hidden"
              >
                <CardContent className="p-3.5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-neutral-100 text-sm truncate">{item.name}</h3>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-neutral-700 text-neutral-400">
                        {item.category}
                      </Badge>
                    </div>
                    <p className="text-sm font-bold text-amber-400 mt-1">₹{item.price.toFixed(2)}</p>
                  </div>

                  <div className="flex items-center">
                    {inCartQty > 0 ? (
                      <div className="flex items-center gap-2 bg-neutral-800 border border-neutral-700 rounded-lg p-1">
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-7 h-7 flex items-center justify-center rounded bg-neutral-700 hover:bg-neutral-600 text-white"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-xs font-bold w-4 text-center text-white">{inCartQty}</span>
                        <button
                          onClick={() => addToCart(item)}
                          className="w-7 h-7 flex items-center justify-center rounded bg-red-600 hover:bg-red-500 text-white"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => addToCart(item)}
                        className="h-8 bg-neutral-800 hover:bg-red-600 border border-neutral-700 hover:border-red-600 text-neutral-200 hover:text-white text-xs px-3"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="text-center py-12 text-neutral-500 space-y-2">
              <Utensils className="h-8 w-8 mx-auto opacity-40" />
              <p className="text-sm">No items found matching your filter.</p>
            </div>
          )}
        </div>
      </main>

      {/* Floating Bottom Cart Bar */}
      {totalItemsCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-neutral-900/95 backdrop-blur border-t border-neutral-800 z-40">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-neutral-400">
                {totalItemsCount} {totalItemsCount === 1 ? "dish" : "dishes"} selected
              </p>
              <p className="text-base font-bold text-white">₹{cartSubtotal.toFixed(2)}</p>
            </div>

            <Button
              onClick={() => {
                setShowOrderSheet(true);
                toast.info("Show your selected dishes to the steward or captain.");
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs h-9 px-4 gap-2"
            >
              <ShoppingBag className="h-4 w-4" />
              View Selection
            </Button>
          </div>
        </div>
      )}

      {/* Selection Modal / Sheet */}
      {showOrderSheet && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-t-xl sm:rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">My Table Order Selection</h3>
                <p className="text-xs text-neutral-400">Table {tableNumber} · Show to Waiter</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOrderSheet(false)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </Button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {Object.entries(cart).map(([id, item]) => (
                <div key={id} className="flex items-center justify-between text-xs py-1.5 border-b border-neutral-800/50">
                  <div>
                    <p className="font-semibold text-white">{item.name}</p>
                    <p className="text-neutral-400">₹{item.price.toFixed(2)} × {item.qty}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => removeFromCart(id)}
                      className="w-6 h-6 flex items-center justify-center rounded bg-neutral-800 text-white"
                    >
                      <Minus className="h-2.5 w-2.5" />
                    </button>
                    <span className="font-bold text-white">{item.qty}</span>
                    <button
                      onClick={() => addToCart({ id, name: item.name, price: item.price })}
                      className="w-6 h-6 flex items-center justify-center rounded bg-red-600 text-white"
                    >
                      <Plus className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-neutral-800 pt-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-300">Total Estimate:</span>
              <span className="text-base font-bold text-amber-400">₹{cartSubtotal.toFixed(2)}</span>
            </div>

            <div className="space-y-2 pt-2">
              <Button
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium text-xs h-9"
                onClick={() => {
                  handleCallWaiter("order ready to be placed");
                  setShowOrderSheet(false);
                }}
              >
                <Bell className="h-3.5 w-3.5 mr-1.5" />
                Notify Steward: "Order is Ready"
              </Button>
              <Button
                variant="outline"
                className="w-full border-neutral-700 text-neutral-300 hover:bg-neutral-800 text-xs h-8"
                onClick={() => setShowOrderSheet(false)}
              >
                Continue Browsing
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

