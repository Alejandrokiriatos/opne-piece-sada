(() => {
  const $ = selector => document.querySelector(selector);
  const money = value => new Intl.NumberFormat("es-US", {
    style: "currency", currency: (window.BCAdmin?.getCatalog?.()?.currency || "USD")
  }).format(Number(value) || 0);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const statusNames = {
    pending:"Pendiente", accepted:"Aceptado", preparing:"Preparando",
    ready:"Listo para recoger", completed:"Completado", cancelled:"Cancelado"
  };
  const paymentNames = { unpaid:"Sin cobrar", paid:"Pagado", refunded:"Reembolsado" };
  let lastOrders = [];
  let listenersRegistered = false;

  function setStatus(id, message, error = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", error);
  }
  async function api(path, options) {
    if (!window.BCAdmin?.apiFetch) throw new Error("BC Admin todavía está inicializando.");
    return window.BCAdmin.apiFetch(path, options || {});
  }
  function renderOrders() {
    const list = $("#orders-list");
    if (!list) return;
    if (!lastOrders.length) {
      list.innerHTML = '<div class="empty">Todavía no hay pedidos registrados. Los nuevos pedidos aparecerán aquí.</div>';
      return;
    }
    list.innerHTML = lastOrders.map(order => {
      const items = Array.isArray(order.items) ? order.items : [];
      const total = Number(order.subtotal_cents || 0) / 100;
      return '<article class="order-card" data-order-id="' + escapeHtml(order.id) + '">' +
        '<header class="order-card-head"><div><span class="eyebrow">PEDIDO</span><h3>' + escapeHtml(order.order_number || order.orderNumber || "") +
        '</h3><small>' + escapeHtml(order.created_at ? new Date(order.created_at).toLocaleString("es") : "") +
        '</small></div><b class="order-total">' + money(total) + '</b></header>' +
        '<div class="order-customer"><b>' + escapeHtml(order.customer_name || "") + '</b><a href="tel:' + escapeHtml(order.customer_phone || "") +
        '">' + escapeHtml(order.customer_phone || "") + '</a>' + (order.customer_notes ? '<p>📝 ' + escapeHtml(order.customer_notes) + '</p>' : '') + '</div>' +
        '<ul class="order-item-list">' + items.map(item => '<li><span>' + Number(item.quantity || 0) + ' × ' +
        escapeHtml(item.productName || item.product_name || "Producto") + '</span><b>' +
        money(item.lineTotal ?? item.line_total_cents / 100) + '</b></li>').join("") + '</ul>' +
        '<div class="order-edit-row"><label>Estado del pedido<select data-order-status>' +
        Array.from(Object.entries(statusNames), ([key,label]) => '<option value="' + key + '"' + ((order.order_status || "pending") === key ? " selected" : "") + '>' + label + '</option>').join("") +
        '</select></label><label>Pago<select data-payment-status>' +
        Array.from(Object.entries(paymentNames), ([key,label]) => '<option value="' + key + '"' + ((order.payment_status || "unpaid") === key ? " selected" : "") + '>' + label + '</option>').join("") +
        '</select></label><button type="button" class="secondary" data-order-save>Guardar</button></div>' +
        '<p class="order-card-status" role="status"></p></article>';
    }).join("");
    list.querySelectorAll("[data-order-save]").forEach(button => {
      button.addEventListener("click", async () => {
        const card = button.closest("[data-order-id]");
        const id = card.dataset.orderId;
        const orderStatus = card.querySelector("[data-order-status]").value;
        const paymentStatus = card.querySelector("[data-payment-status]").value;
        const status = card.querySelector(".order-card-status");
        button.disabled = true;
        status.textContent = "Guardando…";
        try {
          await api("/api/admin/orders/" + encodeURIComponent(id), {
            method: "PATCH",
            body: JSON.stringify({ orderStatus, paymentStatus })
          });
          status.textContent = "Cambios guardados ✓";
          status.classList.remove("error");
          await loadOrders();
          await loadSales();
        } catch (error) {
          status.textContent = error.message || "No se pudo guardar el pedido.";
          status.classList.add("error");
        } finally {
          button.disabled = false;
        }
      });
    });
  }
  async function loadOrders() {
    setStatus("#orders-status", "Consultando pedidos…");
    try {
      const filter = $("#orders-filter")?.value || "";
      const query = filter ? "?limit=100&status=" + encodeURIComponent(filter) : "?limit=100";
      const result = await api("/api/admin/orders" + query);
      lastOrders = Array.isArray(result.orders) ? result.orders : [];
      renderOrders();
      setStatus("#orders-status", lastOrders.length + " pedido(s) cargado(s).");
    } catch (error) {
      lastOrders = [];
      renderOrders();
      setStatus("#orders-status", error.message || "No se pudieron cargar los pedidos.", true);
    }
  }
  function dateValue(date) {
    return date.getFullYear() + "-" + String(date.getMonth()+1).padStart(2,"0") + "-" + String(date.getDate()).padStart(2,"0");
  }
  async function loadSales() {
    const from = $("#sales-from")?.value;
    const to = $("#sales-to")?.value;
    if (!from || !to || from > to) {
      setStatus("#sales-status", "Selecciona un rango de fechas válido.", true);
      return;
    }
    setStatus("#sales-status", "Calculando ventas cobradas…");
    try {
      const result = await api("/api/admin/stats?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to));
      $("#sales-revenue").textContent = money(result.revenue);
      $("#sales-paid-orders").textContent = String(result.paidOrderCount || 0);
      $("#sales-unpaid-orders").textContent = String(result.unpaidOrderCount || 0);
      $("#sales-completed-orders").textContent = String(result.completedOrderCount || 0);
      const top = result.topProducts || [];
      $("#sales-top-products").innerHTML = top.length ? top.map(item =>
        '<article class="sales-row"><div><b>' + escapeHtml(item.product_name) + '</b><small>' +
        Number(item.units_sold || 0) + ' unidad(es)</small></div><strong>' + money(item.revenue) + '</strong></article>'
      ).join("") : '<p class="hint">Todavía no hay ventas cobradas en este período.</p>';
      const daily = result.daily || [];
      $("#sales-daily").innerHTML = daily.length ? daily.map(item =>
        '<article class="sales-row"><div><b>' + escapeHtml(item.day) + '</b><small>' +
        Number(item.paid_orders || 0) + ' pedido(s) pagados</small></div><strong>' + money(item.revenue_cents / 100) + '</strong></article>'
      ).join("") : '<p class="hint">No hay ventas cobradas por día en este período.</p>';
      setStatus("#sales-status", "Datos reales de la base de pedidos · " + from + " a " + to + ". Solo se cuentan pedidos pagados y no cancelados.");
    } catch (error) {
      setStatus("#sales-status", error.message || "No se pudieron consultar las ventas.", true);
    }
  }
  async function sendPush() {
    const title = $("#push-send-title").value.trim();
    const body = $("#push-send-body").value.trim();
    const target = $("#push-send-target").value;
    if (!title || !body) {
      setStatus("#push-send-status", "Escribe un título y un mensaje.", true);
      return;
    }
    const button = $("#push-send");
    button.disabled = true;
    setStatus("#push-send-status", "Enviando notificación…");
    try {
      const result = await api("/api/admin/push/send", {
        method: "POST",
        body: JSON.stringify({ title, body, target })
      });
      const delivery = result.result || {};
      setStatus("#push-send-status", "Enviadas: " + (delivery.webSent || 0) +
        " Web Push y " + (delivery.nativeSent || 0) + " Android · Fallidas: " + (delivery.failed || 0) +
        ". Los dispositivos no registrados no reciben avisos.");
    } catch (error) {
      setStatus("#push-send-status", error.message || "No se pudo enviar la notificación.", true);
    } finally {
      button.disabled = false;
    }
  }
  async function enableAdminPush() {
    const base = window.BCAdmin?.getApiBase?.();
    if (!base) throw new Error("Configura y publica primero la URL HTTPS de la API.");
    if (!window.BC_FCM_ENABLED) throw new Error("Esta APK todavía no tiene google-services.json de Firebase. Añádelo a los secretos del repositorio y vuelve a compilar BC Admin.");
    const plugin = await import("@capacitor/push-notifications");
    const PushNotifications = plugin.PushNotifications;
    if (!listenersRegistered) {
      listenersRegistered = true;
      await PushNotifications.addListener("registration", async token => {
        try {
          const response = await fetch(base + "/api/push/native/register", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (window.BCAdmin?.getApiToken?.() || "") },
            body: JSON.stringify({ appId: "admin", platform: "android", token: token.value })
          });
          if (!response.ok) throw new Error("HTTP " + response.status);
          setStatus("#push-config-status", "BC Admin quedó registrado para recibir pedidos y avisos ✓");
        } catch (error) {
          setStatus("#push-config-status", "No se pudo registrar el dispositivo: " + error.message, true);
          listenersRegistered = false;
        }
      });
      await PushNotifications.addListener("registrationError", error => {
        listenersRegistered = false;
        setStatus("#push-config-status", "Firebase no pudo registrar este dispositivo. Comprueba la configuración.", true);
        console.error(error);
      });
      await PushNotifications.addListener("pushNotificationReceived", notification => {
        setStatus("#push-config-status", "Nuevo aviso: " + (notification.title || "Butterfly Café"));
        loadOrders();
      });
      await PushNotifications.addListener("pushNotificationActionPerformed", () => {
        document.querySelector('[data-admin-tab="orders"]')?.click();
        loadOrders();
      });
    }
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive !== "granted") permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") throw new Error("No se concedió permiso para notificaciones.");
    await PushNotifications.register();
    setStatus("#push-config-status", "Solicitando registro de BC Admin en Firebase…");
  }
  function init() {
    const today = new Date();
    const start = new Date(today.getTime() - 29 * 86400_000);
    $("#sales-from").value = dateValue(start);
    $("#sales-to").value = dateValue(today);
    $("#orders-refresh").addEventListener("click", loadOrders);
    $("#orders-filter").addEventListener("change", loadOrders);
    $("#sales-refresh").addEventListener("click", loadSales);
    $("#push-send").addEventListener("click", sendPush);
    $("#admin-push-enable").addEventListener("click", () => enableAdminPush().catch(error => setStatus("#push-config-status", error.message, true)));
    document.querySelectorAll("[data-admin-tab]").forEach(tab => tab.addEventListener("click", () => {
      if (tab.dataset.adminTab === "orders") loadOrders();
      if (tab.dataset.adminTab === "sales") loadSales();
    }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !document.querySelector('[data-admin-page="orders"]')?.hidden) loadOrders();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
