import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";

export type MenuCategory = "Starters" | "Mains" | "Sides" | "Desserts" | "Beverages";
export type Station = "Kitchen" | "Bar" | "Tandoor";

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: MenuCategory;
  station: Station;
  available: boolean;
  stock: number; // simplistic inventory
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  station: Station;
  status: "new" | "sent" | "preparing" | "ready" | "served";
  notes?: string;
}

export type OrderType = "dine-in" | "takeaway";
export type OrderStatus = "open" | "paid" | "void";

export interface Order {
  id: string;
  type: OrderType;
  tableId?: string;
  customerName?: string;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: number;
  closedAt?: number;
  paymentMethod?: "cash" | "card" | "upi";
  discountPct: number;
  taxPct: number;
}

export interface Table {
  id: string;
  name: string;
  seats: number;
  section: "Main" | "Patio" | "Bar";
}

interface State {
  menu: MenuItem[];
  tables: Table[];
  orders: Order[];
}

const STORAGE_KEY = "pos-state-v1";

const seedMenu: MenuItem[] = [
  { id: "m1", name: "Bruschetta", price: 8.5, category: "Starters", station: "Kitchen", available: true, stock: 40 },
  { id: "m2", name: "Caesar Salad", price: 10, category: "Starters", station: "Kitchen", available: true, stock: 30 },
  { id: "m3", name: "Margherita Pizza", price: 14, category: "Mains", station: "Kitchen", available: true, stock: 25 },
  { id: "m4", name: "Truffle Pasta", price: 18, category: "Mains", station: "Kitchen", available: true, stock: 20 },
  { id: "m5", name: "Grilled Salmon", price: 22, category: "Mains", station: "Kitchen", available: true, stock: 15 },
  { id: "m6", name: "Tandoori Chicken", price: 16, category: "Mains", station: "Tandoor", available: true, stock: 18 },
  { id: "m7", name: "Garlic Naan", price: 4, category: "Sides", station: "Tandoor", available: true, stock: 60 },
  { id: "m8", name: "Truffle Fries", price: 6, category: "Sides", station: "Kitchen", available: true, stock: 50 },
  { id: "m9", name: "Tiramisu", price: 7, category: "Desserts", station: "Kitchen", available: true, stock: 12 },
  { id: "m10", name: "Cheesecake", price: 7.5, category: "Desserts", station: "Kitchen", available: true, stock: 10 },
  { id: "m11", name: "Espresso", price: 3, category: "Beverages", station: "Bar", available: true, stock: 100 },
  { id: "m12", name: "House Red Wine", price: 9, category: "Beverages", station: "Bar", available: true, stock: 40 },
  { id: "m13", name: "Craft Lager", price: 6, category: "Beverages", station: "Bar", available: true, stock: 50 },
  { id: "m14", name: "Fresh Lemonade", price: 4.5, category: "Beverages", station: "Bar", available: true, stock: 30 },
];

const seedTables: Table[] = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `t${i + 1}`, name: `T${i + 1}`, seats: i % 2 ? 4 : 2, section: "Main" as const })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, seats: 4, section: "Patio" as const })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: `b${i + 1}`, name: `B${i + 1}`, seats: 2, section: "Bar" as const })),
];

const initialState: State = { menu: seedMenu, tables: seedTables, orders: [] };

