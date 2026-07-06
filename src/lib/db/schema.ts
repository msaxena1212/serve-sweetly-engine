import { pgTable, serial, text, timestamp, boolean, decimal, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  pin: text('pin').notNull(),
  role: text('role').notNull(), // 'owner', 'manager', 'cashier', 'waiter', 'kitchen'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tableSections = pgTable('table_sections', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const stations = pgTable('stations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const paymentMethods = pgTable('payment_methods', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'cash', 'card', 'upi', 'custom'
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const taxSlabs = pgTable('tax_slabs', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  rate: decimal('rate', { precision: 5, scale: 2 }).notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  active: boolean('active').default(true).notNull(),
});

export const systemConfig = pgTable('system_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON payload
});

export const menuItems = pgTable('menu_items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  categoryId: integer('category_id').references(() => categories.id).notNull(),
  stationId: integer('station_id').references(() => stations.id),
  isAvailable: boolean('is_available').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tables = pgTable('tables', {
  id: serial('id').primaryKey(),
  number: text('number').notNull(),
  sectionId: integer('section_id').references(() => tableSections.id),
  status: text('status').default('available').notNull(), // 'available', 'occupied'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  tableId: integer('table_id').references(() => tables.id),
  type: text('type').notNull(), // 'dine-in', 'takeaway'
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  status: text('status').default('open').notNull(), // 'open', 'completed', 'cancelled', 'void'
  total: decimal('total', { precision: 10, scale: 2 }).default('0.00').notNull(),
  discountPct: decimal('discount_pct', { precision: 5, scale: 2 }).default('0.00').notNull(),
  taxPct: decimal('tax_pct', { precision: 5, scale: 2 }).default('0.00').notNull(),
  paymentMethodId: integer('payment_method_id').references(() => paymentMethods.id),
  shiftId: integer('shift_id'), // Will be FK to shifts
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  menuItemId: integer('menu_item_id').references(() => menuItems.id).notNull(),
  quantity: integer('quantity').notNull(),
  status: text('status').default('pending').notNull(), // 'pending', 'preparing', 'ready', 'served'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const inventory = pgTable('inventory', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  unit: text('unit').notNull(), // 'kg', 'liter', 'piece'
  quantity: decimal('quantity', { precision: 10, scale: 3 }).default('0.000').notNull(),
  minQuantity: decimal('min_quantity', { precision: 10, scale: 3 }).default('0.000').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  contactInfo: text('contact_info'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id').references(() => suppliers.id).notNull(),
  status: text('status').default('pending').notNull(), // 'pending', 'received', 'cancelled'
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).default('0.00').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const shifts = pgTable('shifts', {
  id: serial('id').primaryKey(),
  openedBy: integer('opened_by').references(() => users.id).notNull(),
  closedBy: integer('closed_by').references(() => users.id),
  openingCash: decimal('opening_cash', { precision: 10, scale: 2 }).notNull(),
  closingCash: decimal('closing_cash', { precision: 10, scale: 2 }),
  expectedCash: decimal('expected_cash', { precision: 10, scale: 2 }),
  variance: decimal('variance', { precision: 10, scale: 2 }),
  status: text('status').default('open').notNull(), // 'open', 'closed'
  openedAt: timestamp('opened_at').defaultNow().notNull(),
  closedAt: timestamp('closed_at'),
});

export const refunds = pgTable('refunds', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  approvedBy: integer('approved_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
