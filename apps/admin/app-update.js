import { Browser } from "@capacitor/browser";

(() => {
  const OWNER = "Alejandrokiriatos";
  const REPO = "opne-piece-sada";
  const APP = window.BC_APP_NAME || "admin";
  const CURRENT = Number(window.BC_APP_VERSION || 0);
  const RELEASE_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
  const APK_URL = `https://github.com/${OWNER}/${REPO}/releases/latest/download/butterfly-cafe-${APP}.apk`;
  let checking = false;
  let latestSeen = 0;

  function showUpdate(release) {
    let overlay = document.getElementById("mandatory-app-update");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "mandatory-app-update";
      overlay.innerHTML = `
        <div class="mandatory-update-card" role="dialog" aria-modal="true" aria-labelledby="mandatory-update-title">
          <div class="mandatory-update-butterfly">🦋</div>
          <span class="mandatory-update-eyebrow">BUTTERFLY CAFÉ</span>
          <h2 id="mandatory-update-title">¡HAY UNA NUEVA ACTUALIZACIÓN!</h2>
          <p class="mandatory-update-version"></p>
          <div class="mandatory-update-notes"></div>
          <button type="button" class="mandatory-update-button">ACTUALIZAR AHORA</button>
          <small>Se abrirá la descarga de la nueva APK. Cuando termine, ábrela y confirma la instalación de Android.</small>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector("button").addEventListener("click", async () => {
        const button = overlay.querySelector("button");
        button.disabled = true;
        button.textContent = "ABRIENDO DESCARGA…";
        try {
          if (window.Capacitor?.isNativePlatform?.()) {
            await Browser.open({ url: APK_URL, toolbarColor: "#7e4294" });
          } else {
            window.open(APK_URL, "_blank", "noopener");
          }
          button.textContent = "DESCARGA ABIERTA";
        } catch (error) {
          console.error("Error abriendo la descarga de actualización", error);
          button.disabled = false;
          button.textContent = "REINTENTAR DESCARGA";
          alert("No se pudo abrir la descarga. Comprueba tu conexión e inténtalo de nuevo.");
        }
      });
    }
    overlay.querySelector(".mandatory-update-version").textContent = `Versión instalada: ${CURRENT || "desconocida"} · Nueva versión: ${release.tag_name}`;
    overlay.querySelector(".mandatory-update-notes").textContent =
      (release.body || "Mejoras y novedades de Butterfly Café.").slice(0, 1600);
    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  async function checkForUpdate() {
    if (checking || document.getElementById("mandatory-app-update")?.style.display === "flex") return;
    checking = true;
    try {
      const response = await fetch(`${RELEASE_API}?check=${Date.now()}`, {
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" }
      });
      if (!response.ok) throw new Error(`GitHub respondió ${response.status}`);
      const release = await response.json();
      const latest = Number(String(release.tag_name || "").replace(/^v/i, ""));
      const hasApk = (release.assets || []).some(asset =>
        asset.name === `butterfly-cafe-${APP}.apk`
      );
      if (Number.isFinite(latest) && latest > CURRENT && latest > latestSeen && hasApk) {
        latestSeen = latest;
        showUpdate(release);
      }
    } catch (error) {
      console.warn("No se pudo comprobar si hay una actualización", error);
    } finally {
      checking = false;
    }
  }

  function startUpdateChecks() {
    checkForUpdate();
    window.setInterval(checkForUpdate, 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdate();
    });
    window.addEventListener("online", checkForUpdate);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startUpdateChecks, { once: true });
  } else {
    startUpdateChecks();
  }
})();