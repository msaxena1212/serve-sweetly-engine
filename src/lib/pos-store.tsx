import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";

export type MenuCategory = string;
export type Station = string;

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: MenuCategory;
  station: Station;
  available: boolean;
  stock: number; // simplistic inventory
  taxSlabId?: string; // optional tax slab identifier
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

export interface OrderPayment {
  id: string;
  amount: number;
  method: string;
  createdAt: number;
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
  paymentMethod?: string;
  payments?: OrderPayment[];
  discountPct: number;
  taxPct: number;
}

export interface Table {
  id: string;
  name: string;
  seats: number;
  section: string; // dynamic — matches config.tableSections names
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
  // Main floor — 16 tables (T1–T16)
  ...Array.from({ length: 16 }, (_, i) => ({
    id: `t${i + 1}`,
    name: `T${i + 1}`,
    seats: i % 3 === 0 ? 6 : i % 2 === 0 ? 4 : 2,
    section: "Main" as const,
  })),
  // Patio — 8 tables (P1–P8)
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    seats: i < 4 ? 4 : 6,
    section: "Patio" as const,
  })),
  // Bar — 6 seats/stools (B1–B6)
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `b${i + 1}`,
    name: `B${i + 1}`,
    seats: 2,
    section: "Bar" as const,
  })),
];

const initialState: State = { menu: seedMenu, tables: seedTables, orders: [] };

function calculateOrderTotal(items: OrderItem[], discountPct: number, taxPct: number) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = subtotal * (discountPct / 100);
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * (taxPct / 100);
  const total = taxable + tax;
  return { subtotal, discount, tax, total };
}

type Action =
  | { type: "HYDRATE"; payload: State }
  | { type: "CREATE_ORDER"; payload: Order }
  | { type: "ADD_ITEM"; orderId: string; item: OrderItem }
  | { type: "UPDATE_QTY"; orderId: string; itemId: string; qty: number }
  | { type: "REMOVE_ITEM"; orderId: string; itemId: string }
  | { type: "SEND_KOT"; orderId: string }
  | { type: "ADVANCE_ITEM"; orderId: string; itemId: string }
  | { type: "PARTIAL_PAYMENT"; orderId: string; method: string; discountPct: number; amount: number }
  | { type: "SPLIT_PAYMENT"; orderId: string; discountPct: number; payments: Array<{ method: string; amount: number }>; closeOrder: boolean }
  | { type: "PAY"; orderId: string; method: string; discountPct: number }
  | { type: "VOID_ORDER"; orderId: string }
  | { type: "UPSERT_MENU"; item: MenuItem }
  | { type: "DELETE_MENU"; id: string }
  | { type: "ADJUST_STOCK"; id: string; delta: number }
  | { type: "UPDATE_NOTES"; orderId: string; itemId: string; notes: string }
  | { type: "TRANSFER_TABLE"; orderId: string; newTableId: string }
  | { type: "MERGE_TABLES"; sourceOrderId: string; targetOrderId: string }
  | { type: "ADD_TABLE"; table: Table }
  | { type: "UPDATE_TABLE"; table: Table }
  | { type: "DELETE_TABLE"; id: string }
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
          const existing = o.items.find((i) => i.menuItemId === action.item.menuItemId && i.status === "new" && i.notes === action.item.notes);
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
    case "UPDATE_NOTES":
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId
            ? { ...o, items: o.items.map((i) => (i.id === action.itemId ? { ...i, notes: action.notes } : i)) }
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
    case "PARTIAL_PAYMENT":
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId
            ? {
                ...o,
                paymentMethod: action.method,
                discountPct: action.discountPct,
                payments: [
                  ...(o.payments ?? []),
                  {
                    id: `pay-${Date.now()}`,
                    amount: action.amount,
                    method: action.method,
                    createdAt: Date.now(),
                  },
                ],
              }
            : o,
        ),
      };
    case "SPLIT_PAYMENT": {
      const now = Date.now();
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId
            ? {
                ...o,
                status: action.closeOrder ? "paid" : o.status,
                paymentMethod: "split",
                discountPct: action.discountPct,
                payments: [
                  ...(o.payments ?? []),
                  ...action.payments.map((payment, index) => ({
                    id: `pay-${now}-${index}`,
                    amount: payment.amount,
                    method: payment.method,
                    createdAt: now,
                  })),
                ],
                closedAt: action.closeOrder ? now : o.closedAt,
              }
            : o,
        ),
        menu: action.closeOrder
          ? state.menu.map((m) => {
              const order = state.orders.find((o) => o.id === action.orderId);
              if (!order) return m;
              const used = order.items.filter((i) => i.menuItemId === m.id).reduce((s, i) => s + i.qty, 0);
              return used ? { ...m, stock: Math.max(0, m.stock - used) } : m;
            })
          : state.menu,
      };
    }
    case "PAY":
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId
            ? {
                ...o,
                status: "paid",
                paymentMethod: action.method,
                discountPct: action.discountPct,
                payments: [
                  ...(o.payments ?? []),
                  {
                    id: `pay-${Date.now()}`,
                    amount: Math.max(
                      0,
                      calculateOrderTotal(o.items, action.discountPct, o.taxPct).total -
                        (o.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0),
                    ),
                    method: action.method,
                    createdAt: Date.now(),
                  },
                ],
                closedAt: Date.now(),
              }
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
    case "TRANSFER_TABLE":
      return {
        ...state,
        orders: state.orders.map((o) => (o.id === action.orderId ? { ...o, tableId: action.newTableId } : o)),
      };
    case "MERGE_TABLES": {
      const source = state.orders.find((o) => o.id === action.sourceOrderId);
      if (!source) return state;
      return {
        ...state,
        orders: state.orders.map((o) => {
          if (o.id === action.targetOrderId) {
            return { ...o, items: [...o.items, ...source.items] };
          }
          if (o.id === action.sourceOrderId) {
            return { ...o, status: "void", closedAt: Date.now() };
          }
          return o;
        }),
      };
    }
    case "ADD_TABLE":
      return { ...state, tables: [...state.tables, action.table] };
    case "UPDATE_TABLE":
      return { ...state, tables: state.tables.map((t) => (t.id === action.table.id ? action.table : t)) };
    case "DELETE_TABLE":
      return { ...state, tables: state.tables.filter((t) => t.id !== action.id) };
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
  openOrderForTable: (tableId: string) => Promise<Order>;
  openTakeawayOrder: (customerName: string, customerPhone?: string) => Promise<Order>;
  getOrderTotals: (order: Order) => { subtotal: number; discount: number; tax: number; total: number; paid: number; balance: number };
}

