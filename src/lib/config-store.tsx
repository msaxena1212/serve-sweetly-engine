/**
 * config-store.tsx
 * Central configuration store for all runtime-configurable data points.
 * Persisted to localStorage under "pos-config-v1".
 *
 * All components should read from this store instead of using hardcoded arrays.
 */

import { createContext, useContext, useEffect, useReducer, useMemo, type ReactNode } from "react";

// ─── Types ─────────────────────────────────────────────────────

export interface MenuCategory {
  id: string;
  name: string;
  color?: string;
  active: boolean;
  sortOrder: number;
}

export interface KitchenStation {
  id: string;
  name: string;
  printer?: string;
  active: boolean;
  sortOrder: number;
}

export interface TableSection {
  id: string;
  name: string;
  prefix: string; // e.g. "T", "P", "B"
  active: boolean;
  sortOrder: number;
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: "cash" | "card" | "upi" | "custom";
  active: boolean;
  requiresReference?: boolean; // e.g. UPI transaction ID
}

export interface StaffRole {
  id: string;
  name: string;
  label: string;
  permissions: string[];
  active: boolean;
}

export interface TaxSlab {
  id: string;
  name: string;           // e.g. "GST 5%", "GST 12%", "GST 18%"
  rate: number;
  isDefault: boolean;
  active: boolean;
}

export interface DiscountType {
  id: string;
  name: string;
  type: "percentage" | "flat";
  maxValue: number;        // max % or max ₹
  requiresApproval: boolean;
  active: boolean;
}

export interface RestaurantConfig {
  name: string;
  branch: string;
  address: string;
  phone: string;
  email: string;
  gstNo: string;
  fssaiNo: string;
  currency: string;        // "₹"
  currencyCode: string;    // "INR"
  locale: string;          // "en-IN"
}

export interface KDSConfig {
  refreshIntervalSec: number;  // polling interval
  slaWarningMin: number;       // yellow threshold
  slaCriticalMin: number;      // red/pulse threshold
  autoAdvanceOnServe: boolean;
}

export interface BillingConfig {
  defaultTaxPct: number;
  serviceChargePct: number;
  defaultDiscountPct: number;
  roundOffBill: boolean;
  printReceiptOnPay: boolean;
  splitBillEnabled: boolean;
  autoKotPrint: boolean;
}

export interface TakeawayConfig {
  tokenMax: number;          // token number wraps at this value
  requirePhone: boolean;
  enableDelivery: boolean;
  defaultPrepTimeMins: number;
}

export interface ShiftConfig {
  requireOpenShift: boolean;
  cashCountOnOpen: boolean;
  cashCountOnClose: boolean;
  breakDurationMins: number;
}

export interface AppConfig {
  restaurant: RestaurantConfig;
  categories: MenuCategory[];
  stations: KitchenStation[];
  tableSections: TableSection[];
  paymentMethods: PaymentMethod[];
  staffRoles: StaffRole[];
  taxSlabs: TaxSlab[];
  discountTypes: DiscountType[];
  kds: KDSConfig;
  billing: BillingConfig;
  takeaway: TakeawayConfig;
  shift: ShiftConfig;
}

// ─── Default Configuration ─────────────────────────────────────

