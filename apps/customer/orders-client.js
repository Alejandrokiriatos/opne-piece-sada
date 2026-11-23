(() => {
  const $ = selector => document.querySelector(selector);
  const CART_KEY = "butterfly-cafe-cart-v1";
  let cart = loadCart();
  let submitting = false;
  let idempotencyKey = newRequestKey();

  function newRequestKey() {
    return (globalThis.crypto?.randomUUID?.() || ("bc-" + Date.now() + "-" + Math.random().toString(36).slice(2))).replace(/[^A-Za-z0-9_-]/g, "");
  }
  function loadCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(item => typeof item.productId === "string" && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 20) : [];
    } catch { return []; }
  }
  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderCartButton();
    renderCartContents();
  }
  function catalog() { return window.BCApp?.getCatalog?.() || null; }
  function productMap() { return new Map((catalog()?.products || []).map(p => [String(p.id), p])); }
  function formatMoney(value) {
    const c = catalog();
    return new Intl.NumberFormat("es-US", { style: "currency", currency: c?.currency || "USD" }).format(Number(value) || 0);
  }
  function safeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function currentCartLines() {
    const products = productMap();
    return cart.map(line => ({ ...line, product: products.get(line.productId) }))
      .filter(line => line.product && line.product.active !== false);
  }
  function totals() {
    const lines = currentCartLines();
    return {
      lines,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      total: lines.reduce((sum, line) => sum + (Number(line.product.price) || 0) * line.quantity, 0)
    };
  }
  function renderCartButton() {
    const button = $("#cart-open");
    if (!button) return;
    const data = totals();
    button.hidden = data.count === 0;
    $("#cart-count").textContent = String(data.count);
    $("#cart-total").textContent = formatMoney(data.total);
  }
  function renderCartContents(successOrder = null) {
    const content = $("#cart-content");
    if (!content) return;
    const data = totals();
    if (successOrder) {
      content.innerHTML = '<section class="order-success"><span>🦋</span><h3>¡Pedido recibido!</h3><b>' + safeText(successOrder.orderNumber || "") + '</b><p>' + safeText(successOrder.message || "La cafetería recibió tu pedido.") + '</p><strong>' + formatMoney(successOrder.subtotal) + '</strong><small>El pago se realiza al recogerlo.</small></section>';
      $("#checkout-form").hidden = true;
      $("#cart-clear").hidden = true;
      return;
    }
    const orderEnabled = catalog()?.orders?.enabled === true && Boolean(window.BCApp?.getBackendApiBase?.());
    $("#checkout-form").hidden = data.lines.length === 0 || !orderEnabled;
    $("#cart-clear").hidden = data.lines.length === 0;
    content.innerHTML = data.lines.length ? '<div class="cart-lines">' + data.lines.map(line => {
      const p = line.product;
      return '<article class="cart-line"><div class="cart-line-main"><b>' + safeText(p.name) + '</b><small>' + formatMoney(p.price) + ' cada uno</small><strong>' + formatMoney((Number(p.price) || 0) * line.quantity) + '</strong></div><div class="cart-line-controls"><button type="button" data-cart-decrease="' + safeText(p.id) + '" aria-label="Quitar uno">−</button><span>' + line.quantity + '</span><button type="button" data-cart-increase="' + safeText(p.id) + '" aria-label="Añadir uno">＋</button><button type="button" data-cart-remove="' + safeText(p.id) + '" class="cart-remove">Quitar</button></div></article>';
    }).join("") + '</div><div class="cart-total-line"><span>Total estimado</span><b>' + formatMoney(data.total) + '</b></div>' + (!orderEnabled ? '<div class="order-disabled">La cafetería todavía no ha activado la recepción de pedidos. Puedes seguir explorando el menú.</div>' : '') : '<div class="empty cart-empty">Tu pedido está vacío. Añade un café o un dulce del menú. 💜</div>';
  }
  function mutate(productId, amount) {
    const product = productMap().get(productId);
    if (!product || product.active === false || product.available === false || product.stock === 0) {
      cart = cart.filter(line => line.productId !== productId);
      window.BCApp?.toast("Ese producto ya no está disponible.");
      saveCart();
      return;
    }
    const current = cart.find(line => line.productId === productId);
    if (!current && amount > 0) cart.push({ productId, quantity: 1 });
    else if (current) {
      current.quantity += amount;
      if (current.quantity <= 0) cart = cart.filter(line => line.productId !== productId);
      if (current.quantity > 20) current.quantity = 20;
    }
    saveCart();
  }
  function openCart() {
    renderCartContents();
    const dialog = $("#cart-dialog");
    if (dialog && !dialog.open) dialog.showModal();
  }
  function setStatus(message, isError = false) {
    const status = $("#order-status");
    if (status) {
      status.textContent = message;
      status.classList.toggle("error", isError);
    }
  }
  async function submitOrder(event) {
    event.preventDefault();
    if (submitting) return;
    const c = catalog();
    const apiBase = window.BCApp?.getBackendApiBase?.() || "";
    const data = totals();
    if (c?.orders?.enabled !== true) {
      setStatus("La cafetería todavía no ha activado la recepción de pedidos.", true);
      return;
    }
    if (!data.lines.length) { setStatus("Añade al menos un producto.", true); return; }
    if (!apiBase) {
      setStatus("Los pedidos todavía no están habilitados. BC Admin debe configurar la dirección del servidor.", true);
      return;
    }
    const name = $("#order-customer-name").value.trim();
    const phone = $("#order-customer-phone").value.trim();
    const notes = $("#order-customer-notes").value.trim();
    if (name.length < 2 || phone.replace(/\D/g, "").length < 7) {
      setStatus("Escribe tu nombre y un teléfono válido.", true);
      return;
    }
    submitting = true;
    const button = $("#order-submit");
    button.disabled = true;
    button.textContent = "Enviando pedido…";
    setStatus("Comprobando disponibilidad y enviando el pedido…");
    try {
      const response = await fetch(apiBase + "/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          customerName: name, customerPhone: phone, notes,
          fulfilmentMethod: "pickup",
          items: data.lines.map(line => ({ productId: line.productId, quantity: line.quantity })),
          idempotencyKey
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || ("El servidor respondió HTTP " + response.status));
      const order = result.order || {};
      cart = [];
      localStorage.removeItem(CART_KEY);
      idempotencyKey = newRequestKey();
      $("#checkout-form").reset();
      saveCart();
      renderCartContents({
        orderNumber: order.orderNumber || order.order_number,
        subtotal: order.subtotal ?? (Number(order.subtotal_cents || 0) / 100),
        message: result.message || "La cafetería recibió tu pedido."
      });
      window.BCApp?.notify("Pedido enviado", "Tu pedido " + (order.orderNumber || order.order_number || "") + " fue recibido.", "order-customer-" + (order.id || order.orderNumber || Date.now()));
      window.BCApp?.toast("¡Pedido enviado correctamente!");
    } catch (error) {
      setStatus(error.message || "No se pudo enviar el pedido. Inténtalo de nuevo.", true);
      // Keep the same idempotency key for retries, so a timed-out response cannot create a second order.
    } finally {
      submitting = false;
      button.disabled = false;
      button.textContent = "Enviar pedido";
    }
  }
  document.addEventListener("click", event => {
    const add = event.target.closest("[data-add-cart]");
    if (add) {
      event.preventDefault();
      event.stopPropagation();
      mutate(String(add.dataset.addCart), 1);
      window.BCApp?.toast("Añadido a tu pedido 💜");
      return;
    }
    const increase = event.target.closest("[data-cart-increase]");
    if (increase) { mutate(increase.dataset.cartIncrease, 1); return; }
    const decrease = event.target.closest("[data-cart-decrease]");
    if (decrease) { mutate(decrease.dataset.cartDecrease, -1); return; }
    const remove = event.target.closest("[data-cart-remove]");
    if (remove) { cart = cart.filter(line => line.productId !== remove.dataset.cartRemove); saveCart(); return; }
    if (event.target.closest("#cart-open")) { openCart(); return; }
    if (event.target.closest("[data-cart-close]")) { $("#cart-dialog").close(); return; }
    if (event.target.closest("#cart-clear")) { cart = []; idempotencyKey = newRequestKey(); saveCart(); setStatus(""); return; }
  });
  $("#checkout-form")?.addEventListener("submit", submitOrder);
  window.addEventListener("bc:catalog-loaded", () => {
    const valid = productMap();
    cart = cart.filter(line => valid.has(line.productId));
    saveCart();
  });
  renderCartButton();
  renderCartContents();
})();
