(() => {
  const $ = selector => document.querySelector(selector);
  let listenersRegistered = false;

  function setStatus(selector, message, error = false) {
    const element = $(selector);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("error", error);
  }

  async function sendPush() {
    const title = $("#push-send-title")?.value.trim() || "";
    const body = $("#push-send-body")?.value.trim() || "";
    const target = $("#push-send-target")?.value || "customer";
    if (!title || !body) {
      setStatus("#push-send-status", "Escribe un título y un mensaje.", true);
      return;
    }
    const button = $("#push-send");
    if (button) button.disabled = true;
    setStatus("#push-send-status", "Enviando notificación…");
    try {
      if (!window.BCAdmin?.apiFetch) throw new Error("BC Admin todavía está inicializando.");
      const result = await window.BCAdmin.apiFetch("/api/admin/push/send", {
        method: "POST",
        body: JSON.stringify({ title, body, target })
      });
      const delivery = result.result || {};
      setStatus("#push-send-status",
        "Enviadas: " + (delivery.webSent || 0) + " Web Push y " +
        (delivery.nativeSent || 0) + " Android · Fallidas: " +
        (delivery.failed || 0) + ". Los dispositivos no registrados no reciben avisos.");
    } catch (error) {
      setStatus("#push-send-status", error.message || "No se pudo enviar la notificación.", true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function enableAdminPush() {
    const base = window.BCAdmin?.getApiBase?.();
    if (!base) throw new Error("Configura y publica primero la URL HTTPS de la API.");
    if (!window.BC_FCM_ENABLED) {
      throw new Error("Esta APK todavía no tiene google-services.json de Firebase. Añádelo a los secretos del repositorio y vuelve a compilar BC Admin.");
    }
    const plugin = await import("@capacitor/push-notifications");
    const PushNotifications = plugin.PushNotifications;
    if (!listenersRegistered) {
      listenersRegistered = true;
      await PushNotifications.addListener("registration", async token => {
        try {
          const response = await fetch(base + "/api/push/native/register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + (window.BCAdmin?.getApiToken?.() || "")
            },
            body: JSON.stringify({ appId: "admin", platform: "android", token: token.value })
          });
          if (!response.ok) throw new Error("HTTP " + response.status);
          setStatus("#push-config-status", "BC Admin quedó registrado para recibir avisos ✓");
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
        const label = notification.title || "Butterfly Café";
        setStatus("#push-config-status", "Nuevo aviso recibido: " + label);
      });
      await PushNotifications.addListener("pushNotificationActionPerformed", () => {
        document.querySelector('[data-admin-tab="notifications"]')?.click();
      });
    }
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive !== "granted") permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") throw new Error("No se concedió permiso para notificaciones.");
    await PushNotifications.createChannel({
      id: "butterfly_updates",
      name: "Avisos de Butterfly Café",
      description: "Actualizaciones y avisos del establecimiento",
      importance: 5,
      sound: "default",
      visibility: 1,
      vibration: true
    });
    await PushNotifications.register();
    setStatus("#push-config-status", "Solicitando registro de BC Admin en Firebase…");
  }

  function init() {
    $("#push-send")?.addEventListener("click", sendPush);
    $("#admin-push-enable")?.addEventListener("click", () => {
      enableAdminPush().catch(error => setStatus("#push-config-status", error.message, true));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
