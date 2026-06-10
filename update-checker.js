// update-checker.js
// Registra o service worker, procura novas versoes e permite controlar
// atualizacao automatica pela tela "Acesso e nuvem".
(function () {
  const autoUpdateKey = "gestao-auto-update-v1";
  const checkIntervalMs = 60000;

  let currentVersion = null;
  let waitingWorker = null;
  let registrationPromise = null;

  function isAutoUpdateEnabled() {
    return localStorage.getItem(autoUpdateKey) !== "off";
  }

  function setAutoUpdateEnabled(enabled) {
    localStorage.setItem(autoUpdateKey, enabled ? "on" : "off");
    updateStatusText(enabled ? "Atualizacao automatica ligada." : "Atualizacao automatica desligada.");
  }

  function updateStatusText(text) {
    const status = document.getElementById("app-update-status");
    if (status) status.textContent = text;
  }

  function showBanner() {
    if (document.getElementById("update-banner")) return;
    const bar = document.createElement("div");
    bar.id = "update-banner";
    bar.style.cssText =
      "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);" +
      "background:#5c171b;color:#fff;padding:12px 18px;border-radius:8px;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.2);z-index:9999;display:flex;gap:12px;align-items:center;font-family:Arial,sans-serif;";
    bar.innerHTML =
      '<span>Nova versao disponivel.</span>' +
      '<button id="update-btn" style="background:#fff;color:#5c171b;border:none;padding:6px 14px;border-radius:6px;font-weight:700;cursor:pointer">Atualizar agora</button>' +
      '<button id="update-later" style="background:transparent;color:#fff;border:1px solid #fff;padding:6px 10px;border-radius:6px;cursor:pointer">Depois</button>';
    document.body.appendChild(bar);

    document.getElementById("update-btn").onclick = applyUpdate;
    document.getElementById("update-later").onclick = () => bar.remove();
  }

  function applyUpdate() {
    if (waitingWorker) waitingWorker.postMessage({ type: "SKIP_WAITING" });
    setTimeout(() => location.reload(), 200);
  }

  async function fetchVersion() {
    try {
      const response = await fetch("./version.json?_=" + Date.now(), { cache: "no-store" });
      if (!response.ok) return null;
      const data = await response.json();
      return data.version || null;
    } catch {
      return null;
    }
  }

  async function checkNow(options = {}) {
    if (!registrationPromise) {
      updateStatusText("Atualizacao automatica indisponivel neste navegador.");
      return false;
    }

    const registration = await registrationPromise;
    await registration.update();

    const latestVersion = await fetchVersion();
    if (!currentVersion) currentVersion = latestVersion;

    if (latestVersion && currentVersion && latestVersion !== currentVersion) {
      updateStatusText("Nova versao encontrada.");
      if (isAutoUpdateEnabled() || options.apply) {
        applyUpdate();
      } else {
        showBanner();
      }
      return true;
    }

    updateStatusText("App atualizado.");
    return false;
  }

  function bindControls() {
    const toggle = document.getElementById("auto-update-enabled");
    const button = document.getElementById("check-app-update");

    if (toggle) {
      toggle.checked = isAutoUpdateEnabled();
      toggle.addEventListener("change", () => setAutoUpdateEnabled(toggle.checked));
    }

    if (button) {
      button.addEventListener("click", async () => {
        updateStatusText("Verificando atualizacao...");
        await checkNow({ apply: false });
      });
    }
  }

  if ("serviceWorker" in navigator) {
    registrationPromise = navigator.serviceWorker.register("./sw.js").then((registration) => {
      if (registration.waiting) {
        waitingWorker = registration.waiting;
        if (isAutoUpdateEnabled()) applyUpdate();
        else showBanner();
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            waitingWorker = newWorker;
            if (isAutoUpdateEnabled()) applyUpdate();
            else showBanner();
          }
        });
      });

      return registration;
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });

    window.addEventListener("online", () => checkNow());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkNow();
    });
    setInterval(checkNow, checkIntervalMs);
  }

  document.addEventListener("DOMContentLoaded", bindControls);

  window.AppUpdater = {
    checkNow,
    isAutoUpdateEnabled,
    setAutoUpdateEnabled,
  };
})();