type Action =
  | { type: "HYDRATE"; payload: State }
  | { type: "CREATE_ORDER"; payload: Order }
  | { type: "ADD_ITEM"; orderId: string; item: OrderItem }
  | { type: "UPDATE_QTY"; orderId: string; itemId: string; qty: number }
  | { type: "REMOVE_ITEM"; orderId: string; itemId: string }
  | { type: "SEND_KOT"; orderId: string }
  | { type: "ADVANCE_ITEM"; orderId: string; itemId: string }
  | { type: "PAY"; orderId: string; method: "cash" | "card" | "upi"; discountPct: number }
  | { type: "VOID_ORDER"; orderId: string }
  | { type: "UPSERT_MENU"; item: MenuItem }
  | { type: "DELETE_MENU"; id: string }
  | { type: "ADJUST_STOCK"; id: string; delta: number }
  | { type: "RESET" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "HYDRATE":
      return action.payload;
    case "CREATE_ORDER":
      return { ...state, orders: [...state.orders, action.payload] };
    case "ADD_ITEM":
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.id !== action.orderId) return o;
          const existing = o.items.find((i) => i.menuItemId === action.item.menuItemId && i.status === "new");
          if (existing) {
            return { ...o, items: o.items.map((i) => (i.id === existing.id ? { ...i, qty: i.qty + action.item.qty } : i)) };
          }
          return { ...o, items: [...o.items, action.item] };
        }),
      };
    case "UPDATE_QTY":
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId
            ? { ...o, items: o.items.map((i) => (i.id === action.itemId ? { ...i, qty: Math.max(1, action.qty) } : i)) }
            : o,
        ),
      };
    case "REMOVE_ITEM":
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId ? { ...o, items: o.items.filter((i) => i.id !== action.itemId) } : o,
        ),
      };
    case "SEND_KOT":
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId
            ? { ...o, items: o.items.map((i) => (i.status === "new" ? { ...i, status: "sent" } : i)) }
            : o,
        ),
      };
    case "ADVANCE_ITEM": {
      const next: Record<OrderItem["status"], OrderItem["status"]> = {
        new: "sent",
        sent: "preparing",
        preparing: "ready",
        ready: "served",
        served: "served",
      };
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId
            ? { ...o, items: o.items.map((i) => (i.id === action.itemId ? { ...i, status: next[i.status] } : i)) }
            : o,
        ),
      };
    }
    case "PAY":
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId
            ? { ...o, status: "paid", paymentMethod: action.method, discountPct: action.discountPct, closedAt: Date.now() }
            : o,
        ),
        menu: state.menu.map((m) => {
          const order = state.orders.find((o) => o.id === action.orderId);
          if (!order) return m;
          const used = order.items.filter((i) => i.menuItemId === m.id).reduce((s, i) => s + i.qty, 0);
          return used ? { ...m, stock: Math.max(0, m.stock - used) } : m;
        }),
      };
    case "VOID_ORDER":
      return { ...state, orders: state.orders.map((o) => (o.id === action.orderId ? { ...o, status: "void", closedAt: Date.now() } : o)) };
    case "UPSERT_MENU":
      return state.menu.find((m) => m.id === action.item.id)
        ? { ...state, menu: state.menu.map((m) => (m.id === action.item.id ? action.item : m)) }
        : { ...state, menu: [...state.menu, action.item] };
    case "DELETE_MENU":
      return { ...state, menu: state.menu.filter((m) => m.id !== action.id) };
    case "ADJUST_STOCK":
      return { ...state, menu: state.menu.map((m) => (m.id === action.id ? { ...m, stock: Math.max(0, m.stock + action.delta) } : m)) };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

interface Ctx extends State {
  dispatch: React.Dispatch<Action>;
  openOrderForTable: (tableId: string) => Order;
  openTakeawayOrder: (customerName: string) => Order;
  getOrderTotals: (order: Order) => { subtotal: number; discount: number; tax: number; total: number };
}

const StoreContext = createContext<Ctx | null>(null);

export function PosStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) dispatch({ type: "HYDRATE", payload: JSON.parse(raw) as State });
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const value = useMemo<Ctx>(() => {
    const openOrderForTable = (tableId: string) => {
      const existing = state.orders.find((o) => o.type === "dine-in" && o.tableId === tableId && o.status === "open");
      if (existing) return existing;
      const order: Order = {
        id: `o-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "dine-in",
        tableId,
        items: [],
        status: "open",
        createdAt: Date.now(),
        discountPct: 0,
        taxPct: 8,
      };
      dispatch({ type: "CREATE_ORDER", payload: order });
      return order;
    };
    const openTakeawayOrder = (customerName: string) => {
      const order: Order = {
        id: `o-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "takeaway",
        customerName,
        items: [],
        status: "open",
        createdAt: Date.now(),
        discountPct: 0,
        taxPct: 8,
      };
      dispatch({ type: "CREATE_ORDER", payload: order });
      return order;
    };
    const getOrderTotals = (order: Order) => {
      const subtotal = order.items.reduce((s, i) => s + i.price * i.qty, 0);
      const discount = subtotal * (order.discountPct / 100);
      const tax = (subtotal - discount) * (order.taxPct / 100);
      const total = subtotal - discount + tax;
      return { subtotal, discount, tax, total };
    };
    return { ...state, dispatch, openOrderForTable, openTakeawayOrder, getOrderTotals };
  }, [state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function usePos() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("usePos must be inside PosStoreProvider");
  return ctx;
}

export function newOrderItem(menuItem: MenuItem, qty = 1): OrderItem {
  return {
    id: `i-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    menuItemId: menuItem.id,
    name: menuItem.name,
    price: menuItem.price,
    qty,
    station: menuItem.station,
    status: "new",
  };
}

export function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`;
}