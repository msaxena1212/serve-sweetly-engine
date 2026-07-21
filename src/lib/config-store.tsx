/**
 * config-store.tsx
 * Central configuration store for all runtime-configurable data points.
 * Persisted to localStorage under "pos-config-v1".
 *
 * All components should read from this store instead of using hardcoded arrays.
 */

import { createContext, useContext, useEffect, useReducer, useMemo, useCallback, type ReactNode } from "react";
import {
  getStationsFn, getTableSectionsFn, getPaymentMethodsFn, getTaxSlabsFn,
  getCategoriesFn, getSystemConfigFn,
  upsertStationFn, deleteStationFn,
  upsertTableSectionFn, deleteTableSectionFn,
  upsertPaymentMethodFn, deletePaymentMethodFn,
  upsertTaxSlabFn, deleteTaxSlabFn,
  upsertCategoryFn, deleteCategoryFn,
  setSystemConfigFn,
} from './api';

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
  branch: string;              // Used as fallback or location name
  address: string;
  phone: string;
  email: string;
  gstNo: string;
  fssaiNo: string;
  currency: string;            // '₹' or '$'
  currencyCode: string;        // 'INR' or 'USD'
  locale: string;
  website?: string;
  whatsapp?: string;
  logoUrl?: string;
  receiptFooter?: string;
  openTime?: string;
  closeTime?: string;
  weeklyOff?: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  gstNo: string;
  active: boolean;
  isMain: boolean;
}

export interface KDSConfig {
  refreshIntervalSec: number;  // polling interval
  slaWarningMin: number;       // yellow threshold
  slaCriticalMin: number;      // red/pulse threshold
  autoAdvanceOnServe: boolean;
  soundAlerts: boolean;        // play beep on new KOT
  bumpScreenMode: boolean;     // full-screen bump-only display
  showItemNotes: boolean;      // show special instructions inline
  groupByStation: boolean;     // auto-group by kitchen station
}

export interface BillingConfig {
  defaultTaxPct: number;
  serviceChargePct: number;
  defaultDiscountPct: number;
  roundOffBill: boolean;
  printReceiptOnPay: boolean;
  splitBillEnabled: boolean;
  autoKotPrint: boolean;
  billPrefix: string;          // e.g. "INV-" → INV-0001
  billStartNumber: number;     // starting bill number
  minimumOrderValue: number;   // 0 = no minimum
  loyaltyEnabled: boolean;     // master toggle for loyalty
  showTaxBreakdown: boolean;   // show CGST/SGST split on receipt
  allowVoidWithoutManager: boolean;
  coverChargePerHead: number;  // dine-in cover charge ₹
}

export interface TakeawayConfig {
  tokenMax: number;          // token number wraps at this value
  requirePhone: boolean;
  enableDelivery: boolean;
  defaultPrepTimeMins: number;
  packagingCharge: number;   // flat ₹ per order
  deliveryChargeFlatRate: number;
  freeDeliveryAbove: number; // 0 = always charge
  deliveryRadiusKm: number;  // 0 = unlimited
  requireDeliveryAddress: boolean;
  defaultOrderType: "dine-in" | "takeaway" | "delivery";
}

export interface ShiftConfig {
  requireOpenShift: boolean;
  cashCountOnOpen: boolean;
  cashCountOnClose: boolean;
  breakDurationMins: number;
  maxShiftHours: number;       // alert after N hours (0 = off)
  overtimeThresholdHours: number;
  pettyCashLimit: number;      // max petty cash disbursement per shift
  allowMultipleOpenShifts: boolean;
  autoCloseShiftAfterHours: number; // 0 = never
}

export interface Printer {
  id: string;
  name: string;               // Display name
  ipAddress: string;          // IP or USB path
  port: number;               // 9100 default
  type: "receipt" | "kot" | "both";
  paperWidth: "58mm" | "80mm";
  active: boolean;
}

export interface OnlineOrderChannel {
  id: string;
  name: string;               // "Zomato", "Swiggy", etc.
  platformFeePercent: number; // commission % charged by platform
  active: boolean;
  autoAccept: boolean;        // auto-accept incoming orders
  printerName: string;        // linked printer name
}

export interface LoyaltyConfig {
  enabled: boolean;
  pointsPerRupee: number;     // e.g. 1 point per ₹10 spent
  rupeePerPoint: number;      // redemption: 1 point = ₹ value
  minPointsToRedeem: number;  // minimum threshold
  expiryDays: number;         // 0 = no expiry
  earnOnDiscountedBills: boolean;
  redeemOnDelivery: boolean;
}