export const DEFAULT_CONFIG: AppConfig = {
  restaurant: {
    name: "Forno",
    branch: "Main Street Branch",
    address: "123 Main Street, Mumbai 400001",
    phone: "+91 98765 43210",
    email: "orders@forno.in",
    gstNo: "27AAPFU0939F1ZV",
    fssaiNo: "11512325000491",
    currency: "₹",
    currencyCode: "INR",
    locale: "en-IN",
  },
  categories: [
    { id: "cat-1", name: "Starters",  color: "#f97316", active: true, sortOrder: 1 },
    { id: "cat-2", name: "Mains",     color: "#ef4444", active: true, sortOrder: 2 },
    { id: "cat-3", name: "Sides",     color: "#84cc16", active: true, sortOrder: 3 },
    { id: "cat-4", name: "Desserts",  color: "#ec4899", active: true, sortOrder: 4 },
    { id: "cat-5", name: "Beverages", color: "#3b82f6", active: true, sortOrder: 5 },
  ],
  stations: [
    { id: "stn-1", name: "Kitchen", printer: "KT-Printer-1", active: true, sortOrder: 1 },
    { id: "stn-2", name: "Tandoor", printer: "KT-Printer-1", active: true, sortOrder: 2 },
    { id: "stn-3", name: "Bar",     printer: "Bar-Printer-1", active: true, sortOrder: 3 },
  ],
  tableSections: [
    { id: "sec-1", name: "Main",  prefix: "T", active: true, sortOrder: 1 },
    { id: "sec-2", name: "Patio", prefix: "P", active: true, sortOrder: 2 },
    { id: "sec-3", name: "Bar",   prefix: "B", active: true, sortOrder: 3 },
  ],
  paymentMethods: [
    { id: "pm-1", name: "Cash",       type: "cash", active: true },
    { id: "pm-2", name: "Card",       type: "card", active: true, requiresReference: false },
    { id: "pm-3", name: "UPI",        type: "upi",  active: true, requiresReference: true },
    { id: "pm-4", name: "Zomato Pay", type: "custom", active: false },
    { id: "pm-5", name: "Swiggy Pay", type: "custom", active: false },
  ],
  staffRoles: [
    { id: "role-1", name: "owner",   label: "Owner",   permissions: ["*"],                                          active: true },
    { id: "role-2", name: "manager", label: "Manager", permissions: ["pos", "kds", "inventory", "reports", "void"], active: true },
    { id: "role-3", name: "cashier", label: "Cashier", permissions: ["pos", "payment", "shift"],                    active: true },
    { id: "role-4", name: "waiter",  label: "Waiter",  permissions: ["pos", "table", "kot"],                        active: true },
    { id: "role-5", name: "kitchen", label: "Kitchen", permissions: ["kds"],                                        active: true },
  ],
  taxSlabs: [
    { id: "tax-1", name: "GST 5%",  rate: 5,  isDefault: false, active: true },
    { id: "tax-2", name: "GST 12%", rate: 12, isDefault: false, active: true },
    { id: "tax-3", name: "GST 18%", rate: 18, isDefault: true,  active: true },
    { id: "tax-4", name: "No Tax",  rate: 0,  isDefault: false, active: true },
  ],
  discountTypes: [
    { id: "disc-1", name: "Happy Hour",      type: "percentage", maxValue: 20, requiresApproval: false, active: true },
    { id: "disc-2", name: "Staff Meal",      type: "percentage", maxValue: 50, requiresApproval: true,  active: true },
    { id: "disc-3", name: "Manager Promo",   type: "percentage", maxValue: 30, requiresApproval: true,  active: true },
    { id: "disc-4", name: "Flat Discount",   type: "flat",       maxValue: 500, requiresApproval: true, active: true },
  ],
  kds: {
    refreshIntervalSec: 3,
    slaWarningMin: 10,
    slaCriticalMin: 20,
    autoAdvanceOnServe: false,
  },
  billing: {
    defaultTaxPct: 18,
    serviceChargePct: 5,
    defaultDiscountPct: 0,
    roundOffBill: true,
    printReceiptOnPay: true,
    splitBillEnabled: true,
    autoKotPrint: false,
  },
  takeaway: {
    tokenMax: 99,
    requirePhone: false,
    enableDelivery: false,
    defaultPrepTimeMins: 20,
  },
  shift: {
    requireOpenShift: true,
    cashCountOnOpen: true,
    cashCountOnClose: true,
    breakDurationMins: 30,
  },
};

// ─── Reducer ───────────────────────────────────────────────────

