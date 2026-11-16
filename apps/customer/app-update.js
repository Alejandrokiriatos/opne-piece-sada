import { FileTransfer } from "@capacitor/file-transfer";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { registerPlugin } from "@capacitor/core";

const ApkInstaller = registerPlugin("ApkInstaller");

(() => {
  const OWNER = "Alejandrokiriatos";
  const REPO = "opne-piece-sada";
  const APP = window.BC_APP_NAME || "customer";
  const CURRENT = Number(window.BC_APP_VERSION || 0);
  const RELEASE_API = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/releases?per_page=30";
  let checking = false, latestSeen = 0, downloadUri = null, downloading = false, downloaded = false, apkUrl = "";

  function showUpdate(release, asset) {
    let overlay = document.getElementById("mandatory-app-update");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "mandatory-app-update";
      overlay.innerHTML = '<div class="mandatory-update-card" role="dialog" aria-modal="true">' +
        '<div class="mandatory-update-butterfly">🦋</div><span class="mandatory-update-eyebrow">BUTTERFLY CAFÉ</span>' +
        '<h2>¡HAY UNA NUEVA ACTUALIZACIÓN!</h2><p class="mandatory-update-version"></p><div class="mandatory-update-notes"></div>' +
        '<div class="mandatory-download-area" hidden><div class="mandatory-download-track"><span></span></div>' +
        '<b class="mandatory-download-percent">Preparando descarga…</b><small class="mandatory-download-size"></small></div>' +
        '<button type="button" class="mandatory-update-button">DESCARGAR ACTUALIZACIÓN</button>' +
        '<small class="mandatory-update-help">La descarga se realizará aquí mismo. Después podrás abrir el instalador normal de Android.</small></div>';
      document.body.appendChild(overlay);
      overlay.querySelector("button").addEventListener("click", updateAction);
    }
    apkUrl = asset.browser_download_url;
    overlay.querySelector(".mandatory-update-version").textContent = "Versión instalada: " + (CURRENT || "desconocida") + " · Nueva versión: " + release.tag_name;
    overlay.querySelector(".mandatory-update-notes").textContent = (release.body || "Mejoras y novedades de Butterfly Café.").slice(0, 1600);
    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function progress(bytes, total) {
    const area = document.querySelector(".mandatory-download-area");
    if (!area) return;
    area.hidden = false;
    const pct = total > 0 ? Math.min(100, Math.round(bytes * 100 / total)) : 0;
    area.querySelector(".mandatory-download-track span").style.width = pct + "%";
    area.querySelector(".mandatory-download-percent").textContent = total > 0 ? pct + "% descargado" : "Descargando…";
    area.querySelector(".mandatory-download-size").textContent = (bytes / 1048576).toFixed(1) + " MB" + (total > 0 ? " de " + (total / 1048576).toFixed(1) + " MB" : " descargados");
  }

  async function updateAction() {
    const button = document.querySelector(".mandatory-update-button");
    const help = document.querySelector(".mandatory-update-help");
    if (downloading) return;
    if (downloaded) {
      button.disabled = true;
      button.textContent = "ABRIENDO INSTALADOR…";
      try {
        const result = await ApkInstaller.install({ path: downloadUri });
        if (result && result.needsPermission) {
          button.disabled = false;
          button.textContent = "YA DI PERMISO · INSTALAR";
          help.textContent = "Android abrió los ajustes de permiso. Autoriza instalaciones desde esta aplicación y vuelve a tocar el botón.";
        } else {
          button.textContent = "INSTALADOR ABIERTO";
          help.textContent = "Sigue los pasos del instalador de Android para completar la actualización.";
        }
      } catch (error) {
        console.error("Error al abrir el instalador", error);
        button.disabled = false;
        button.textContent = "REINTENTAR INSTALACIÓN";
        help.textContent = "Android no abrió el instalador: " + (error && error.message ? error.message : "error desconocido") + ". Puedes volver a intentarlo.";
      }
      return;
    }
    if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
      window.open(apkUrl, "_blank", "noopener");
      return;
    }
    downloading = true;
    button.disabled = true;
    button.textContent = "DESCARGANDO…";
    help.textContent = "Descargando dentro de la aplicación. No la cierres.";
    let listener;
    try {
      const file = await Filesystem.getUri({ directory: Directory.Cache, path: "butterfly-cafe-" + APP + "-update.apk" });
      downloadUri = file.uri;
      listener = await FileTransfer.addListener("progress", p => progress(p.bytes || 0, p.contentLength || 0));
      await FileTransfer.downloadFile({ url: apkUrl, path: downloadUri, progress: true });
      downloaded = true;
      progress(1, 1);
      button.disabled = false;
      button.textContent = "INSTALAR AHORA";
      help.textContent = "Descarga terminada. Toca INSTALAR AHORA para abrir el instalador normal de Android.";
    } catch (error) {
      console.error("Error descargando APK", error);
      button.disabled = false;
      button.textContent = "REINTENTAR DESCARGA";
      help.textContent = "La descarga falló. Comprueba tu conexión e inténtalo de nuevo.";
      alert("No se pudo descargar la actualización. Comprueba tu conexión.");
    } finally {
      downloading = false;
      if (listener) await listener.remove().catch(() => {});
    }
  }

  async function checkForUpdate() {
    if (checking || document.getElementById("mandatory-app-update")?.style.display === "flex") return;
    checking = true;
    try {
      const response = await fetch(RELEASE_API + "?check=" + Date.now(), { cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
      if (!response.ok) throw new Error("GitHub respondió " + response.status);
      const release = await response.json();
      const version = Number(String(release.tag_name || "").replace(/^v/i, ""));
      const asset = (release.assets || []).find(a => a.name === "butterfly-cafe-" + APP + ".apk");
      if (Number.isFinite(version) && version > CURRENT && version > latestSeen && asset && asset.browser_download_url) {
        latestSeen = version;
        showUpdate(release, asset);
      }
    } catch (error) {
      console.warn("No se pudo comprobar la actualización", error);
    } finally {
      checking = false;
    }
  }

  function start() {
    checkForUpdate();
    window.setInterval(checkForUpdate, 60000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
    window.addEventListener("online", checkForUpdate);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