export interface AppConfig {
  restaurant: RestaurantConfig;
  branches: Branch[];
  activeBranchId: string;
  categories: MenuCategory[];
  stations: KitchenStation[];
  tableSections: TableSection[];
  paymentMethods: PaymentMethod[];
  staffRoles: StaffRole[];
  taxSlabs: TaxSlab[];
  discountTypes: DiscountType[];
  printers: Printer[];
  onlineChannels: OnlineOrderChannel[];
  kds: KDSConfig;
  billing: BillingConfig;
  takeaway: TakeawayConfig;
  shift: ShiftConfig;
  loyalty: LoyaltyConfig;
}

// ─── Default Configuration ─────────────────────────────────────

export const DEFAULT_CONFIG: AppConfig = {
  restaurant: {
    name: "Forno",
    branch: "Main Street Branch",
    address: "123 Main Street, Mumbai 400001",
    phone: "+91 98765 43210",
    email: "orders@forno.in",
    website: "https://forno.in",
    whatsapp: "+91 98765 43210",
    gstNo: "27AAPFU0939F1ZV",
    fssaiNo: "11512325000491",
    currency: "₹",
    currencyCode: "INR",
    locale: "en-IN",
    logoUrl: "",
    receiptFooter: "Thank you for dining with us! Visit again soon.",
    openTime: "09:00",
    closeTime: "23:00",
    weeklyOff: "Sunday",
  },
  branches: [
    {
      id: "br-1",
      name: "Main Branch",
      code: "HQ",
      address: "123 Main Street",
      phone: "1234567890",
      email: "hello@example.com",
      gstNo: "",
      active: true,
      isMain: true,
    }
  ],
  activeBranchId: "br-1",
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
  printers: [
    { id: "ptr-1", name: "Bill Printer", ipAddress: "192.168.1.100", port: 9100, type: "receipt", paperWidth: "80mm", active: true },
    { id: "ptr-2", name: "KOT Printer",  ipAddress: "192.168.1.101", port: 9100, type: "kot",     paperWidth: "80mm", active: true },
  ],
  onlineChannels: [
    { id: "oc-1", name: "Zomato", platformFeePercent: 18, active: false, autoAccept: false, printerName: "KOT Printer" },
    { id: "oc-2", name: "Swiggy", platformFeePercent: 22, active: false, autoAccept: false, printerName: "KOT Printer" },
  ],
  kds: {
    refreshIntervalSec: 3,
    slaWarningMin: 10,
    slaCriticalMin: 20,
    autoAdvanceOnServe: false,
    soundAlerts: true,
    bumpScreenMode: false,
    showItemNotes: true,
    groupByStation: false,
  },
  billing: {
    defaultTaxPct: 18,
    serviceChargePct: 5,
    defaultDiscountPct: 0,
    roundOffBill: true,
    printReceiptOnPay: true,
    splitBillEnabled: true,
    autoKotPrint: false,
    billPrefix: "INV-",
    billStartNumber: 1,
    minimumOrderValue: 0,
    loyaltyEnabled: false,
    showTaxBreakdown: true,
    allowVoidWithoutManager: false,
    coverChargePerHead: 0,
  },
  takeaway: {
    tokenMax: 99,
    requirePhone: false,
    enableDelivery: false,
    defaultPrepTimeMins: 20,
    packagingCharge: 0,
    deliveryChargeFlatRate: 40,
    freeDeliveryAbove: 500,
    deliveryRadiusKm: 0,
    requireDeliveryAddress: true,
    defaultOrderType: "dine-in",
  },
  shift: {
    requireOpenShift: true,
    cashCountOnOpen: true,
    cashCountOnClose: true,
    breakDurationMins: 30,
    maxShiftHours: 12,
    overtimeThresholdHours: 9,
    pettyCashLimit: 500,
    allowMultipleOpenShifts: false,
    autoCloseShiftAfterHours: 0,
  },
  loyalty: {
    enabled: false,
    pointsPerRupee: 0.1,
    rupeePerPoint: 0.25,
    minPointsToRedeem: 100,
    expiryDays: 365,
    earnOnDiscountedBills: false,
    redeemOnDelivery: false,
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
  | { type: "SET_LOYALTY"; data: Partial<LoyaltyConfig> }
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
  | { type: "ADD_BRANCH"; item: Branch }
  | { type: "UPDATE_BRANCH"; item: Branch }
  | { type: "DELETE_BRANCH"; id: string }
  | { type: "SET_ACTIVE_BRANCH"; id: string }
  | { type: "ADD_DISCOUNT"; item: DiscountType }
  // Discount Types
  | { type: "ADD_DISCOUNT_TYPE"; item: DiscountType }
  | { type: "UPDATE_DISCOUNT_TYPE"; item: DiscountType }
  | { type: "DELETE_DISCOUNT_TYPE"; id: string }
  // Printers
  | { type: "ADD_PRINTER"; item: Printer }
  | { type: "UPDATE_PRINTER"; item: Printer }
  | { type: "DELETE_PRINTER"; id: string }
  // Online Channels
  | { type: "ADD_ONLINE_CHANNEL"; item: OnlineOrderChannel }
  | { type: "UPDATE_ONLINE_CHANNEL"; item: OnlineOrderChannel }
  | { type: "DELETE_ONLINE_CHANNEL"; id: string }
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
    case "SET_LOYALTY": return { ...state, loyalty: { ...state.loyalty, ...action.data } };

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
    case "UPDATE_TAX_SLAB": return { ...state, taxSlabs: state.taxSlabs.map((t) => (t.id === action.item.id ? action.item : t)) };
    case "DELETE_TAX_SLAB": return { ...state, taxSlabs: state.taxSlabs.filter((t) => t.id !== action.id) };
    case "SET_DEFAULT_TAX": return { ...state, taxSlabs: state.taxSlabs.map((t) => ({ ...t, isDefault: t.id === action.id })) };

    case "ADD_BRANCH": return { ...state, branches: [...(state.branches || []), action.item] };
    case "UPDATE_BRANCH": return { ...state, branches: (state.branches || []).map((b) => (b.id === action.item.id ? action.item : b)) };
    case "DELETE_BRANCH": return { ...state, branches: (state.branches || []).filter((b) => b.id !== action.id) };
    case "SET_ACTIVE_BRANCH": return { ...state, activeBranchId: action.id };

    case "ADD_DISCOUNT": return { ...state, discountTypes: [...state.discountTypes, action.item] };

    // Discount Types
    case "ADD_DISCOUNT_TYPE": return { ...state, discountTypes: [...state.discountTypes, action.item] };
    case "UPDATE_DISCOUNT_TYPE": return { ...state, discountTypes: state.discountTypes.map(d => d.id === action.item.id ? action.item : d) };
    case "DELETE_DISCOUNT_TYPE": return { ...state, discountTypes: state.discountTypes.filter(d => d.id !== action.id) };

    // Printers
    case "ADD_PRINTER": return { ...state, printers: [...(state.printers ?? []), action.item] };
    case "UPDATE_PRINTER": return { ...state, printers: (state.printers ?? []).map(p => p.id === action.item.id ? action.item : p) };
    case "DELETE_PRINTER": return { ...state, printers: (state.printers ?? []).filter(p => p.id !== action.id) };

    // Online Channels
    case "ADD_ONLINE_CHANNEL": return { ...state, onlineChannels: [...(state.onlineChannels ?? []), action.item] };
    case "UPDATE_ONLINE_CHANNEL": return { ...state, onlineChannels: (state.onlineChannels ?? []).map(c => c.id === action.item.id ? action.item : c) };
    case "DELETE_ONLINE_CHANNEL": return { ...state, onlineChannels: (state.onlineChannels ?? []).filter(c => c.id !== action.id) };

    default: return state;
  }
}

