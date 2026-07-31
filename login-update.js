(function () {
  const currentScript = document.currentScript;
  const appName = currentScript?.dataset.appName || "Aplicativo";
  let installPrompt = null;
  let waitingWorker = null;
  let refreshing = false;

  const isLoginVisible = () => {
    const login = document.querySelector("#login-form, #loginForm, [data-login]");
    if (!login || login.getClientRects().length === 0) return false;
    if (login.closest("[hidden]")) return false;
    return getComputedStyle(login).display !== "none";
  };

  function ensureStyles() {
    if (document.getElementById("login-update-styles")) return;
    const style = document.createElement("style");
    style.id = "login-update-styles";
    style.textContent = `
      .login-update-card{position:fixed;right:22px;bottom:22px;z-index:10000;width:min(390px,calc(100vw - 32px));padding:15px;background:#fff;border:1px solid #d7dde5;border-radius:14px;box-shadow:0 10px 32px rgba(15,23,42,.24);display:flex;align-items:center;gap:14px;font-family:"Segoe UI",Arial,sans-serif;color:#172033}
      .login-update-card div{display:grid;gap:3px;flex:1}.login-update-card b{font-size:14px}.login-update-card span{color:#64748b;font-size:12px;line-height:1.35}.login-update-card button{width:auto;height:auto;margin:0;border:0;border-radius:10px;padding:10px 12px;background:#17623f;color:#fff;font-weight:800;cursor:pointer;white-space:nowrap}
      .login-update-card.install button{background:#0f766e}@media(max-width:640px){.login-update-card{right:16px;bottom:16px;align-items:stretch;flex-direction:column}.login-update-card button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function showCard(kind) {
    const existing = document.getElementById("login-update-card");
    if (!isLoginVisible()) {
      existing?.remove();
      return;
    }
    if (existing?.dataset.kind === kind) return;
    ensureStyles();
    existing?.remove();
    const update = kind === "update";
    const card = document.createElement("aside");
    card.id = "login-update-card";
    card.dataset.kind = kind;
    card.className = `login-update-card ${update ? "update" : "install"}`;
    card.setAttribute("role", "status");
    card.innerHTML = `<div><b>${update ? "Nova versão disponível" : `Instalar ${appName}`}</b><span>${update ? "A atualização preserva seus dados e acessos." : "Instale o aplicativo neste dispositivo para acesso rápido."}</span></div><button type="button">${update ? "Atualizar agora" : "Instalar aplicativo"}</button>`;
    card.querySelector("button").addEventListener("click", async () => {
      if (update) {
        if (waitingWorker) waitingWorker.postMessage({ type: "SKIP_WAITING" });
        return;
      }
      if (!installPrompt) return;
      await installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      card.remove();
    });
    document.body.appendChild(card);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    showCard("install");
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    document.getElementById("login-update-card")?.remove();
  });

  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((registration) => {
      const announceWaiting = (worker) => {
        waitingWorker = worker;
        showCard("update");
      };
      if (registration.waiting && navigator.serviceWorker.controller) announceWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) announceWaiting(worker);
        });
      });
      const check = () => registration.update().catch(() => undefined);
      const checkVisible = () => { if (document.visibilityState === "visible") check(); };
      window.setInterval(check, 15 * 60 * 1000);
      window.addEventListener("focus", check);
      window.addEventListener("online", check);
      document.addEventListener("visibilitychange", checkVisible);
      check();
    }).catch(() => undefined);
  });

  new MutationObserver(() => {
    if (waitingWorker) showCard("update");
    else if (installPrompt) showCard("install");
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
})();