type ConfigAction =
  | { type: "HYDRATE"; payload: AppConfig }
  | { type: "SET_RESTAURANT"; data: Partial<RestaurantConfig> }
  | { type: "SET_KDS"; data: Partial<KDSConfig> }
  | { type: "SET_BILLING"; data: Partial<BillingConfig> }
  | { type: "SET_TAKEAWAY"; data: Partial<TakeawayConfig> }
  | { type: "SET_SHIFT"; data: Partial<ShiftConfig> }
  // Categories
  | { type: "ADD_CATEGORY"; item: MenuCategory }
  | { type: "UPDATE_CATEGORY"; item: MenuCategory }
  | { type: "DELETE_CATEGORY"; id: string }
  | { type: "REORDER_CATEGORIES"; ids: string[] }
  // Stations
  | { type: "ADD_STATION"; item: KitchenStation }
  | { type: "UPDATE_STATION"; item: KitchenStation }
  | { type: "DELETE_STATION"; id: string }
  // Table Sections
  | { type: "ADD_SECTION"; item: TableSection }
  | { type: "UPDATE_SECTION"; item: TableSection }
  | { type: "DELETE_SECTION"; id: string }
  // Payment Methods
  | { type: "ADD_PAYMENT_METHOD"; item: PaymentMethod }
  | { type: "UPDATE_PAYMENT_METHOD"; item: PaymentMethod }
  | { type: "DELETE_PAYMENT_METHOD"; id: string }
  // Staff Roles
  | { type: "ADD_STAFF_ROLE"; item: StaffRole }
  | { type: "UPDATE_STAFF_ROLE"; item: StaffRole }
  | { type: "DELETE_STAFF_ROLE"; id: string }
  // Tax Slabs
  | { type: "ADD_TAX_SLAB"; item: TaxSlab }
  | { type: "UPDATE_TAX_SLAB"; item: TaxSlab }
  | { type: "DELETE_TAX_SLAB"; id: string }
  | { type: "SET_DEFAULT_TAX"; id: string }
  // Discount Types
  | { type: "ADD_DISCOUNT_TYPE"; item: DiscountType }
  | { type: "UPDATE_DISCOUNT_TYPE"; item: DiscountType }
  | { type: "DELETE_DISCOUNT_TYPE"; id: string }
  | { type: "RESET_CONFIG" };