// ─── Context ───────────────────────────────────────────────────

const CONFIG_STORAGE_KEY = "pos-config-v1";

interface ConfigCtx {
  config: AppConfig;
  dispatch: React.Dispatch<ConfigAction>;
  syncToDb: () => Promise<void>;
}

const ConfigContext = createContext<ConfigCtx | null>(null);

export function ConfigStoreProvider({ children }: { children: ReactNode }) {
  const [config, dispatch] = useReducer(configReducer, DEFAULT_CONFIG);

  // ── Fast-boot: hydrate from localStorage first ──
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(CONFIG_STORAGE_KEY) : null;
      if (raw) {
        const saved = JSON.parse(raw) as AppConfig;
        dispatch({ type: "HYDRATE", payload: deepMerge(DEFAULT_CONFIG, saved) });
      }
    } catch { /* ignore */ }
  }, []);

  // ── Hydrate from DB on mount (authoritative source) ──
  useEffect(() => {
    async function loadFromDb() {
      try {
        const [dbStations, dbSections, dbPayments, dbTaxSlabs, dbCategories, dbSysConfig] = await Promise.all([
          getStationsFn(),
          getTableSectionsFn(),
          getPaymentMethodsFn(),
          getTaxSlabsFn(),
          getCategoriesFn(),
          getSystemConfigFn(),
        ]);

        dispatch({
          type: "HYDRATE",
          payload: deepMerge(DEFAULT_CONFIG, {
            stations: dbStations.length > 0
              ? dbStations.map((s, i) => ({ id: s.id, name: s.name, active: s.active, sortOrder: i + 1 }))
              : DEFAULT_CONFIG.stations,
            tableSections: dbSections.length > 0
              ? dbSections.map((s, i) => ({ id: s.id, name: s.name, prefix: s.prefix, active: s.active, sortOrder: i + 1 }))
              : DEFAULT_CONFIG.tableSections,
            paymentMethods: dbPayments.length > 0
              ? dbPayments.map(p => ({ id: p.id, name: p.name, type: p.type as PaymentMethod['type'], active: p.active }))
              : DEFAULT_CONFIG.paymentMethods,
            taxSlabs: dbTaxSlabs.length > 0
              ? dbTaxSlabs.map(t => ({ id: t.id, name: t.name, rate: t.rate, isDefault: t.isDefault, active: t.active }))
              : DEFAULT_CONFIG.taxSlabs,
            categories: dbCategories.length > 0
              ? dbCategories.map((c, i) => ({ id: c.id, name: c.name, active: c.active, sortOrder: i + 1 }))
              : DEFAULT_CONFIG.categories,
            kds: (dbSysConfig as any)?.kds ?? DEFAULT_CONFIG.kds,
            billing: (dbSysConfig as any)?.billing ?? DEFAULT_CONFIG.billing,
            takeaway: (dbSysConfig as any)?.takeaway ?? DEFAULT_CONFIG.takeaway,
            shift: (dbSysConfig as any)?.shift ?? DEFAULT_CONFIG.shift,
            restaurant: (dbSysConfig as any)?.restaurant ?? DEFAULT_CONFIG.restaurant,
          } as Partial<AppConfig>),
        });
      } catch {
        // If DB fails (e.g. not logged in yet), fall through — localStorage values remain
      }
    }
    loadFromDb();
  }, []);

  // ── Persist to localStorage as cache ──
  useEffect(() => {
    try {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch { /* ignore */ }
  }, [config]);

  // ── Sync current config to DB ──
  const syncToDb = useCallback(async () => {
    await Promise.all([
      ...config.stations.map(s => upsertStationFn({ data: { id: s.id.startsWith('stn-') ? undefined : s.id, name: s.name, active: s.active } })),
      ...config.tableSections.map(s => upsertTableSectionFn({ data: { id: s.id.startsWith('sec-') ? undefined : s.id, name: s.name, prefix: s.prefix, active: s.active } })),
      ...config.paymentMethods.map(p => upsertPaymentMethodFn({ data: { id: p.id.startsWith('pm-') ? undefined : p.id, name: p.name, type: p.type, active: p.active } })),
      ...config.taxSlabs.map(t => upsertTaxSlabFn({ data: { id: t.id.startsWith('tax-') ? undefined : t.id, name: t.name, rate: t.rate, isDefault: t.isDefault, active: t.active } })),
      ...config.categories.map(c => upsertCategoryFn({ data: { id: c.id.startsWith('cat-') ? undefined : c.id, name: c.name, active: c.active } })),
      setSystemConfigFn({ data: { key: 'kds', value: config.kds } }),
      setSystemConfigFn({ data: { key: 'billing', value: config.billing } }),
      setSystemConfigFn({ data: { key: 'takeaway', value: config.takeaway } }),
      setSystemConfigFn({ data: { key: 'shift', value: config.shift } }),
      setSystemConfigFn({ data: { key: 'restaurant', value: config.restaurant } }),
    ]);
  }, [config]);

  const value = useMemo(() => ({ config, dispatch, syncToDb }), [config, syncToDb]);
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be inside ConfigStoreProvider");
  return ctx;
}

/** Convenience alias for direct sync calls in components. */
export function useSyncToDb() {
  return useConfig().syncToDb;
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
