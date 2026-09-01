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

  function versionDetails(version) {
    const rawVersion = String(version?.version || "").replace(/^local-/, "");
    const match = rawVersion.match(/^(\d+\.\d+\.\d+)(?:-auto-\d{8}-\d{4})?$/);
    const label = match ? `v${match[1]}` : rawVersion ? `v${rawVersion.replace(/^v/, "")}` : "Versao indisponivel";
    const publishedAt = version?.deployedAt ? new Date(version.deployedAt) : null;
    const date = publishedAt && !Number.isNaN(publishedAt.getTime())
      ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
        timeZone: "America/Fortaleza"
      }).format(publishedAt)
      : "data indisponivel";
    return { label, date };
  }

  function showVersion(version) {
    if (!version?.version) return;
    const details = versionDetails(version);
    window.LocacoesVersionDetails = details;
    const sideLabel = document.getElementById("versionLabel");
    if (sideLabel) sideLabel.textContent = `${details.label} · ${details.date}`;
    const topLabel = document.getElementById("topVersionLabel");
    if (topLabel) topLabel.textContent = details.label;
    const topDate = document.getElementById("topAccessLabel");
    if (topDate) topDate.textContent = `Atualizado em ${details.date}`;
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
    showVersion(version);
    document.getElementById("checkUpdateBtn")?.addEventListener("click", async () => {
      const next = await loadVersion();
      showVersion(next);
      setStatus(next?.version ? `Versao atual: ${next.version}` : "Nao foi possivel verificar a versao.");
    });
  });
})();