const StoreContext = createContext<Ctx | null>(null);

import { getMenuFn, getTablesFn } from './api';
import { useConfig } from './config-store';

// Cache menu/tables for 3 minutes to avoid re-fetching on every page navigation
const CACHE_TTL_MS = 3 * 60 * 1000;
let lastFetchedAt = 0;

export function PosStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { config } = useConfig();

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) dispatch({ type: "HYDRATE", payload: JSON.parse(raw) as State });

      const now = Date.now();
      const shouldRefetch = now - lastFetchedAt > CACHE_TTL_MS;

      if (shouldRefetch) {
        // Fetch fresh data from DB to override local storage menu/tables
        Promise.all([getMenuFn(), getTablesFn({ data: { branchId: config.activeBranchId } })]).then(([dbMenu, dbTables]) => {
          lastFetchedAt = Date.now();
          dispatch({ 
            type: "HYDRATE", 
            payload: {
              ...JSON.parse(raw || '{"orders": []}'),
              orders: raw ? JSON.parse(raw).orders : [],
              menu: dbMenu as any,
              tables: dbTables as any
            }
          });
        });
      }
    } catch {}
  }, [config.activeBranchId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const value = useMemo<Ctx>(() => {
    const openOrderForTable = async (tableId: string) => {
      const existing = state.orders.find((o) => o.type === "dine-in" && o.tableId === tableId && o.status === "open");
      if (existing) return existing;

      // Create in DB first, use real DB ID
      let dbId = `o-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        const { createOrderFn } = await import('./api');
        const res = await createOrderFn({ data: { type: 'dine-in', tableId, branchId: config.activeBranchId } });
        dbId = res.id;
      } catch (err) {
        console.error('Failed to save order to DB', err);
      }

      const order: Order = {
        id: dbId,
        type: "dine-in",
        tableId,
        items: [],
        status: "open",
        createdAt: Date.now(),
        discountPct: config.billing.defaultDiscountPct,
        taxPct: config.billing.defaultTaxPct,
      };
      dispatch({ type: "CREATE_ORDER", payload: order });
      return order;
    };
    const openTakeawayOrder = async (customerName: string, customerPhone?: string) => {
      // Create in DB first, use real DB ID
      let dbId = `o-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        const { createOrderFn } = await import('./api');
        const res = await createOrderFn({ data: { type: 'takeaway', customerName, customerPhone, branchId: config.activeBranchId } });
        dbId = res.id;
      } catch (err) {
        console.error('Failed to save takeaway order to DB', err);
      }

      const order: Order = {
        id: dbId,
        type: "takeaway",
        customerName,
        items: [],
        status: "open",
        createdAt: Date.now(),
        discountPct: config.billing.defaultDiscountPct,
        taxPct: config.billing.defaultTaxPct,
      };
      dispatch({ type: "CREATE_ORDER", payload: order });
      return order;
    };
    const getOrderTotals = (order: Order) => {
      const totals = calculateOrderTotal(order.items, order.discountPct, order.taxPct);
      const paid = (order.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
      return { ...totals, paid, balance: Math.max(0, totals.total - paid) };
    };
    return { ...state, dispatch, openOrderForTable, openTakeawayOrder, getOrderTotals };
  }, [state, config.billing]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function usePos() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("usePos must be inside PosStoreProvider");
  return ctx;
}

export function newOrderItem(menuItem: MenuItem, qty = 1, notes?: string): OrderItem {
  return {
    id: `i-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    menuItemId: menuItem.id,
    name: menuItem.name,
    price: menuItem.price,
    qty,
    station: menuItem.station,
    status: "new",
    notes,
  };
}

export function fmtMoney(n: number) {
  return `₹${n.toFixed(2)}`;
}
