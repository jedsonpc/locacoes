(function () {
  const statusId = "app-update-status";

  function setStatus(text) {
    const status = document.getElementById(statusId);
    if (status) status.textContent = text;
  }

  async function loadVersion() {
    try {
      const response = await fetch("./version.json?_=" + Date.now(), { cache: "no-store" });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async function registerWorker() {
    if (!("serviceWorker" in navigator)) {
      setStatus("Offline indisponivel neste navegador.");
      return;
    }
    try {
      await navigator.serviceWorker.register("./sw.js");
      setStatus("Offline ativo. Dados salvos neste dispositivo.");
    } catch {
      setStatus("Offline nao pode ser ativado agora.");
    }
  }

  window.addEventListener("DOMContentLoaded", async () => {
    registerWorker();
    const version = await loadVersion();
    const label = document.getElementById("versionLabel");
    if (version?.version && label) label.textContent = version.version;
    document.getElementById("checkUpdateBtn")?.addEventListener("click", async () => {
      const next = await loadVersion();
      setStatus(next?.version ? `Versao atual: ${next.version}` : "Nao foi possivel verificar a versao.");
    });
  });
})();
