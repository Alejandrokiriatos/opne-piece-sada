PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_notes TEXT NOT NULL DEFAULT '',
  fulfilment_method TEXT NOT NULL DEFAULT 'pickup',
  order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending','accepted','preparing','ready','completed','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  items_json TEXT NOT NULL,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_ip_created ON orders(ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint_hash TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  app_id TEXT NOT NULL DEFAULT 'customer' CHECK (app_id IN ('customer','admin')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_web_push_app ON web_push_subscriptions(app_id);

CREATE TABLE IF NOT EXISTS native_push_tokens (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  app_id TEXT NOT NULL DEFAULT 'customer' CHECK (app_id IN ('customer','admin')),
  platform TEXT NOT NULL DEFAULT 'android',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_native_push_app ON native_push_tokens(app_id);

CREATE TABLE IF NOT EXISTS public_rate_limits (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  route_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_public_rate_limits ON public_rate_limits(ip_hash, route_key, created_at DESC);
