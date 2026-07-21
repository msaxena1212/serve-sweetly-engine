ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "invoice_number" text;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "expiry_date" timestamp;