function configReducer(state: AppConfig, action: ConfigAction): AppConfig {
  switch (action.type) {
    case "HYDRATE": return action.payload;
    case "RESET_CONFIG": return DEFAULT_CONFIG;

    case "SET_RESTAURANT": return { ...state, restaurant: { ...state.restaurant, ...action.data } };
    case "SET_KDS": return { ...state, kds: { ...state.kds, ...action.data } };
    case "SET_BILLING": return { ...state, billing: { ...state.billing, ...action.data } };
    case "SET_TAKEAWAY": return { ...state, takeaway: { ...state.takeaway, ...action.data } };
    case "SET_SHIFT": return { ...state, shift: { ...state.shift, ...action.data } };

    // Categories
    case "ADD_CATEGORY": return { ...state, categories: [...state.categories, action.item] };
    case "UPDATE_CATEGORY": return { ...state, categories: state.categories.map(c => c.id === action.item.id ? action.item : c) };
    case "DELETE_CATEGORY": return { ...state, categories: state.categories.filter(c => c.id !== action.id) };
    case "REORDER_CATEGORIES": return { ...state, categories: action.ids.map((id, i) => ({ ...state.categories.find(c => c.id === id)!, sortOrder: i + 1 })) };

    // Stations
    case "ADD_STATION": return { ...state, stations: [...state.stations, action.item] };
    case "UPDATE_STATION": return { ...state, stations: state.stations.map(s => s.id === action.item.id ? action.item : s) };
    case "DELETE_STATION": return { ...state, stations: state.stations.filter(s => s.id !== action.id) };

    // Table Sections
    case "ADD_SECTION": return { ...state, tableSections: [...state.tableSections, action.item] };
    case "UPDATE_SECTION": return { ...state, tableSections: state.tableSections.map(s => s.id === action.item.id ? action.item : s) };
    case "DELETE_SECTION": return { ...state, tableSections: state.tableSections.filter(s => s.id !== action.id) };

    // Payment Methods
    case "ADD_PAYMENT_METHOD": return { ...state, paymentMethods: [...state.paymentMethods, action.item] };
    case "UPDATE_PAYMENT_METHOD": return { ...state, paymentMethods: state.paymentMethods.map(p => p.id === action.item.id ? action.item : p) };
    case "DELETE_PAYMENT_METHOD": return { ...state, paymentMethods: state.paymentMethods.filter(p => p.id !== action.id) };

    // Staff Roles
    case "ADD_STAFF_ROLE": return { ...state, staffRoles: [...state.staffRoles, action.item] };
    case "UPDATE_STAFF_ROLE": return { ...state, staffRoles: state.staffRoles.map(r => r.id === action.item.id ? action.item : r) };
    case "DELETE_STAFF_ROLE": return { ...state, staffRoles: state.staffRoles.filter(r => r.id !== action.id) };

    // Tax Slabs
    case "ADD_TAX_SLAB": return { ...state, taxSlabs: [...state.taxSlabs, action.item] };
    case "UPDATE_TAX_SLAB": return { ...state, taxSlabs: state.taxSlabs.map(t => t.id === action.item.id ? action.item : t) };
    case "DELETE_TAX_SLAB": return { ...state, taxSlabs: state.taxSlabs.filter(t => t.id !== action.id) };
    case "SET_DEFAULT_TAX": return { ...state, taxSlabs: state.taxSlabs.map(t => ({ ...t, isDefault: t.id === action.id })) };

    // Discount Types
    case "ADD_DISCOUNT_TYPE": return { ...state, discountTypes: [...state.discountTypes, action.item] };
    case "UPDATE_DISCOUNT_TYPE": return { ...state, discountTypes: state.discountTypes.map(d => d.id === action.item.id ? action.item : d) };
    case "DELETE_DISCOUNT_TYPE": return { ...state, discountTypes: state.discountTypes.filter(d => d.id !== action.id) };

    default: return state;
  }
}

// ─── Context ───────────────────────────────────────────────────

const CONFIG_STORAGE_KEY = "pos-config-v1";

interface ConfigCtx {
  config: AppConfig;
  dispatch: React.Dispatch<ConfigAction>;
}

const ConfigContext = createContext<ConfigCtx | null>(null);

export function ConfigStoreProvider({ children }: { children: ReactNode }) {
  const [config, dispatch] = useReducer(configReducer, DEFAULT_CONFIG);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(CONFIG_STORAGE_KEY) : null;
      if (raw) {
        const saved = JSON.parse(raw) as AppConfig;
        // Deep merge saved config with defaults to handle newly added keys
        dispatch({ type: "HYDRATE", payload: deepMerge(DEFAULT_CONFIG, saved) });
      }
    } catch { /* ignore */ }
  }, []);

  // Persist on every change
  useEffect(() => {
    try {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch { /* ignore */ }
  }, [config]);

  const value = useMemo(() => ({ config, dispatch }), [config]);
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be inside ConfigStoreProvider");
  return ctx;
}

// ─── Helpers ───────────────────────────────────────────────────

/** Shallow-merge saved keys into defaults (so new default keys aren't lost). */
function deepMerge<T extends Record<string, any>>(defaults: T, saved: Partial<T>): T {
  const result = { ...defaults };
  for (const key of Object.keys(saved) as (keyof T)[]) {
    if (
      key in defaults &&
      typeof defaults[key] === "object" &&
      !Array.isArray(defaults[key]) &&
      defaults[key] !== null &&
      saved[key] !== null &&
      typeof saved[key] === "object" &&
      !Array.isArray(saved[key])
    ) {
      result[key] = deepMerge(defaults[key], saved[key] as any);
    } else {
      result[key] = saved[key] as T[keyof T];
    }
  }
  return result;
}

/** Unique id generator for new config items */
export function newConfigId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
}
