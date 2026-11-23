import { buildPushPayload } from "@block65/webcrypto-web-push";

const encoder = new TextEncoder();
const ORDER_STATES = new Set(["pending", "accepted", "preparing", "ready", "completed", "cancelled"]);
const PAYMENT_STATES = new Set(["unpaid", "paid", "refunded"]);
let cachedFcmAccessToken = null;
let cachedFcmExpiry = 0;

function nowIso() { return new Date().toISOString(); }
function uuid() { return crypto.randomUUID(); }
function asJson(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });
}
function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return "";
  const allowed = String(env.CORS_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : "";
}
function corsHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  return origin ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,Idempotency-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  } : {};
}
function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function getPath(request) {
  const url = new URL(request.url);
  return { path: url.pathname.replace(/\/+$/, "") || "/", url };
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a, b) {
  const left = encoder.encode(String(a || ""));
  const right = encoder.encode(String(b || ""));
  let diff = left.length ^ right.length;
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}
function isAdmin(request, env) {
  const expected = String(env.ADMIN_API_TOKEN || "");
  const actual = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return expected.length >= 32 && safeEqual(actual, expected);
}
function requireAdmin(request, env) {
  if (!isAdmin(request, env)) return asJson({ error: "No autorizado." }, 401);
  return null;
}
async function readJson(request, maxBytes = 64 * 1024) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > maxBytes) throw new Error("El contenido supera el tamaño permitido.");
  const text = await request.text();
  if (text.length > maxBytes) throw new Error("El contenido supera el tamaño permitido.");
  try { return JSON.parse(text || "{}"); } catch { throw new Error("El cuerpo JSON no es válido."); }
}
async function rateLimit(request, env, routeKey, limit, windowMinutes) {
  const ipHash = await sha256Hex(request.headers.get("CF-Connecting-IP") || "unknown");
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM public_rate_limits WHERE ip_hash = ? AND route_key = ? AND created_at >= ?"
  ).bind(ipHash, routeKey, since).first();
  if (Number(count?.total || 0) >= limit) return false;
  await env.DB.prepare(
    "INSERT INTO public_rate_limits (id, ip_hash, route_key, created_at) VALUES (?, ?, ?, ?)"
  ).bind(uuid(), ipHash, routeKey, nowIso()).run();
  return true;
}
async function getCatalog(env) {
  const url = String(env.CATALOG_URL || "");
  if (!url.startsWith("https://")) throw new Error("CATALOG_URL no está configurada.");
  const response = await fetch(url, { headers: { Accept: "application/json" }, cf: { cacheTtl: 15, cacheEverything: true } });
  if (!response.ok) throw new Error("No se pudo consultar el catálogo publicado.");
  const catalog = await response.json();
  if (!Array.isArray(catalog.products)) throw new Error("El catálogo no contiene una lista de productos válida.");
  return catalog;
}
function validQuantity(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : 0;
}
function parseItems(value) {
  try { const data = JSON.parse(value || "[]"); return Array.isArray(data) ? data : []; } catch { return []; }
}
async function createOrder(request, env) {
  if (!await rateLimit(request, env, "create-order", 8, 10)) {
    return asJson({ error: "Has enviado demasiados pedidos en poco tiempo. Inténtalo de nuevo más tarde." }, 429);
  }
  const input = await readJson(request);
  const name = String(input.customerName || "").trim().slice(0, 100);
  const phone = String(input.customerPhone || "").trim().slice(0, 40);
  const notes = String(input.notes || "").trim().slice(0, 400);
  if (name.length < 2 || phone.replace(/\D/g, "").length < 7) {
    return asJson({ error: "Escribe tu nombre y un teléfono válido para confirmar el pedido." }, 400);
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 30) {
    return asJson({ error: "El pedido debe contener entre 1 y 30 productos." }, 400);
  }

  const idempotencyKey = String(request.headers.get("Idempotency-Key") || input.idempotencyKey || "").trim();
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(idempotencyKey)) {
    return asJson({ error: "Falta una clave válida para evitar pedidos duplicados." }, 400);
  }
  const existing = await env.DB.prepare(
    "SELECT id, order_number, order_status, payment_status, subtotal_cents, currency, created_at FROM orders WHERE idempotency_key = ?"
  ).bind(idempotencyKey).first();
  if (existing) return asJson({ success: true, duplicate: true, order: existing });

  const catalog = await getCatalog(env);
  const requested = new Map();
  for (const item of input.items) {
    const productId = String(item.productId || "").trim().slice(0, 100);
    const quantity = validQuantity(item.quantity);
    if (!productId || !quantity) return asJson({ error: "Uno de los productos o cantidades del pedido no es válido." }, 400);
    requested.set(productId, (requested.get(productId) || 0) + quantity);
  }
  const products = new Map(catalog.products.map(p => [String(p.id), p]));
  const orderItems = [];
  let totalCents = 0;
  for (const [productId, quantity] of requested) {
    if (quantity > 20) return asJson({ error: "La cantidad máxima por producto es 20." }, 400);
    const product = products.get(productId);
    if (!product || product.active === false || product.available === false || product.stock === 0) {
      return asJson({ error: "Uno de los productos ya no está disponible. Actualiza el menú e inténtalo de nuevo." }, 409);
    }
    const price = Number(product.price);
    if (!Number.isFinite(price) || price < 0 || price > 10_000_000) {
      return asJson({ error: "Hay un precio inválido en el catálogo. Contacta con la cafetería." }, 409);
    }
    const unitCents = Math.round(price * 100);
    const lineCents = unitCents * quantity;
    totalCents += lineCents;
    if (!Number.isSafeInteger(totalCents)) return asJson({ error: "El total del pedido supera el límite permitido." }, 400);
    orderItems.push({
      id: uuid(), productId, productName: String(product.name || "Producto").slice(0, 120),
      quantity, unitPriceCents: unitCents, lineTotalCents: lineCents
    });
  }

  const id = uuid();
  const datePart = nowIso().slice(2, 10).replaceAll("-", "");
  const suffix = crypto.getRandomValues(new Uint8Array(3));
  const orderNumber = "BC-" + datePart + "-" + Array.from(suffix, b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const createdAt = nowIso();
  const ipHash = await sha256Hex(request.headers.get("CF-Connecting-IP") || "unknown");
  const currency = String(catalog.currency || "USD").slice(0, 3).toUpperCase();
  const jsonItems = orderItems.map(item => ({
    productId: item.productId, productName: item.productName, quantity: item.quantity,
    unitPrice: item.unitPriceCents / 100, lineTotal: item.lineTotalCents / 100
  }));
  const statements = [
    env.DB.prepare("INSERT INTO orders (id, order_number, idempotency_key, customer_name, customer_phone, customer_notes, fulfilment_method, order_status, payment_status, subtotal_cents, currency, items_json, ip_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pickup', 'pending', 'unpaid', ?, ?, ?, ?, ?, ?)")
      .bind(id, orderNumber, idempotencyKey, name, phone, notes, totalCents, currency, JSON.stringify(jsonItems), ipHash, createdAt, createdAt),
    ...orderItems.map(item => env.DB.prepare("INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_price_cents, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(item.id, id, item.productId, item.productName, item.quantity, item.unitPriceCents, item.lineTotalCents))
  ];
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const duplicate = await env.DB.prepare(
      "SELECT id, order_number, order_status, payment_status, subtotal_cents, currency, created_at FROM orders WHERE idempotency_key = ?"
    ).bind(idempotencyKey).first();
    if (duplicate) return asJson({ success: true, duplicate: true, order: duplicate });
    throw error;
  }

  try {
    await sendPush(env, {
      title: "Nuevo pedido en Butterfly Café",
      body: "Pedido " + orderNumber + " · " + orderItems.reduce((sum, item) => sum + item.quantity, 0) + " artículo(s).",
      url: "./", tag: "order-" + id
    }, "admin");
  } catch (error) {
    console.error("No se pudo enviar el aviso de nuevo pedido:", String(error?.message || error));
  }
  return asJson({
    success: true,
    order: {
      id, orderNumber, orderStatus: "pending", paymentStatus: "unpaid",
      subtotal: totalCents / 100, currency, items: jsonItems, createdAt
    },
    message: "Pedido recibido. El pago se realiza al recogerlo en la cafetería."
  }, 201);
}
async function listOrders(request, env) {
  const denied = requireAdmin(request, env); if (denied) return denied;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  if (status && !ORDER_STATES.has(status)) return asJson({ error: "Filtro de estado inválido." }, 400);
  const query = status
    ? "SELECT * FROM orders WHERE order_status = ? ORDER BY created_at DESC LIMIT ?"
    : "SELECT * FROM orders ORDER BY created_at DESC LIMIT ?";
  const result = status
    ? await env.DB.prepare(query).bind(status, limit).all()
    : await env.DB.prepare(query).bind(limit).all();
  return asJson({ orders: (result.results || []).map(row => ({ ...row, items: parseItems(row.items_json) })) });
}
async function updateOrder(request, env, orderId) {
  const denied = requireAdmin(request, env); if (denied) return denied;
  const input = await readJson(request, 16 * 1024);
  const orderStatus = input.orderStatus === undefined ? undefined : String(input.orderStatus);
  const paymentStatus = input.paymentStatus === undefined ? undefined : String(input.paymentStatus);
  if (orderStatus !== undefined && !ORDER_STATES.has(orderStatus)) return asJson({ error: "Estado de pedido inválido." }, 400);
  if (paymentStatus !== undefined && !PAYMENT_STATES.has(paymentStatus)) return asJson({ error: "Estado de pago inválido." }, 400);
  if (orderStatus === undefined && paymentStatus === undefined) return asJson({ error: "No hay cambios de estado que guardar." }, 400);
  const existing = await env.DB.prepare("SELECT id FROM orders WHERE id = ?").bind(orderId).first();
  if (!existing) return asJson({ error: "No se encontró el pedido." }, 404);
  const sets = ["updated_at = ?"];
  const params = [nowIso()];
  if (orderStatus !== undefined) {
    sets.push("order_status = ?", "completed_at = ?");
    params.push(orderStatus, orderStatus === "completed" ? nowIso() : null);
  }
  if (paymentStatus !== undefined) { sets.push("payment_status = ?"); params.push(paymentStatus); }
  params.push(orderId);
  await env.DB.prepare("UPDATE orders SET " + sets.join(", ") + " WHERE id = ?").bind(...params).run();
  const updated = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
  return asJson({ order: { ...updated, items: parseItems(updated.items_json) } });
}
async function getSalesStats(request, env) {
  const denied = requireAdmin(request, env); if (denied) return denied;
  const url = new URL(request.url);
  const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const to = url.searchParams.get("to") || nowIso().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return asJson({ error: "Rango de fechas inválido." }, 400);
  }
  const start = from + "T00:00:00.000Z";
  const end = new Date(new Date(to + "T00:00:00.000Z").getTime() + 86400_000).toISOString();
  const totals = await env.DB.prepare("SELECT COUNT(*) AS order_count, SUM(CASE WHEN payment_status = 'paid' AND order_status != 'cancelled' THEN 1 ELSE 0 END) AS paid_order_count, COALESCE(SUM(CASE WHEN payment_status = 'paid' AND order_status != 'cancelled' THEN subtotal_cents ELSE 0 END), 0) AS revenue_cents, SUM(CASE WHEN payment_status = 'unpaid' AND order_status != 'cancelled' THEN 1 ELSE 0 END) AS unpaid_order_count, SUM(CASE WHEN order_status = 'completed' THEN 1 ELSE 0 END) AS completed_order_count FROM orders WHERE created_at >= ? AND created_at < ?")
    .bind(start, end).first();
  const topProducts = await env.DB.prepare("SELECT oi.product_id, oi.product_name, SUM(oi.quantity) AS units_sold, SUM(oi.line_total_cents) AS revenue_cents FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.created_at >= ? AND o.created_at < ? AND o.payment_status = 'paid' AND o.order_status != 'cancelled' GROUP BY oi.product_id, oi.product_name ORDER BY units_sold DESC LIMIT 10")
    .bind(start, end).all();
  const daily = await env.DB.prepare("SELECT substr(created_at,1,10) AS day, COUNT(*) AS paid_orders, COALESCE(SUM(subtotal_cents),0) AS revenue_cents FROM orders WHERE created_at >= ? AND created_at < ? AND payment_status = 'paid' AND order_status != 'cancelled' GROUP BY substr(created_at,1,10) ORDER BY day ASC")
    .bind(start, end).all();
  return asJson({
    from, to, currency: "USD",
    orderCount: Number(totals?.order_count || 0),
    paidOrderCount: Number(totals?.paid_order_count || 0),
    unpaidOrderCount: Number(totals?.unpaid_order_count || 0),
    completedOrderCount: Number(totals?.completed_order_count || 0),
    revenue: Number(totals?.revenue_cents || 0) / 100,
    topProducts: (topProducts.results || []).map(row => ({ ...row, revenue: Number(row.revenue_cents || 0) / 100 })),
    daily: (daily.results || []).map(row => ({ ...row, revenue: Number(row.revenue_cents || 0) / 100 }))
  });
}
function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlText(value) { return base64Url(encoder.encode(value)); }
function pemToArrayBuffer(pem) {
  const base64 = String(pem).replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0)).buffer;
}
async function getFcmAccessToken(env) {
  if (cachedFcmAccessToken && cachedFcmExpiry > Date.now() + 60_000) return cachedFcmAccessToken;
  if (!env.FCM_SERVICE_ACCOUNT_JSON) throw new Error("FCM_SERVICE_ACCOUNT_JSON no está configurado.");
  const account = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON);
  if (!account.client_email || !account.private_key || !account.project_id) throw new Error("La cuenta de servicio FCM está incompleta.");
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlText(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt, exp: issuedAt + 3600
  }));
  const unsigned = header + "." + claims;
  const key = await crypto.subtle.importKey("pkcs8", pemToArrayBuffer(account.private_key), {
    name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"
  }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  const assertion = unsigned + "." + base64Url(new Uint8Array(signature));
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) throw new Error("No se pudo obtener el token de acceso de FCM.");
  cachedFcmAccessToken = tokenData.access_token;
  cachedFcmExpiry = Date.now() + Number(tokenData.expires_in || 3600) * 1000;
  return cachedFcmAccessToken;
}
async function sendFcm(env, token, notification, data) {
  const account = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON || "{}");
  const accessToken = await getFcmAccessToken(env);
  const response = await fetch("https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(account.project_id) + "/messages:send", {
    method: "POST",
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ message: {
      token, notification: { title: notification.title, body: notification.body },
      data: Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [key, String(value)])),
      android: { priority: "HIGH", notification: { channel_id: "butterfly_updates" } }
    } })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorText = JSON.stringify(body);
    if (response.status === 404 || errorText.includes("UNREGISTERED") || errorText.includes("INVALID_ARGUMENT")) {
      await env.DB.prepare("DELETE FROM native_push_tokens WHERE token = ?").bind(token).run();
    }
    throw new Error("FCM HTTP " + response.status);
  }
  return body;
}
async function sendPush(env, notification, targetApp = "customer") {
  const title = String(notification.title || "Butterfly Café").slice(0, 90);
  const body = String(notification.body || "").slice(0, 220);
  const data = { url: String(notification.url || "./"), tag: String(notification.tag || "butterfly-cafe").slice(0, 80) };
  const rows = await Promise.all([
    env.DB.prepare("SELECT id, subscription_json FROM web_push_subscriptions WHERE app_id = ?").bind(targetApp).all(),
    env.DB.prepare("SELECT token FROM native_push_tokens WHERE app_id = ?").bind(targetApp).all()
  ]);
  const webRows = rows[0].results || [], nativeRows = rows[1].results || [];
  let webSent = 0, nativeSent = 0, failed = 0;
  for (const row of webRows) {
    try {
      if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) throw new Error("VAPID no configurado.");
      const subscription = JSON.parse(row.subscription_json);
      const payload = await buildPushPayload(
        { data: JSON.stringify({ title, body, ...data }), options: { ttl: 3600 } },
        subscription,
        { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
      );
      const response = await fetch(subscription.endpoint, payload);
      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare("DELETE FROM web_push_subscriptions WHERE id = ?").bind(row.id).run();
      } else if (!response.ok) throw new Error("Push service HTTP " + response.status);
      else webSent++;
    } catch (error) {
      failed++;
      console.error("Error enviando web push:", String(error?.message || error));
    }
  }
  for (const row of nativeRows) {
    try { await sendFcm(env, row.token, { title, body }, data); nativeSent++; }
    catch (error) { failed++; console.error("Error enviando FCM:", String(error?.message || error)); }
  }
  return { webSent, nativeSent, failed, total: webRows.length + nativeRows.length };
}
async function registerWebSubscription(request, env) {
  if (!await rateLimit(request, env, "push-subscribe", 20, 10)) return asJson({ error: "Demasiadas solicitudes." }, 429);
  const input = await readJson(request, 16 * 1024);
  const subscription = input.subscription;
  const appId = input.appId === "admin" ? "admin" : "customer";
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return asJson({ error: "Suscripción web incompleta." }, 400);
  if (!String(subscription.endpoint).startsWith("https://")) return asJson({ error: "El endpoint debe utilizar HTTPS." }, 400);
  const timestamp = nowIso();
  await env.DB.prepare("INSERT INTO web_push_subscriptions (id, endpoint_hash, subscription_json, app_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint_hash) DO UPDATE SET subscription_json=excluded.subscription_json, app_id=excluded.app_id, updated_at=excluded.updated_at")
    .bind(uuid(), await sha256Hex(subscription.endpoint), JSON.stringify(subscription), appId, timestamp, timestamp).run();
  return asJson({ success: true });
}
async function registerNativeToken(request, env) {
  if (!await rateLimit(request, env, "push-native-register", 30, 10)) return asJson({ error: "Demasiadas solicitudes." }, 429);
  const input = await readJson(request, 8 * 1024);
  const token = String(input.token || "").trim();
  const appId = input.appId === "admin" ? "admin" : "customer";
  const platform = String(input.platform || "android").slice(0, 20);
  if (token.length < 40 || token.length > 4096) return asJson({ error: "Token de notificación inválido." }, 400);
  const timestamp = nowIso();
  await env.DB.prepare("INSERT INTO native_push_tokens (id, token, app_id, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(token) DO UPDATE SET app_id=excluded.app_id, platform=excluded.platform, updated_at=excluded.updated_at")
    .bind(uuid(), token, appId, platform, timestamp, timestamp).run();
  return asJson({ success: true });
}
async function handleRequest(request, env) {
  const { path, url } = getPath(request);
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (method === "GET" && path === "/health") return asJson({ ok: true, service: "butterfly-cafe-api", timestamp: nowIso() });
  if (method === "GET" && path === "/api/push/config") {
    return asJson({ webPushAvailable: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT), publicKey: env.VAPID_PUBLIC_KEY || "", nativePushAvailable: Boolean(env.FCM_SERVICE_ACCOUNT_JSON) });
  }
  if (method === "POST" && path === "/api/orders") return createOrder(request, env);
  if (method === "POST" && path === "/api/push/web/subscribe") return registerWebSubscription(request, env);
  if (method === "POST" && path === "/api/push/native/register") return registerNativeToken(request, env);
  if (method === "POST" && path === "/api/push/web/unsubscribe") {
    const input = await readJson(request, 16 * 1024);
    if (!input.endpoint) return asJson({ error: "Falta el endpoint." }, 400);
    await env.DB.prepare("DELETE FROM web_push_subscriptions WHERE endpoint_hash = ?").bind(await sha256Hex(input.endpoint)).run();
    return asJson({ success: true });
  }
  if (method === "POST" && path === "/api/push/native/unregister") {
    const input = await readJson(request, 8 * 1024);
    if (!input.token) return asJson({ error: "Falta el token." }, 400);
    await env.DB.prepare("DELETE FROM native_push_tokens WHERE token = ?").bind(String(input.token)).run();
    return asJson({ success: true });
  }
  if (method === "GET" && path === "/api/admin/orders") return listOrders(request, env);
  if (method === "PATCH" && path.startsWith("/api/admin/orders/")) return updateOrder(request, env, path.slice("/api/admin/orders/".length));
  if (method === "GET" && path === "/api/admin/stats") return getSalesStats(request, env);
  if (method === "POST" && path === "/api/admin/push/send") {
    const denied = requireAdmin(request, env); if (denied) return denied;
    const input = await readJson(request, 8 * 1024);
    const title = String(input.title || "").trim(), body = String(input.body || "").trim();
    const target = input.target === "admin" ? "admin" : "customer";
    if (!title || !body) return asJson({ error: "Escribe un título y un mensaje." }, 400);
    const result = await sendPush(env, { title, body, url: input.url || "./" }, target);
    return asJson({ success: true, target, result });
  }
  return asJson({ error: "Ruta no encontrada." }, 404);
}
export default {
  async fetch(request, env) {
    try {
      if (request.headers.has("Origin") && !allowedOrigin(request, env)) return asJson({ error: "Origen no permitido." }, 403);
      return withCors(await handleRequest(request, env), request, env);
    } catch (error) {
      console.error("API error:", String(error?.message || error));
      return withCors(asJson({ error: "No se pudo completar la solicitud. Comprueba el servicio y vuelve a intentarlo." }, 500), request, env);
    }
  }
};
