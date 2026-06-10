const storageKey = "gestao-locacoes-v1";
const authKey = "gestao-locacoes-auth-v1";
const sessionKey = "gestao-locacoes-session-v1";
const sessionUserKey = "gestao-locacoes-session-user-v1";
const reminderSessionKey = "gestao-locacoes-contract-reminder-v1";
const syncKey = "gestao-locacoes-sync-v1";
const cloudSyncMetaKey = "gestao-locacoes-cloud-meta-v1";
const backupKey = "gestao-locacoes-backups-v1";
const backupDirectoryDbName = "gestao-locacoes-backup-folder-v1";
const backupDirectoryStoreName = "handles";
const backupDirectoryHandleKey = "app-backup-folder";
const backupMaxItems = 25;
const preferredBackupFolderLabel = "D:\\App\\backups";
const companyName = "Imobiliaria Rio dos Passos Ltda";
const appVersion = "local-1.7.8";
const updatePackageFileName = "rio-passos-atualizacao.zip";
const updatePackageManifestFileName = "update-package.json";
const appStorage = createSafeStorage("app");
const appSessionStorage = createSafeStorage("session");

const initialState = {
  properties: [],
  clients: [],
  contracts: [],
  expenses: [],
  payments: [],
  auditLogs: [],
};

let state = loadState(); // estado inicial do cache local (sincroniza com Supabase no boot)
let syncConfig = loadSyncConfig();
let reportMode = "analytic";
let backupDirectoryHandle = null;
let backupFolderReady = false;

const roleLabels = {
  admin: "Administrador",
  financeiro: "Financeiro",
  operacional: "Operacional",
  consulta: "Consulta",
};

const rolePermissions = {
  admin: ["*"],
  financeiro: ["view", "financial:write", "reports:view"],
  operacional: ["view", "operations:write", "reports:view"],
  consulta: ["view", "reports:view"],
};

const collectionPermissions = {
  properties: "operations:write",
  clients: "operations:write",
  contracts: "operations:write",
  expenses: "financial:write",
  payments: "financial:write",
};

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
});

const viewTitles = {
  dashboard: "Painel",
  properties: "Imoveis",
  clients: "Clientes",
  contracts: "Contratos",
  expenses: "Despesas",
  payments: "Pagamentos",
  "financial-erp": "ERP financeiro",
  reports: "Relatorios",
  settings: "Acesso e nuvem",
};

const chargeRules = [
  {
    key: "condoFeeResponsible",
    label: "Taxa de condominio",
    kind: "monthly",
    day: 5,
    baseLabel: "Dia 05 de cada mes",
  },
  {
    key: "iptuResponsible",
    label: "IPTU",
    kind: "annual",
    month: 1,
    day: 10,
    baseLabel: "10/02",
  },
  {
    key: "spuResponsible",
    label: "SPU",
    kind: "annual",
    month: 5,
    day: 30,
    baseLabel: "30/06",
  },
  {
    key: "fireFeeResponsible",
    label: "Taxa de bombeiros",
    kind: "annual",
    month: 7,
    day: 31,
    baseLabel: "31/08",
  },
];

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.SupabaseSync) {
    location.href = "login.html";
    return;
  }

  const user = await window.SupabaseSync.getCurrentUser();
  if (!user) { location.href = "login.html"; return; }
  activateSupabaseSession(user);

  await reconcileCloudState();

  window.SupabaseSync.subscribeChanges((newData, remoteUpdatedAt) => {
    createLocalBackup("before_cloud_download", state, { force: true });
    state = sanitizeRemoteState(newData);
    saveLocalState(state);
    createLocalBackup("auto_save", state, { force: true });
    markRemoteStateApplied(remoteUpdatedAt);
    renderAll();
  });

  await initializeAuth();
  initializeBackupFolder();
  bindNavigation();
  bindForms();
  bindUtilities();
  bindTableActions();
  renderAll();
});

function createSafeStorage(kind) {
  const fallback = new Map();
  try {
    const nativeStorage = kind === "session" ? globalThis.sessionStorage : globalThis.localStorage;
    const testKey = `storage-test-${Date.now()}`;
    nativeStorage.setItem(testKey, "1");
    nativeStorage.removeItem(testKey);
    return nativeStorage;
  } catch {
    return {
      getItem: (key) => (fallback.has(key) ? fallback.get(key) : null),
      setItem: (key, value) => fallback.set(key, String(value)),
      removeItem: (key) => fallback.delete(key),
    };
  }
}

function loadState() {
  const stored = appStorage.getItem(storageKey);
  if (!stored) return structuredClone(initialState);

  try {
    return { ...structuredClone(initialState), ...JSON.parse(stored) };
  } catch {
    return structuredClone(initialState);
  }
}

function saveLocalState(nextState = state) {
  appStorage.setItem(storageKey, JSON.stringify(nextState));
}

function saveState() {
  try {
    markLocalStateChanged();
    saveLocalState(state);
    createLocalBackup("auto_save", state);
  } catch (error) {
    console.error("Falha ao salvar dados localmente:", error);
  }

  // Salva no Supabase (debounce 300ms) + cache local
  if (window.SupabaseSync) {
    window.SupabaseSync.saveRemoteState(state);
    return true;
  }
  // Fallback se Supabase nao estiver configurado
  try {
    saveLocalState(state);
    createLocalBackup("auto_save", state);
    return true;
  } catch (error) {
    console.error("Falha ao salvar dados localmente:", error);
    try {
      alert(
        "Nao foi possivel salvar os dados neste navegador.\n" +
        "Causa provavel: armazenamento cheio ou navegacao privada.\n" +
        "Detalhe tecnico: " + (error && error.message ? error.message : error)
      );
    } catch {
      console.warn("Nao foi possivel exibir o alerta de falha de armazenamento.");
    }
    return false;
  }
}

function loadBackups() {
  try {
    const stored = JSON.parse(appStorage.getItem(backupKey));
    return Array.isArray(stored?.items) ? stored.items : [];
  } catch {
    return [];
  }
}

function saveBackups(items) {
  appStorage.setItem(backupKey, JSON.stringify({ items: items.slice(0, backupMaxItems) }));
}

function getBackupReasonLabel(reason) {
  const labels = {
    auto_save: "Automatico",
    manual: "Manual",
    before_clear: "Antes de limpar dados",
    before_delete: "Antes de excluir",
    before_cloud_download: "Antes de baixar da nuvem",
    before_cloud_upload: "Antes de enviar para nuvem",
    before_restore: "Antes de restaurar",
    imported: "Importado",
  };
  return labels[reason] || reason || "Backup";
}

function createBackupFileName(createdAt = new Date().toISOString()) {
  return `rio-passos-backup-${createdAt.replace(/[:.]/g, "-")}.json`;
}

function createBackupEnvelope(reason, sourceState = state) {
  const createdAt = new Date().toISOString();
  const safeState = sanitizeRemoteState(sourceState);
  const id = uid("backup");
  return {
    id,
    createdAt,
    reason,
    reasonLabel: getBackupReasonLabel(reason),
    company: companyName,
    appVersion,
    storageAddress: backupFolderReady ? `${preferredBackupFolderLabel}\\${createBackupFileName(createdAt)}` : `localStorage:${backupKey}:${id}`,
    fileName: createBackupFileName(createdAt),
    counts: getBusinessCounts(safeState),
    state: safeState,
  };
}

function hasSameBackupSnapshot(left, right) {
  if (!left || !right) return false;
  return JSON.stringify(left.counts || {}) === JSON.stringify(right.counts || {})
    && JSON.stringify(left.state || {}) === JSON.stringify(right.state || {});
}

function createLocalBackup(reason = "auto_save", sourceState = state, options = {}) {
  if (!hasBusinessData(sourceState) && reason !== "before_restore") return null;
  const backup = createBackupEnvelope(reason, sourceState);
  const existing = loadBackups();
  if (!options.force && reason === "auto_save" && hasSameBackupSnapshot(backup, existing[0])) {
    return existing[0] || null;
  }
  const nextItems = [backup, ...existing.filter((item) => item.id !== backup.id)].slice(0, backupMaxItems);
  try {
    saveBackups(nextItems);
  } catch (error) {
    const trimmed = nextItems.slice(0, Math.max(5, backupMaxItems - 10));
    try {
      saveBackups(trimmed);
    } catch (retryError) {
      console.error("Falha ao gerar backup local:", retryError || error);
      return null;
    }
  }
  writeBackupToSelectedFolder(backup).catch((error) => {
    console.warn("Backup automatico em pasta nao gravado:", error);
  });
  renderBackupPanel();
  return backup;
}

function isFileSystemBackupSupported() {
  return typeof window.showDirectoryPicker === "function" && typeof indexedDB !== "undefined";
}

function openBackupDirectoryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(backupDirectoryDbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(backupDirectoryStoreName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function setBackupDirectoryHandle(handle) {
  const db = await openBackupDirectoryDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(backupDirectoryStoreName, "readwrite");
    tx.objectStore(backupDirectoryStoreName).put(handle, backupDirectoryHandleKey);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getBackupDirectoryHandle() {
  if (!isFileSystemBackupSupported()) return null;
  if (backupDirectoryHandle) return backupDirectoryHandle;
  try {
    const db = await openBackupDirectoryDb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(backupDirectoryStoreName, "readonly");
      const request = tx.objectStore(backupDirectoryStoreName).get(backupDirectoryHandleKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    backupDirectoryHandle = handle;
    return handle;
  } catch (error) {
    console.warn("Nao foi possivel carregar a pasta de backup:", error);
    return null;
  }
}

async function ensureBackupDirectoryPermission(handle, mode = "readwrite") {
  if (!handle) return false;
  const options = { mode };
  if ((await handle.queryPermission(options)) === "granted") return true;
  return (await handle.requestPermission(options)) === "granted";
}

async function chooseBackupFolder() {
  if (!requirePermission("admin:write", "Apenas administradores podem configurar backups em pasta.")) return;
  if (!isFileSystemBackupSupported()) {
    setText("backup-message", "Este navegador nao permite gravar automaticamente em pasta. Use o botao Baixar backup.");
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ id: "rio-passos-backups", mode: "readwrite" });
    if (!(await ensureBackupDirectoryPermission(handle))) {
      setText("backup-message", "Permissao de escrita nao concedida para a pasta escolhida.");
      return;
    }
    backupDirectoryHandle = handle;
    backupFolderReady = true;
    await setBackupDirectoryHandle(handle);
    const backup = createLocalBackup("manual", state, { force: true });
    const targetPath = `${handle.name}\\backups`;
    setText("backup-message", backup
      ? `Pasta configurada. Backup gravado em ${targetPath}\\${backup.fileName}. Se voce selecionou D:\\App, o arquivo ficou em ${preferredBackupFolderLabel}.`
      : `Pasta configurada: ${targetPath}. O proximo cadastro alterado gerara o backup automatico.`);
    renderBackupPanel();
  } catch (error) {
    if (error?.name !== "AbortError") {
      setText("backup-message", `Nao foi possivel configurar a pasta: ${error.message || error}`);
    }
  }
}

async function initializeBackupFolder() {
  const handle = await getBackupDirectoryHandle();
  backupFolderReady = Boolean(handle && await ensureBackupDirectoryPermission(handle));
  renderBackupPanel();
}

async function writeBackupToSelectedFolder(backup) {
  if (!backup || !isFileSystemBackupSupported()) return false;
  const handle = await getBackupDirectoryHandle();
  if (!handle || !(await ensureBackupDirectoryPermission(handle))) {
    backupFolderReady = false;
    return false;
  }
  backupFolderReady = true;
  const backupsDir = await handle.getDirectoryHandle("backups", { create: true });
  const fileName = backup.fileName || createBackupFileName(backup.createdAt);
  const fileHandle = await backupsDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify({ ...backup, storageAddress: `${handle.name}\\backups\\${fileName}` }, null, 2));
  await writable.close();
  return true;
}

function getLatestBackup() {
  return loadBackups().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

function downloadJsonFile(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function reconcileCloudState() {
  const localState = sanitizeRemoteState(state);
  const remote = await window.SupabaseSync.loadRemoteState({ fallbackToCache: false, includeMetadata: true });

  if (!remote) {
    if (hasBusinessData(localState)) {
      state = localState;
      await saveRemoteStateNowAndTrack(state);
    }
    return;
  }

  const remoteState = sanitizeRemoteState(remote.state || remote);
  const remoteUpdatedAt = remote.updatedAt || null;
  if (shouldPreferLocalState(localState, remoteState, remoteUpdatedAt)) {
    state = localState;
    await saveRemoteStateNowAndTrack(state);
    return;
  }

  state = remoteState;
  createLocalBackup("before_cloud_download", localState, { force: true });
  saveLocalState(state);
  createLocalBackup("auto_save", state, { force: true });
  markRemoteStateApplied(remoteUpdatedAt);
}

function hasBusinessData(nextState) {
  return ["properties", "clients", "contracts", "expenses", "payments"].some(
    (collection) => Array.isArray(nextState[collection]) && nextState[collection].length > 0
  );
}

function shouldPreferLocalState(localState, remoteState, remoteUpdatedAt = null) {
  if (getCountReductionWarnings(getBusinessCounts(localState), getBusinessCounts(remoteState)).length) {
    return false;
  }
  const localUpdatedAt = getLocalStateUpdatedAt(localState);
  if (remoteUpdatedAt && localUpdatedAt) {
    return new Date(localUpdatedAt).getTime() > new Date(remoteUpdatedAt).getTime();
  }
  if (remoteUpdatedAt && !localUpdatedAt) return false;
  if (localUpdatedAt && !remoteUpdatedAt) return true;

  const localProperties = localState.properties.length;
  const remoteProperties = remoteState.properties.length;
  if (localProperties > remoteProperties) return true;
  if (remoteProperties > localProperties) return false;
  return countBusinessRecords(localState) > countBusinessRecords(remoteState);
}

function countBusinessRecords(nextState) {
  return ["properties", "clients", "contracts", "expenses", "payments"].reduce(
    (total, collection) => total + (Array.isArray(nextState[collection]) ? nextState[collection].length : 0),
    0
  );
}

function getBusinessCounts(nextState = state) {
  return ["properties", "clients", "contracts", "expenses", "payments"].reduce(
    (counts, collection) => {
      counts[collection] = Array.isArray(nextState[collection]) ? nextState[collection].length : 0;
      return counts;
    },
    {}
  );
}

function getCountReductionWarnings(localCounts, remoteCounts) {
  const labels = {
    properties: "imoveis",
    clients: "clientes",
    contracts: "contratos",
    expenses: "despesas",
    payments: "receitas",
  };
  return Object.keys(labels)
    .filter((collection) => (remoteCounts[collection] || 0) > (localCounts[collection] || 0))
    .map((collection) => `${labels[collection]}: nuvem ${remoteCounts[collection] || 0}, navegador ${localCounts[collection] || 0}`);
}

async function loadRemoteStateForSafety() {
  if (!window.SupabaseSync) return null;
  const remote = await window.SupabaseSync.loadRemoteState({ fallbackToCache: false, includeMetadata: true });
  if (!remote) return null;
  return sanitizeRemoteState(remote.state || remote);
}

function loadCloudSyncMeta() {
  try {
    return JSON.parse(appStorage.getItem(cloudSyncMetaKey)) || {};
  } catch {
    return {};
  }
}

function saveCloudSyncMeta(meta) {
  appStorage.setItem(cloudSyncMetaKey, JSON.stringify({ ...loadCloudSyncMeta(), ...meta }));
}

function markLocalStateChanged() {
  saveCloudSyncMeta({ localChangedAt: new Date().toISOString() });
}

function markRemoteStateApplied(remoteUpdatedAt) {
  saveCloudSyncMeta({ remoteUpdatedAt: remoteUpdatedAt || new Date().toISOString(), localChangedAt: null });
}

function getLocalStateUpdatedAt(nextState) {
  const meta = loadCloudSyncMeta();
  const candidates = [
    meta.localChangedAt,
    ...["properties", "clients", "contracts", "expenses", "payments"].flatMap((collection) =>
      Array.isArray(nextState[collection]) ? nextState[collection].map((item) => item.updatedAt) : []
    ),
    ...(Array.isArray(nextState.auditLogs) ? nextState.auditLogs.map((log) => log.createdAt) : []),
  ];
  return candidates
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0]?.toISOString() || null;
}

async function saveRemoteStateNowAndTrack(nextState) {
  const saveNow = window.SupabaseSync.saveRemoteStateNow || window.SupabaseSync.saveRemoteState;
  const result = await saveNow(nextState);
  if (result?.updatedAt) markRemoteStateApplied(result.updatedAt);
  return result;
}

function loadSyncConfig() {
  try {
    return JSON.parse(appStorage.getItem(syncKey)) || { endpoint: "", token: "" };
  } catch {
    return { endpoint: "", token: "" };
  }
}

function saveSyncConfig() {
  appStorage.setItem(syncKey, JSON.stringify(syncConfig));
}

async function initializeAuth() {
  purgeLocalAccessUsers();

  if (appSessionStorage.getItem(sessionKey) === "active" && !getCurrentUser()) {
    appSessionStorage.removeItem(sessionKey);
  }
  document.body.classList.toggle("locked", appSessionStorage.getItem(sessionKey) !== "active");
  const syncForm = document.getElementById("sync-form");
  if (syncForm) {
    syncForm.elements.endpoint.value = syncConfig.endpoint || "";
    syncForm.elements.token.value = syncConfig.token || "";
  }
  const accessForm = document.getElementById("access-form");
  if (accessForm) {
    accessForm.reset();
    accessForm.elements.id.value = "";
  }
  updateSyncStatus();
}

function purgeLocalAccessUsers() {
  appStorage.removeItem(authKey);
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function bindNavigation() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.view;
      if (!canAccessView(target)) {
        alert("Seu perfil nao tem permissao para acessar esta area.");
        return;
      }
      document.querySelectorAll(".nav-button").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(target).classList.add("active");
      document.getElementById("view-title").textContent = viewTitles[target];
      renderAll();
    });
  });
}

function bindForms() {
  document.getElementById("login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await login(event.currentTarget);
  });

  document.getElementById("property-form").addEventListener("submit", (event) => {
    event.preventDefault();
    upsertFromForm(event.currentTarget, "properties", "property", normalizeProperty);
  });

  document.getElementById("client-form").addEventListener("submit", (event) => {
    event.preventDefault();
    upsertFromForm(event.currentTarget, "clients", "client", normalizeClient);
  });
  const clientDocumentInput = document.querySelector("#client-form [name='document']");
  clientDocumentInput?.addEventListener("input", () => {
    clientDocumentInput.value = formatCpfCnpj(clientDocumentInput.value);
  });
  clientDocumentInput?.addEventListener("blur", () => validateAndFillClientDocument(clientDocumentInput.form));

  document.getElementById("contract-form").addEventListener("submit", (event) => {
    event.preventDefault();
    upsertFromForm(event.currentTarget, "contracts", "contract", normalizeContract);
  });

  document.getElementById("expense-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const contract = updateExpenseContractInfo(event.currentTarget);
    if (!contract) {
      alert("Para lancar despesa, selecione um imovel com contrato vinculado.");
      return;
    }
    upsertFromForm(event.currentTarget, "expenses", "expense", normalizeExpense);
  });
  const expenseForm = document.getElementById("expense-form");
  ["propertyId", "expenseDate", "contractPicker"].forEach((name) => {
    expenseForm.elements[name]?.addEventListener("change", () => updateExpenseContractInfo(expenseForm));
  });

  const paymentForm = document.getElementById("payment-form");
  paymentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    updatePaymentTotal(paymentForm);
    const contract = updatePaymentContractInfo(paymentForm);
    if (!contract) {
      alert("Para lancar receita, selecione um imovel com contrato vinculado.");
      return;
    }
    upsertFromForm(event.currentTarget, "payments", "payment", normalizePayment);
  });
  ["amount", "chargeAmount"].forEach((name) => {
    paymentForm.elements[name].addEventListener("input", () => updatePaymentTotal(paymentForm));
  });
  ["propertyId", "paymentDate"].forEach((name) => {
    paymentForm.elements[name].addEventListener("change", () => updatePaymentContractInfo(paymentForm));
  });
  paymentForm.elements.contractPicker?.addEventListener("change", () => updatePaymentContractInfo(paymentForm));

  document.querySelectorAll("[data-reset]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.reset).reset();
      document.getElementById(button.dataset.reset).elements.id.value = "";
      if (button.dataset.reset === "payment-form") {
        updatePaymentTotal(document.getElementById("payment-form"));
        updatePaymentContractInfo(document.getElementById("payment-form"));
      }
      if (button.dataset.reset === "expense-form") {
        updateExpenseContractInfo(document.getElementById("expense-form"));
      }
    });
  });

  document.getElementById("access-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateAccess(event.currentTarget);
  });

  document.getElementById("sync-form").addEventListener("submit", (event) => {
    event.preventDefault();
    updateSyncConfig(event.currentTarget);
  });

  ["report-dataset", "report-property", "report-client", "report-status", "report-expense-type", "report-start", "report-end", "report-min-value", "report-max-value"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderReports);
    document.getElementById(id).addEventListener("change", renderReports);
  });

  setupErpPeriodFilters();
  ["erp-year", "erp-start-month", "erp-end-month"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderFinancialErp);
    document.getElementById(id).addEventListener("change", renderFinancialErp);
  });

  ["audit-start", "audit-end"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderAuditLogs);
    document.getElementById(id)?.addEventListener("change", renderAuditLogs);
  });
  document.getElementById("audit-clear-period")?.addEventListener("click", () => {
    document.getElementById("audit-start").value = "";
    document.getElementById("audit-end").value = "";
    renderAuditLogs();
  });

  document.querySelectorAll("[data-report-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      reportMode = button.dataset.reportMode;
      document.querySelectorAll("[data-report-mode]").forEach((item) => item.classList.toggle("active", item === button));
      renderReports();
    });
  });
}

function bindUtilities() {
  document.getElementById("seed-data").addEventListener("click", () => {
    createLocalBackup("before_restore", state, { force: true });
    state = createSampleData();
    saveState();
    renderAll();
  });

  document.getElementById("clear-data").addEventListener("click", () => {
    if (!requirePermission("admin:write", "Apenas administradores podem limpar os dados.")) return;
    if (!confirm("Deseja apagar todos os dados cadastrados neste navegador?")) return;
    createLocalBackup("before_clear", state, { force: true });
    state = structuredClone(initialState);
    addAuditLog("data_cleared", "system", "", null, { message: "Base local limpa pelo usuario." }, false);
    saveState();
    renderAll();
  });

  document.getElementById("export-csv").addEventListener("click", exportReportsCsv);
  document.getElementById("erp-export-pdf")?.addEventListener("click", exportFinancialErpPdf);
  document.getElementById("erp-export-excel")?.addEventListener("click", exportFinancialErpExcel);
  document.getElementById("erp-export-csv")?.addEventListener("click", exportFinancialErpCsv);
  document.getElementById("export-excel").addEventListener("click", exportReportsExcel);
  document.getElementById("export-pdf").addEventListener("click", exportReportsPdf);
  document.getElementById("open-property-document").addEventListener("click", openPropertyDocumentFromForm);
  document.getElementById("logout").addEventListener("click", logout);
  document.getElementById("sync-download").addEventListener("click", downloadFromCloud);
  document.getElementById("sync-upload").addEventListener("click", uploadToCloud);
  document.getElementById("backup-create")?.addEventListener("click", createManualBackup);
  document.getElementById("backup-folder")?.addEventListener("click", chooseBackupFolder);
  document.getElementById("backup-download")?.addEventListener("click", downloadSelectedBackup);
  document.getElementById("backup-restore")?.addEventListener("click", restoreSelectedBackup);
  document.getElementById("backup-import-file")?.addEventListener("change", importBackupFile);
  document.getElementById("download-app-update")?.addEventListener("click", downloadAppUpdatePackage);
  setText("update-package-name", updatePackageFileName);
  refreshUpdatePackageInfo();
}

async function refreshUpdatePackageInfo() {
  const packageInfo = await getUpdatePackageInfo();
  setText("update-package-name", packageInfo.fileName);
}

async function getUpdatePackageInfo() {
  try {
    const response = await fetch(`${updatePackageManifestFileName}?_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Manifesto indisponivel");
    const data = await response.json();
    return {
      fileName: data.fileName || updatePackageFileName,
      version: data.version || appVersion,
    };
  } catch {
    return { fileName: updatePackageFileName, version: appVersion };
  }
}

async function downloadAppUpdatePackage() {
  const packageInfo = await getUpdatePackageInfo();
  const link = document.createElement("a");
  link.href = packageInfo.fileName;
  link.download = packageInfo.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setText("app-update-status", `Download do pacote ${packageInfo.version} iniciado. Use o arquivo ZIP para atualizar outra maquina.`);
}

function openPropertyDocumentFromForm() {
  const form = document.getElementById("property-form");
  const link = form.elements.documentLink.value.trim();
  if (!link) {
    alert("Informe o link da documentacao do imovel no Google Drive.");
    return;
  }
  try {
    const url = new URL(link);
    window.open(url.href, "_blank", "noopener");
  } catch {
    alert("Informe um link valido para abrir a documentacao.");
  }
}

async function login(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    const email = String(data.username || "").trim();
    await window.SupabaseSync.signIn(email, data.password || "");
    const user = await window.SupabaseSync.getCurrentUser();
    if (!user) throw new Error("Sessao Supabase nao retornada.");
    activateSupabaseSession(user);
    addAuditLog("login_success", "auth", user.id, null, { username: user.email || email, role: "admin" }, false);
    form.reset();
    setText("login-message", "");
    renderAll();
  } catch (error) {
    addAuditLog("login_failed", "auth", "", null, { username: String(data.username || "").trim() }, false);
    setText("login-message", `Falha no login Supabase: ${error.message || error}`);
  }
}

async function logout() {
  const user = getCurrentUser();
  if (user) addAuditLog("logout", "auth", user.id, null, { username: user.username }, false);
  if (window.SupabaseSync) await window.SupabaseSync.signOut();
  appSessionStorage.removeItem(sessionKey);
  appSessionStorage.removeItem(sessionUserKey);
  if (window.SupabaseSync) {
    location.href = "login.html";
    return;
  }
  document.body.classList.add("locked");
}

function activateSupabaseSession(user) {
  const email = user.email || "usuario@supabase";
  appSessionStorage.setItem(sessionKey, "active");
  appSessionStorage.setItem(sessionUserKey, JSON.stringify({
    id: user.id,
    username: email,
    role: "admin",
  }));
}

async function updateAccess(form) {
  form?.reset();
  purgeLocalAccessUsers();
  setText("settings-message", "As senhas locais foram removidas. Gerencie usuarios e senhas diretamente no Supabase.");
}

function updateSyncConfig(form) {
  if (!requirePermission("admin:write", "Apenas administradores podem alterar a sincronizacao.")) return;
  const data = Object.fromEntries(new FormData(form).entries());
  syncConfig = {
    endpoint: data.endpoint.trim(),
    token: data.token.trim(),
  };
  saveSyncConfig();
  updateSyncStatus();
  setText("settings-message", syncConfig.endpoint ? "Configuracao de nuvem salva." : "Sincronizacao online desativada.");
}

function upsertFromForm(form, collectionName, prefix, normalizer = (value) => value) {
  if (!canWriteCollection(collectionName)) {
    setText("settings-message", "Seu perfil nao permite alterar este cadastro.");
    alert("Seu perfil nao permite alterar este cadastro.");
    return;
  }
  const data = Object.fromEntries(new FormData(form).entries());
  let record;
  try {
    record = normalizer({
      ...data,
      id: data.id || uid(prefix),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    alert(error.message || "Nao foi possivel salvar o registro.");
    return;
  }

  const index = state[collectionName].findIndex((item) => item.id === record.id);
  const before = index >= 0 ? state[collectionName][index] : null;
  if (index >= 0) {
    state[collectionName][index] = record;
  } else {
    state[collectionName].push(record);
  }

  addAuditLog(index >= 0 ? "record_updated" : "record_created", collectionName, record.id, before, record, isFinancialCollection(collectionName));
  saveState();
  form.reset();
  form.elements.id.value = "";
  renderAll();
}

function normalizeProperty(record) {
  return {
    ...record,
    description: String(record.description || "").trim(),
    type: String(record.type || "").trim(),
    area: String(record.area || "").trim(),
    location: String(record.location || "").trim(),
    documentLink: String(record.documentLink || "").trim(),
    investmentValue: record.investmentValue === "" || record.investmentValue == null
      ? 0
      : Number(record.investmentValue) || 0,
  };
}

function normalizeClient(record) {
  const documentValue = formatCpfCnpj(record.document);
  const digits = onlyDigits(documentValue);
  if (digits.length === 11 && !isValidCpf(digits)) {
    throw new Error("CPF invalido. Confira os digitos informados.");
  }
  if (digits.length === 14 && !isValidCnpj(digits)) {
    throw new Error("CNPJ invalido. Confira os digitos informados.");
  }
  if (![11, 14].includes(digits.length)) {
    throw new Error("Informe um CPF com 11 digitos ou CNPJ com 14 digitos.");
  }
  return {
    ...record,
    document: documentValue,
    name: String(record.name || "").trim(),
    contact: String(record.contact || "").trim(),
    phone: String(record.phone || "").trim(),
    email: String(record.email || "").trim(),
  };
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCpfCnpj(value) {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const calc = (size) => {
    const sum = cpf.slice(0, size).split("").reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0);
    const result = 11 - (sum % 11);
    return result > 9 ? 0 : result;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base, weights) => {
    const sum = base.split("").reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const result = sum % 11;
    return result < 2 ? 0 : 11 - result;
  };
  const first = calc(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calc(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(cnpj[12]) && second === Number(cnpj[13]);
}

async function validateAndFillClientDocument(form) {
  if (!form) return;
  const input = form.elements.document;
  const nameInput = form.elements.name;
  const digits = onlyDigits(input.value);
  input.value = formatCpfCnpj(input.value);
  if (!digits) {
    setText("client-document-message", "");
    return;
  }
  if (digits.length === 11) {
    setText("client-document-message", isValidCpf(digits)
      ? "CPF validado pelos digitos verificadores. A Receita Federal nao oferece consulta publica oficial do nome do titular para preenchimento automatico."
      : "CPF invalido. Confira os digitos informados.");
    return;
  }
  if (digits.length !== 14 || !isValidCnpj(digits)) {
    setText("client-document-message", "CNPJ invalido. Confira os digitos informados.");
    return;
  }
  setText("client-document-message", "CNPJ valido. Buscando dados publicos da empresa...");
  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const companyNameValue = data.razao_social || data.nome_fantasia || "";
    if (companyNameValue) nameInput.value = companyNameValue;
    setText("client-document-message", companyNameValue
      ? `Dados publicos carregados para ${companyNameValue}.`
      : "CNPJ validado, mas a consulta nao retornou nome empresarial.");
  } catch (error) {
    setText("client-document-message", "CNPJ validado pelos digitos. Nao foi possivel consultar os dados publicos agora.");
  }
}

function normalizeContract(record) {
  return {
    ...record,
    monthlyValue: Number(record.monthlyValue || 0),
    dueDay: Number(record.dueDay || 1),
    condoFeeResponsible: record.condoFeeResponsible || "cliente",
    iptuResponsible: record.iptuResponsible || "cliente",
    spuResponsible: record.spuResponsible || "cliente",
    fireFeeResponsible: record.fireFeeResponsible || "cliente",
  };
}

function normalizeExpense(record) {
  const contract = findFinancialContract(record.propertyId, record.expenseDate, record.contractId || record.contractPicker);
  const client = findClient(contract?.clientId);
  const { contractPicker, ...cleanRecord } = record;
  return {
    ...cleanRecord,
    contractId: contract?.id || "",
    contractCode: contract ? getContractCode(contract) : "",
    lessorName: client?.name || "",
    amount: Number(record.amount || 0),
    note: String(record.note || "").trim(),
  };
}

function normalizePayment(record) {
  const amount = Number(record.amount || 0);
  const chargeAmount = Number(record.chargeAmount || 0);
  const contract = findFinancialContract(record.propertyId, record.paymentDate, record.contractId || record.contractPicker);
  const client = findClient(contract?.clientId);
  const { contractPicker, ...cleanRecord } = record;
  return {
    ...cleanRecord,
    contractId: contract?.id || "",
    contractCode: contract ? getContractCode(contract) : "",
    lessorName: client?.name || "",
    amount,
    chargeAmount,
    totalAmount: amount + chargeAmount,
    history: String(record.history || "").trim(),
  };
}

function updatePaymentTotal(form = document.getElementById("payment-form")) {
  const amount = Number(form.elements.amount.value || 0);
  const chargeAmount = Number(form.elements.chargeAmount.value || 0);
  form.elements.totalAmount.value = (amount + chargeAmount).toFixed(2);
}

function updatePaymentContractInfo(form = document.getElementById("payment-form")) {
  return updateFinancialContractInfo(form, "paymentDate");
}

function updateExpenseContractInfo(form = document.getElementById("expense-form")) {
  return updateFinancialContractInfo(form, "expenseDate");
}

function updateFinancialContractInfo(form, dateFieldName) {
  if (!form) return null;
  const propertyId = form.elements.propertyId?.value || "";
  const launchDate = form.elements[dateFieldName]?.value || "";
  const preferredContractId = form.elements.contractId?.value || form.elements.contractPicker?.value || "";
  const contracts = getContractsForProperty(propertyId);
  const activeContract = findActiveContractForDate(contracts, launchDate);
  const contract = activeContract
    || contracts.find((item) => item.id === preferredContractId)
    || (contracts.length === 1 ? contracts[0] : null);
  const client = findClient(contract?.clientId);

  updateContractPicker(form, contracts, contract, Boolean(propertyId && launchDate && !activeContract && contracts.length));
  if (form.elements.contractId) form.elements.contractId.value = contract?.id || "";
  if (form.elements.contractCode) form.elements.contractCode.value = contract ? getContractCode(contract) : "";
  if (form.elements.lessorName) form.elements.lessorName.value = client?.name || "";
  return contract || null;
}

function updateContractPicker(form, contracts, selectedContract, shouldShow) {
  const picker = form.elements.contractPicker;
  const container = picker?.closest(".contract-manual");
  if (!picker || !container) return;
  picker.innerHTML = "";
  picker.append(new Option(contracts.length ? "Selecione o contrato" : "Nenhum contrato cadastrado", ""));
  contracts.forEach((contract) => picker.append(new Option(getContractOptionLabel(contract), contract.id)));
  picker.required = shouldShow && contracts.length > 1;
  picker.disabled = !shouldShow;
  container.classList.toggle("hidden", !shouldShow);
  picker.value = selectedContract?.id || "";
}

function getContractOptionLabel(contract) {
  const client = findClient(contract.clientId);
  return `${getContractCode(contract)} - ${client?.name || "Cliente"} - ${formatDate(contract.startDate)} a ${formatDate(contract.endDate)}`;
}

async function downloadFromCloud() {
  if (!requirePermission("admin:write", "Apenas administradores podem baixar dados da nuvem.")) return;
  if (window.SupabaseSync) {
    setText("settings-message", "Baixando dados do Supabase...");
    try {
      const remote = await window.SupabaseSync.loadRemoteState({ fallbackToCache: false, includeMetadata: true });
      if (!remote) {
        setText("settings-message", "Ainda nao ha dados salvos no Supabase para este workspace.");
        return;
      }
      createLocalBackup("before_cloud_download", state, { force: true });
      state = sanitizeRemoteState(remote.state || remote);
      saveLocalState(state);
      createLocalBackup("auto_save", state, { force: true });
      markRemoteStateApplied(remote.updatedAt || null);
      renderAll();
      setText("settings-message", `Dados do Supabase aplicados. Imoveis carregados: ${state.properties.length}.`);
    } catch (error) {
      setText("settings-message", `Nao foi possivel baixar do Supabase: ${error.message}`);
    }
    return;
  }
  if (!ensureSyncConfigured()) return;
  setText("settings-message", "Baixando dados da nuvem...");
  try {
    const response = await fetch(syncConfig.endpoint, { headers: getSyncHeaders() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    createLocalBackup("before_cloud_download", state, { force: true });
    state = sanitizeRemoteState(payload.state || payload);
    addAuditLog("cloud_download", "sync", "", null, { endpoint: syncConfig.endpoint }, false);
    saveState();
    renderAll();
    setText("settings-message", "Dados baixados e aplicados com sucesso.");
  } catch (error) {
    setText("settings-message", `Nao foi possivel baixar: ${error.message}`);
  }
}

async function uploadToCloud() {
  if (!requirePermission("admin:write", "Apenas administradores podem enviar dados para a nuvem.")) return;
  if (window.SupabaseSync) {
    setText("settings-message", "Enviando todos os dados deste navegador para o Supabase...");
    try {
      state = sanitizeRemoteState(state);
      createLocalBackup("before_cloud_upload", state, { force: true });
      const remoteState = await loadRemoteStateForSafety();
      if (remoteState) {
        const warnings = getCountReductionWarnings(getBusinessCounts(state), getBusinessCounts(remoteState));
        if (warnings.length && !confirm(`A nuvem tem mais registros que este navegador:\n${warnings.join("\n")}\n\nEnviar mesmo assim pode manter apenas os registros deste navegador. Deseja continuar?`)) {
          setText("settings-message", "Envio cancelado para proteger os dados da nuvem.");
          return;
        }
      }
      addAuditLog("cloud_upload", "sync", "", null, { target: "Supabase", records: countBusinessRecords(state) }, false);
      saveLocalState(state);
      const result = window.SupabaseSync.saveRemoteStateNow
        ? await window.SupabaseSync.saveRemoteStateNow(state)
        : (window.SupabaseSync.saveRemoteState(state), null);
      if (result?.updatedAt) markRemoteStateApplied(result.updatedAt);
      const counts = result?.counts || {};
      setText(
        "settings-message",
        `Supabase atualizado com os dados deste navegador: ${counts.properties ?? state.properties.length} imoveis, ${counts.clients ?? state.clients.length} clientes, ${counts.contracts ?? state.contracts.length} contratos, ${counts.payments ?? state.payments.length} receitas e ${counts.expenses ?? state.expenses.length} despesas.`,
      );
    } catch (error) {
      setText("settings-message", `Nao foi possivel enviar ao Supabase: ${error.message}`);
    }
    return;
  }
  if (!ensureSyncConfigured()) return;
  setText("settings-message", "Enviando dados para a nuvem...");
  try {
    createLocalBackup("before_cloud_upload", state, { force: true });
    const response = await fetch(syncConfig.endpoint, {
      method: "PUT",
      headers: { ...getSyncHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ company: companyName, updatedAt: new Date().toISOString(), state }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    addAuditLog("cloud_upload", "sync", "", null, { endpoint: syncConfig.endpoint }, false);
    setText("settings-message", "Dados enviados para a nuvem com sucesso.");
  } catch (error) {
    setText("settings-message", `Nao foi possivel enviar: ${error.message}`);
  }
}

function createManualBackup() {
  if (!requirePermission("admin:write", "Apenas administradores podem gerar backup manual.")) return;
  const backup = createLocalBackup("manual", state, { force: true });
  renderBackupPanel();
  setText(
    "backup-message",
    backup
      ? `Backup gerado: ${backup.fileName}. Endereco: ${backup.storageAddress}.`
      : "Nao ha dados de negocio para gerar backup."
  );
}

function getSelectedBackup() {
  const select = document.getElementById("backup-select");
  const backupId = select?.value;
  const backups = loadBackups();
  return backups.find((backup) => backup.id === backupId) || backups[0] || null;
}

function downloadSelectedBackup() {
  if (!requirePermission("admin:write", "Apenas administradores podem baixar backups.")) return;
  const backup = getSelectedBackup();
  if (!backup) {
    setText("backup-message", "Nenhum backup disponivel para download.");
    return;
  }
  downloadJsonFile(backup.fileName || createBackupFileName(backup.createdAt), backup);
  setText("backup-message", `Download iniciado: ${backup.fileName}.`);
}

function restoreBackupEnvelope(backup, sourceLabel = "backup local") {
  if (!requirePermission("admin:write", "Apenas administradores podem restaurar backups.")) return;
  if (!backup?.state) {
    setText("backup-message", "Backup invalido ou sem dados para restaurar.");
    return;
  }
  const restoredState = sanitizeRemoteState(backup.state);
  const counts = getBusinessCounts(restoredState);
  const summary = `${counts.properties} imoveis, ${counts.clients} clientes, ${counts.contracts} contratos, ${counts.payments} receitas e ${counts.expenses} despesas`;
  if (!confirm(`Deseja restaurar este ${sourceLabel}?\n\nEle contem ${summary}.\n\nO estado atual sera salvo em backup antes da restauracao.`)) return;
  createLocalBackup("before_restore", state, { force: true });
  state = restoredState;
  addAuditLog("backup_restored", "system", backup.id || "", null, { message: `Restaurado ${sourceLabel}: ${summary}` }, false);
  saveState();
  renderAll();
  setText("backup-message", `Backup restaurado com sucesso. ${summary}.`);
}

function restoreSelectedBackup() {
  const backup = getSelectedBackup();
  if (!backup) {
    setText("backup-message", "Nenhum backup disponivel para restaurar.");
    return;
  }
  restoreBackupEnvelope(backup, "backup local");
}

async function importBackupFile(event) {
  if (!requirePermission("admin:write", "Apenas administradores podem importar backups.")) return;
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const envelope = payload.state ? payload : createBackupEnvelope("imported", payload);
    envelope.id = envelope.id || uid("backup");
    envelope.createdAt = envelope.createdAt || new Date().toISOString();
    envelope.reason = envelope.reason || "imported";
    envelope.reasonLabel = getBackupReasonLabel(envelope.reason);
    envelope.fileName = envelope.fileName || file.name || createBackupFileName(envelope.createdAt);
    envelope.storageAddress = envelope.storageAddress || `arquivo:${envelope.fileName}`;
    envelope.counts = getBusinessCounts(sanitizeRemoteState(envelope.state));
    restoreBackupEnvelope(envelope, `arquivo ${envelope.fileName}`);
  } catch (error) {
    setText("backup-message", `Nao foi possivel importar o backup: ${error.message}`);
  }
}

function ensureSyncConfigured() {
  if (!syncConfig.endpoint) {
    setText("settings-message", "Informe e salve um endpoint HTTPS antes de sincronizar.");
    return false;
  }
  if (!syncConfig.endpoint.startsWith("https://")) {
    setText("settings-message", "Use um endpoint HTTPS para proteger os dados.");
    return false;
  }
  return true;
}

function getSyncHeaders() {
  return syncConfig.token ? { Authorization: `Bearer ${syncConfig.token}` } : {};
}

function sanitizeRemoteState(remoteState) {
  return {
    properties: Array.isArray(remoteState.properties) ? remoteState.properties : [],
    clients: Array.isArray(remoteState.clients) ? remoteState.clients : [],
    contracts: Array.isArray(remoteState.contracts) ? remoteState.contracts.map(normalizeContract) : [],
    expenses: Array.isArray(remoteState.expenses) ? remoteState.expenses.map(normalizeStoredExpense) : [],
    payments: Array.isArray(remoteState.payments) ? remoteState.payments.map(normalizeStoredPayment) : [],
    auditLogs: Array.isArray(remoteState.auditLogs) ? remoteState.auditLogs : [],
  };
}

function normalizeStoredExpense(record) {
  return {
    ...record,
    contractId: record.contractId || "",
    contractCode: record.contractCode || "",
    lessorName: record.lessorName || "",
    amount: Number(record.amount || 0),
    note: String(record.note || "").trim(),
  };
}

function normalizeStoredPayment(record) {
  const amount = Number(record.amount || 0);
  const chargeAmount = Number(record.chargeAmount || 0);
  return {
    ...record,
    amount,
    chargeAmount,
    totalAmount: Number(record.totalAmount || amount + chargeAmount),
    history: String(record.history || "").trim(),
  };
}

function getPropertyDependencies(propertyId) {
  return {
    contracts: state.contracts.filter((item) => item.propertyId === propertyId).length,
    expenses: state.expenses.filter((item) => item.propertyId === propertyId).length,
    payments: state.payments.filter((item) => item.propertyId === propertyId).length,
  };
}

function canDeleteRecordSafely(collection, id) {
  if (collection !== "properties") return true;
  const dependencies = getPropertyDependencies(id);
  const total = dependencies.contracts + dependencies.expenses + dependencies.payments;
  if (!total) return true;
  alert(
    "Este imovel nao pode ser excluido porque possui registros vinculados:\n" +
    `${dependencies.contracts} contrato(s), ${dependencies.payments} receita(s) e ${dependencies.expenses} despesa(s).\n` +
    "Edite ou remova os vinculos antes de excluir o imovel."
  );
  return false;
}

function updateSyncStatus() {
  const status = document.getElementById("sync-status");
  if (!status) return;
  if (window.SupabaseSync) {
    status.textContent = "Supabase conectado";
    return;
  }
  status.textContent = syncConfig.endpoint ? "Nuvem configurada" : "Offline local";
}


function getCurrentUser() {
  try {
    return JSON.parse(appSessionStorage.getItem(sessionUserKey));
  } catch {
    return null;
  }
}

function hasPermission(permission) {
  const user = getCurrentUser();
  const permissions = rolePermissions[user?.role || "consulta"] || rolePermissions.consulta;
  return permissions.includes("*") || permissions.includes(permission);
}

function requirePermission(permission, message) {
  if (hasPermission(permission)) return true;
  if (message) alert(message);
  return false;
}

function canAccessView(view) {
  if (view === "settings") return hasPermission("admin:write");
  return hasPermission("view");
}

function canWriteCollection(collection) {
  return hasPermission(collectionPermissions[collection] || "admin:write");
}

function canDeleteRecords() {
  return hasPermission("admin:write");
}

function isFinancialCollection(collection) {
  return ["contracts", "expenses", "payments"].includes(collection);
}

function applyPermissionUi() {
  const user = getCurrentUser();
  const badge = document.getElementById("current-user-badge");
  if (badge) badge.textContent = user ? `${user.username} - ${roleLabels[user.role] || user.role}` : "Sessao bloqueada";

  document.querySelectorAll("[data-view='settings']").forEach((item) => {
    item.hidden = !hasPermission("admin:write");
  });
  document.getElementById("clear-data")?.toggleAttribute("hidden", !hasPermission("admin:write"));

  setFormWriteState("property-form", canWriteCollection("properties"));
  setFormWriteState("client-form", canWriteCollection("clients"));
  setFormWriteState("contract-form", canWriteCollection("contracts"));
  setFormWriteState("expense-form", canWriteCollection("expenses"));
  setFormWriteState("payment-form", canWriteCollection("payments"));
}

function setFormWriteState(formId, enabled) {
  const form = document.getElementById(formId);
  if (!form) return;
  [...form.elements].forEach((element) => {
    if (element.type === "hidden") return;
    element.disabled = !enabled;
  });
}

function renderAll() {
  populateSelects();
  renderDashboard();
  renderProperties();
  renderClients();
  renderContracts();
  renderExpenses();
  renderPayments();
  renderFinancialErp();
  renderReports();
  renderAccessUsers();
  renderAuditLogs();
  renderBackupPanel();
  applyPermissionUi();
  scheduleContractExpirationReminder();
}

function scheduleContractExpirationReminder() {
  if (document.body.classList.contains("locked")) return;
  if (appSessionStorage.getItem(reminderSessionKey) === "shown") return;
  const expiringContracts = getExpiringContracts(30);
  if (!expiringContracts.length) return;
  appSessionStorage.setItem(reminderSessionKey, "shown");
  setTimeout(() => showContractExpirationReminder(expiringContracts), 250);
}

function getExpiringContracts(daysAhead) {
  return state.contracts
    .map((contract) => ({
      contract,
      property: findProperty(contract.propertyId),
      client: findClient(contract.clientId),
      days: daysUntil(contract.endDate),
    }))
    .filter((item) => item.days >= 0 && item.days <= daysAhead)
    .sort((a, b) => a.days - b.days);
}

function showContractExpirationReminder(expiringContracts) {
  const visibleRows = expiringContracts.slice(0, 8).map((item) => {
    const property = item.property?.description || "Imovel nao localizado";
    const client = item.client?.name || "Cliente nao localizado";
    return `- ${property} | ${client} | vence em ${item.days} dia(s), em ${formatDate(item.contract.endDate)}`;
  });
  const extraCount = expiringContracts.length - visibleRows.length;
  const extraText = extraCount > 0 ? `\n\nE mais ${extraCount} contrato(s). Consulte o painel para ver todos.` : "";
  alert(`Lembrete: ${expiringContracts.length} contrato(s) vencem nos proximos 30 dias.\n\n${visibleRows.join("\n")}${extraText}`);
}

function populateSelects() {
  populateSelect(document.querySelector("#contract-form [name='propertyId']"), state.properties, "Selecione o imovel", "description");
  populateSelect(document.querySelector("#expense-form [name='propertyId']"), state.properties, "Selecione o imovel", "description");
  populateSelect(document.querySelector("#payment-form [name='propertyId']"), getPropertiesWithAnyContracts(), "Selecione o imovel com contrato", "description");
  populateSelect(document.querySelector("#contract-form [name='clientId']"), state.clients, "Selecione o cliente", "name");
  populateSelect(document.getElementById("report-property"), state.properties, "Todos os imoveis", "description", true);
  populateSelect(document.getElementById("report-client"), state.clients, "Todos os clientes", "name", true);
  updatePaymentContractInfo();
  updateExpenseContractInfo();
}

function populateSelect(select, rows, placeholder, labelKey, includeAll = false) {
  const current = select.value;
  select.innerHTML = "";
  select.append(new Option(placeholder, includeAll ? "all" : ""));
  rows.forEach((row) => select.append(new Option(row[labelKey], row.id)));
  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
}

function getPropertiesWithLinkedContracts() {
  const linkedPropertyIds = new Set(
    state.contracts
      .filter((contract) => getContractStatus(contract).key !== "expired")
      .map((contract) => contract.propertyId),
  );
  return state.properties.filter((property) => linkedPropertyIds.has(property.id));
}

function getPropertiesWithAnyContracts() {
  const linkedPropertyIds = new Set(state.contracts.map((contract) => contract.propertyId));
  return state.properties.filter((property) => linkedPropertyIds.has(property.id));
}

function renderDashboard() {
  const activeContracts = state.contracts.filter((contract) => getContractStatus(contract).key !== "expired");
  const monthlyRevenue = activeContracts.reduce((sum, contract) => sum + contract.monthlyValue, 0);
  const expensesTotal = state.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const receivedRevenue = state.payments.reduce((sum, payment) => sum + Number(payment.totalAmount || 0), 0);

  setText("metric-properties", state.properties.length);
  setText("metric-active-contracts", activeContracts.length);
  setText("metric-revenue", formatMoney(receivedRevenue || monthlyRevenue));
  setText("metric-expenses", formatMoney(expensesTotal));

  const upcoming = getExpiringContracts(90);

  setText("upcoming-count", `${upcoming.length} itens`);
  renderList(
    "upcoming-list",
    upcoming,
    (item) => `
      <strong>${escapeHtml(item.property?.description || "Imovel nao localizado")}</strong>
      <span>${escapeHtml(item.client?.name || "Cliente nao localizado")} - termina em ${item.days} dias</span>
      <span>Vigencia ate ${formatDate(item.contract.endDate)} | Reajuste: ${escapeHtml(item.contract.adjustmentFrequency)} por ${escapeHtml(item.contract.adjustmentMethod)}</span>
    `,
  );

  renderPropertyResult();
}

function renderPropertyResult() {
  updateFinancialPeriodCaption();
  const rows = state.properties.map(getPropertyFinancials);

  renderTable(
    "property-result-body",
    rows,
    (row) => `
      <td>
        <strong>${escapeHtml(row.property.description)}</strong>
        <span class="mini-line">${row.area ? `${formatArea(row.area)} m2` : "Area nao informada"}</span>
      </td>
      <td>${renderPeriodValues(row.revenue)}</td>
      <td>${renderPeriodValues(row.expenses)}</td>
      <td>${renderPeriodValues(row.net, true)}</td>
      <td>${renderPeriodValues(row.netPerSquareMeter, true)}</td>
    `,
  );
}

function getPropertyFinancials(property) {
  const referenceDate = getFinancialReferenceDate();
  const currentMonthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const currentMonthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  const yearStart = new Date(referenceDate.getFullYear(), 0, 1);
  const area = parseAreaValue(property.area);
  const propertyPayments = state.payments.filter((payment) => payment.propertyId === property.id);
  const revenue = getPaymentPeriodTotals(propertyPayments, currentMonthStart, currentMonthEnd, yearStart, referenceDate);

  const propertyExpenses = state.expenses.filter((expense) => expense.propertyId === property.id);
  const expenses = {
    current: sumExpensesInPeriod(propertyExpenses, currentMonthStart, currentMonthEnd),
    annual: sumExpensesInPeriod(propertyExpenses, yearStart, referenceDate),
    accumulated: propertyExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
  };
  const net = subtractPeriodTotals(revenue, expenses);
  const netPerSquareMeter = area ? dividePeriodTotals(net, area) : createPeriodTotals();

  return { property, area, revenue, expenses, net, netPerSquareMeter };
}

function getFinancialReferenceDate() {
  const dates = [
    ...state.expenses.map((expense) => parseDate(expense.expenseDate)),
    ...state.payments.map((payment) => parseDate(payment.paymentDate)),
    ...state.contracts.flatMap((contract) => [contract.updatedAt ? new Date(contract.updatedAt) : null, parseDate(contract.startDate)]),
  ].filter(Boolean);
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : new Date();
}

function getPaymentPeriodTotals(payments, currentMonthStart, currentMonthEnd, yearStart, referenceDate) {
  return {
    current: sumPaymentsInPeriod(payments, currentMonthStart, currentMonthEnd),
    annual: sumPaymentsInPeriod(payments, yearStart, referenceDate),
    accumulated: payments.reduce((sum, payment) => sum + Number(payment.totalAmount || 0), 0),
  };
}

function getFinancialPeriodLabels() {
  const referenceDate = getFinancialReferenceDate();
  return {
    current: new Intl.DateTimeFormat("pt-BR", { month: "2-digit", year: "numeric" }).format(referenceDate),
    annual: String(referenceDate.getFullYear()),
    accumulated: "Acumulado",
  };
}

function updateFinancialPeriodCaption() {
  const caption = document.getElementById("financial-period-caption");
  if (!caption) return;
  const labels = getFinancialPeriodLabels();
  caption.textContent = `Competencia ${labels.current}, ano ${labels.annual} e acumulado`;
}

function createPeriodTotals() {
  return { current: 0, annual: 0, accumulated: 0 };
}

function subtractPeriodTotals(left, right) {
  return {
    current: left.current - right.current,
    annual: left.annual - right.annual,
    accumulated: left.accumulated - right.accumulated,
  };
}

function dividePeriodTotals(totals, divisor) {
  return {
    current: totals.current / divisor,
    annual: totals.annual / divisor,
    accumulated: totals.accumulated / divisor,
  };
}

function renderPeriodValues(totals, highlightBalance = false) {
  const labels = getFinancialPeriodLabels();
  return `
    <div class="period-values">
      ${renderPeriodValue(labels.current, totals.current, highlightBalance)}
      ${renderPeriodValue(labels.annual, totals.annual, highlightBalance)}
      ${renderPeriodValue(labels.accumulated, totals.accumulated, highlightBalance)}
    </div>
  `;
}

function renderPeriodValue(label, value, highlightBalance) {
  const tone = highlightBalance && value < 0 ? "negative" : highlightBalance && value > 0 ? "positive" : "";
  return `
    <span class="period-value ${tone}">
      <small>${label}</small>
      <strong>${formatMoney(value)}</strong>
    </span>
  `;
}

function sumExpensesInPeriod(expenses, startDate, endDate) {
  return expenses
    .filter((expense) => isDateInPeriod(parseDate(expense.expenseDate), startDate, endDate))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

function sumPaymentsInPeriod(payments, startDate, endDate) {
  return payments
    .filter((payment) => isDateInPeriod(parseDate(payment.paymentDate), startDate, endDate))
    .reduce((sum, payment) => sum + Number(payment.totalAmount || 0), 0);
}

function countContractMonthsInPeriod(contract, periodStart, periodEnd) {
  const contractStart = parseDate(contract.startDate);
  const contractEnd = parseDate(contract.endDate);
  if (!contractStart || !contractEnd || !periodStart || !periodEnd) return 0;

  const start = maxDate(firstDayOfMonth(contractStart), firstDayOfMonth(periodStart));
  const end = minDate(firstDayOfMonth(contractEnd), firstDayOfMonth(periodEnd));
  if (start > end) return 0;
  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
}

function contractOverlapsPeriod(contract, periodStart, periodEnd) {
  const contractStart = parseDate(contract.startDate);
  const contractEnd = parseDate(contract.endDate);
  return Boolean(contractStart && contractEnd && contractStart <= periodEnd && contractEnd >= periodStart);
}

function isDateInPeriod(date, startDate, endDate) {
  return Boolean(date && startDate && endDate && date >= startDate && date <= endDate);
}

function parseDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function firstDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function maxDate(left, right) {
  return left > right ? left : right;
}

function minDate(left, right) {
  return left < right ? left : right;
}

function parseAreaValue(area) {
  const match = String(area || "").match(/\d+(?:[.,]\d+)*/);
  if (!match) return 0;
  const value = match[0];
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value.replace(/\.(?=\d{3}(?:\D|$))/g, "");
  return Number(normalized) || 0;
}

function formatArea(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function renderProperties() {
  renderTable(
    "properties-body",
    state.properties,
    (property) => `
      <td>${escapeHtml(property.description)}</td>
      <td>${escapeHtml(property.type)}</td>
      <td>${escapeHtml(property.area)}</td>
      <td>${escapeHtml(property.location)}</td>
      <td>${property.investmentValue ? formatMoney(property.investmentValue) : "-"}</td>
      <td>${renderDocumentLink(property.documentLink)}</td>
      <td>${actions("properties", property.id, "property-form")}</td>
    `,
  );
}

function renderDocumentLink(link) {
  if (!link) return "-";
  return `<a href="${escapeHtml(link)}" target="_blank" rel="noopener">Abrir documento</a>`;
}

function renderClients() {
  renderTable(
    "clients-body",
    state.clients,
    (client) => `
      <td>${escapeHtml(client.document)}</td>
      <td>${escapeHtml(client.name)}</td>
      <td>${escapeHtml(client.contact)}</td>
      <td>${escapeHtml(client.phone)}</td>
      <td>${escapeHtml(client.email || "-")}</td>
      <td>${actions("clients", client.id, "client-form")}</td>
    `,
  );
}

function renderContracts() {
  renderTable(
    "contracts-body",
    state.contracts,
    (contract) => {
      const property = findProperty(contract.propertyId);
      const client = findClient(contract.clientId);
      return `
        <td>${escapeHtml(property?.description || "-")}</td>
        <td>${escapeHtml(client?.name || "-")}</td>
        <td>${formatDate(contract.startDate)} a ${formatDate(contract.endDate)}</td>
        <td>${formatMoney(contract.monthlyValue)}</td>
        <td>${escapeHtml(contract.adjustmentFrequency)} - ${escapeHtml(contract.adjustmentMethod)}</td>
        <td>${renderChargeSummary(contract)}</td>
        <td>
          <div class="actions-cell">
            <button class="small-button" data-whatsapp="${contract.id}" type="button">WhatsApp</button>
            <button class="small-button" data-whatsapp-attachment="${contract.id}" type="button">WhatsApp + anexo</button>
            <button class="small-button" data-email="${contract.id}" type="button">E-mail</button>
          </div>
        </td>
        <td>${actions("contracts", contract.id, "contract-form")}</td>
      `;
    },
  );

  document.querySelectorAll("[data-whatsapp]").forEach((button) => {
    button.addEventListener("click", () => openWhatsApp(button.dataset.whatsapp));
  });
  document.querySelectorAll("[data-email]").forEach((button) => {
    button.addEventListener("click", () => openEmail(button.dataset.email));
  });
  document.querySelectorAll("[data-whatsapp-attachment]").forEach((button) => {
    button.addEventListener("click", () => shareChargesAttachment(button.dataset.whatsappAttachment));
  });
}

function renderExpenses() {
  renderTable(
    "expenses-body",
    state.expenses,
    (expense) => {
      const contract = findFinancialContract(expense.propertyId, expense.expenseDate, expense.contractId);
      return `
        <td>${escapeHtml(findProperty(expense.propertyId)?.description || "-")}</td>
        <td>${escapeHtml(expense.contractCode || (contract ? getContractCode(contract) : "-"))}</td>
        <td>${escapeHtml(expense.expenseType)}</td>
        <td>${formatDate(expense.expenseDate)}</td>
        <td>${formatMoney(expense.amount)}</td>
        <td>${escapeHtml(expense.note || "-")}</td>
        <td>${actions("expenses", expense.id, "expense-form")}</td>
      `;
    },
  );
}

function renderPayments() {
  renderTable(
    "payments-body",
    state.payments,
    (payment) => {
      const contract = findFinancialContract(payment.propertyId, payment.paymentDate, payment.contractId);
      const client = findClient(contract?.clientId);
      return `
        <td>${escapeHtml(findProperty(payment.propertyId)?.description || "-")}</td>
        <td>${escapeHtml(payment.contractCode || (contract ? getContractCode(contract) : "-"))}</td>
        <td>${escapeHtml(payment.lessorName || client?.name || "-")}</td>
        <td>${formatDate(payment.paymentDate)}</td>
        <td>${formatMoney(payment.amount)}</td>
        <td>${formatMoney(payment.chargeAmount)}</td>
        <td>${formatMoney(payment.totalAmount)}</td>
        <td>${escapeHtml(payment.history || "-")}</td>
        <td>${actions("payments", payment.id, "payment-form")}</td>
      `;
    },
  );
}

function renderFinancialErp() {
  const period = getErpPeriod();
  const receivables = buildAutomaticReceivables(period);
  const payments = state.payments.filter((payment) => isDateInPeriod(parseDate(payment.paymentDate), period.startDate, period.endDate));
  const expenses = state.expenses.filter((expense) => isDateInPeriod(parseDate(expense.expenseDate), period.startDate, period.endDate));
  const receivedRevenue = payments.reduce((sum, payment) => sum + Number(payment.totalAmount || 0), 0);
  const expectedRevenue = receivables.reduce((sum, item) => sum + item.expected, 0);
  const expensesTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const overdueTotal = receivables.filter((item) => item.statusKey === "overdue").reduce((sum, item) => sum + item.balance, 0);
  const operatingResult = receivedRevenue - expensesTotal;
  const operatingMargin = receivedRevenue ? (operatingResult / receivedRevenue) * 100 : 0;
  const totalInvestment = state.properties.reduce((sum, property) => sum + Number(property.investmentValue || 0), 0);
  const annualizedRoi = totalInvestment ? (operatingResult / totalInvestment) * (12 / period.months.length) * 100 : 0;

  setText("erp-expected-revenue", formatMoney(expectedRevenue));
  setText("erp-received-revenue", formatMoney(receivedRevenue));
  setText("erp-overdue-total", formatMoney(overdueTotal));
  setText("erp-cash-balance", formatMoney(operatingResult));
  setText("erp-operating-margin", `${formatNumber(operatingMargin)}%`);
  setText("erp-roi", `${formatNumber(annualizedRoi)}%`);
  setText("erp-expenses-total", formatMoney(expensesTotal));
  setText("erp-operating-result", formatMoney(operatingResult));
  setText("erp-dre-period", `${formatMonth(period.startDate)} a ${formatMonth(period.endDate)}`);

  renderDreList(receivedRevenue, expensesTotal, overdueTotal, expectedRevenue);
  renderErpReceivables(receivables);
  renderErpCashflow(period, payments, expenses);
  renderErpExpenseCategories(expenses);
  renderErpPropertyProfitability(period, payments, expenses);
}

function setupErpPeriodFilters() {
  const yearInput = document.getElementById("erp-year");
  const startMonthInput = document.getElementById("erp-start-month");
  const endMonthInput = document.getElementById("erp-end-month");
  if (!yearInput || !startMonthInput || !endMonthInput) return;

  const reference = getFinancialReferenceDate();
  const years = getAvailableFinancialYears(reference);
  yearInput.innerHTML = years
    .map((year) => `<option value="${year}">${year}</option>`)
    .join("");
  yearInput.value = String(reference.getFullYear());

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const label = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2026, index, 1));
    return { value: String(month).padStart(2, "0"), label: capitalize(label) };
  });
  const monthOptions = months
    .map((month) => `<option value="${month.value}">${month.value} - ${month.label}</option>`)
    .join("");
  startMonthInput.innerHTML = monthOptions;
  endMonthInput.innerHTML = monthOptions;
  startMonthInput.value = "01";
  endMonthInput.value = String(reference.getMonth() + 1).padStart(2, "0");
}

function getAvailableFinancialYears(reference = new Date()) {
  const years = new Set([reference.getFullYear()]);
  const collectYear = (dateString) => {
    const date = parseDate(dateString);
    if (date) years.add(date.getFullYear());
  };
  state.contracts.forEach((contract) => {
    collectYear(contract.startDate);
    collectYear(contract.endDate);
  });
  state.payments.forEach((payment) => collectYear(payment.paymentDate));
  state.expenses.forEach((expense) => collectYear(expense.expenseDate));

  const sortedYears = [...years].filter(Boolean).sort((a, b) => b - a);
  const minYear = sortedYears[sortedYears.length - 1] || reference.getFullYear();
  const maxYear = sortedYears[0] || reference.getFullYear();
  years.add(minYear - 1);
  years.add(maxYear + 1);
  return [...years].filter(Boolean).sort((a, b) => b - a);
}

function getErpPeriod() {
  const yearInput = document.getElementById("erp-year");
  const startMonthInput = document.getElementById("erp-start-month");
  const endMonthInput = document.getElementById("erp-end-month");
  const reference = getFinancialReferenceDate();
  const defaultYear = String(reference.getFullYear());
  const defaultStartMonth = "01";
  const defaultEndMonth = String(reference.getMonth() + 1).padStart(2, "0");

  if (!yearInput.value) yearInput.value = defaultYear;
  if (!startMonthInput.value) startMonthInput.value = defaultStartMonth;
  if (!endMonthInput.value) endMonthInput.value = defaultEndMonth;
  if (startMonthInput.value > endMonthInput.value) endMonthInput.value = startMonthInput.value;

  const year = Number(yearInput.value) || reference.getFullYear();
  const startDate = parseMonthValue(`${year}-${startMonthInput.value}`);
  const endMonth = parseMonthValue(`${year}-${endMonthInput.value}`);
  const endDate = new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0);
  return { startDate, endDate, months: listMonths(startDate, endDate) };
}

function buildAutomaticReceivables(period) {
  const receivables = [];
  const activeContracts = state.contracts.filter((contract) => contractOverlapsPeriod(contract, period.startDate, period.endDate));

  activeContracts.forEach((contract) => {
    const contractStart = parseDate(contract.startDate);
    const contractEnd = parseDate(contract.endDate);
    const dueDay = contractStart?.getDate() || 10;
    period.months.forEach((monthDate) => {
      const monthStart = firstDayOfMonth(monthDate);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      if (!contractStart || !contractEnd || contractStart > monthEnd || contractEnd < monthStart) return;

      const dueDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), Math.min(dueDay, monthEnd.getDate()));
      receivables.push({
        contract,
        property: findProperty(contract.propertyId),
        client: findClient(contract.clientId),
        dueDate,
        month: toMonthValue(monthDate),
        expected: Number(contract.monthlyValue || 0),
        received: 0,
      });
    });
  });

  const paymentsByPropertyMonth = state.payments.reduce((groups, payment) => {
    const paymentDate = parseDate(payment.paymentDate);
    if (!paymentDate || !isDateInPeriod(paymentDate, period.startDate, period.endDate)) return groups;
    const key = payment.contractId
      ? `contract:${payment.contractId}:${toMonthValue(paymentDate)}`
      : `property:${payment.propertyId}:${toMonthValue(paymentDate)}`;
    groups[key] = (groups[key] || 0) + Number(payment.totalAmount || 0);
    return groups;
  }, {});

  receivables
    .sort((a, b) => a.dueDate - b.dueDate)
    .forEach((item) => {
      const contractKey = `contract:${item.contract.id}:${item.month}`;
      const propertyKey = `property:${item.contract.propertyId}:${item.month}`;
      const available = (paymentsByPropertyMonth[contractKey] || 0) + (paymentsByPropertyMonth[propertyKey] || 0);
      item.received = Math.min(item.expected, available);
      const fromContract = Math.min(paymentsByPropertyMonth[contractKey] || 0, item.received);
      paymentsByPropertyMonth[contractKey] = Math.max((paymentsByPropertyMonth[contractKey] || 0) - fromContract, 0);
      paymentsByPropertyMonth[propertyKey] = Math.max((paymentsByPropertyMonth[propertyKey] || 0) - (item.received - fromContract), 0);
      item.balance = Math.max(item.expected - item.received, 0);
      item.statusKey = getReceivableStatus(item);
      item.status = getReceivableStatusLabel(item.statusKey);
    });

  return receivables;
}

function getReceivableStatus(item) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (item.balance <= 0) return "paid";
  if (item.received > 0) return "partial";
  if (item.dueDate < today) return "overdue";
  return "open";
}

function getReceivableStatusLabel(status) {
  return {
    paid: "Recebido",
    partial: "Parcial",
    overdue: "Vencido",
    open: "Em aberto",
  }[status];
}

function renderDreList(revenue, expenses, overdue, expectedRevenue) {
  const rows = [
    ["Receita operacional recebida", revenue],
    ["(-) Despesas operacionais", -expenses],
    ["Resultado operacional", revenue - expenses],
    ["Contas a receber previstas", expectedRevenue],
    ["Inadimplencia vencida", -overdue],
  ];
  document.getElementById("erp-dre-list").innerHTML = rows
    .map(([label, value]) => `
      <div class="dre-row ${value < 0 ? "negative" : ""}">
        <span>${escapeHtml(label)}</span>
        <strong>${formatMoney(value)}</strong>
      </div>
    `)
    .join("");
}

function renderErpReceivables(receivables) {
  renderTable(
    "erp-receivables-body",
    receivables,
    (item) => `
      <td>${formatDate(toDateInputValue(item.dueDate))}</td>
      <td>${escapeHtml(item.property?.description || "-")}</td>
      <td>${escapeHtml(item.client?.name || "-")}</td>
      <td>${formatMoney(item.expected)}</td>
      <td>${formatMoney(item.received)}</td>
      <td>${formatMoney(item.balance)}</td>
      <td><span class="status ${item.statusKey}">${item.status}</span></td>
    `,
  );
}

function renderErpCashflow(period, payments, expenses) {
  const rows = period.months.map((monthDate) => {
    const month = toMonthValue(monthDate);
    const inflow = payments
      .filter((payment) => toMonthValue(parseDate(payment.paymentDate)) === month)
      .reduce((sum, payment) => sum + Number(payment.totalAmount || 0), 0);
    const outflow = expenses
      .filter((expense) => toMonthValue(parseDate(expense.expenseDate)) === month)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    return { monthDate, inflow, outflow, balance: inflow - outflow };
  });

  renderTable(
    "erp-cashflow-body",
    rows,
    (row) => `
      <td>${formatMonth(row.monthDate)}</td>
      <td>${formatMoney(row.inflow)}</td>
      <td>${formatMoney(row.outflow)}</td>
      <td><strong class="${row.balance < 0 ? "negative-text" : "positive-text"}">${formatMoney(row.balance)}</strong></td>
    `,
  );
}

function renderErpExpenseCategories(expenses) {
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const rows = Object.entries(
    expenses.reduce((groups, expense) => {
      const category = expense.expenseType || "Outros";
      groups[category] = (groups[category] || 0) + Number(expense.amount || 0);
      return groups;
    }, {}),
  )
    .map(([category, amount]) => ({ category, amount, share: total ? (amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);

  renderTable(
    "erp-expense-category-body",
    rows,
    (row) => `
      <td>${escapeHtml(row.category)}</td>
      <td>${formatMoney(row.amount)}</td>
      <td>${formatNumber(row.share)}%</td>
    `,
  );
}

function renderErpPropertyProfitability(period, payments, expenses) {
  const rows = state.properties
    .map((property) => {
      const revenue = payments
        .filter((payment) => payment.propertyId === property.id)
        .reduce((sum, payment) => sum + Number(payment.totalAmount || 0), 0);
      const expenseTotal = expenses
        .filter((expense) => expense.propertyId === property.id)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      const result = revenue - expenseTotal;
      const margin = revenue ? (result / revenue) * 100 : 0;
      const investment = Number(property.investmentValue || 0);
      const roi = investment ? (result / investment) * (12 / period.months.length) * 100 : 0;
      return { property, revenue, expenses: expenseTotal, result, margin, roi };
    })
    .filter((row) => row.revenue || row.expenses || Number(row.property.investmentValue || 0))
    .sort((a, b) => b.result - a.result);

  renderTable(
    "erp-property-profitability-body",
    rows,
    (row) => `
      <td>${escapeHtml(row.property.description)}</td>
      <td>${formatMoney(row.revenue)}</td>
      <td>${formatMoney(row.expenses)}</td>
      <td><strong class="${row.result < 0 ? "negative-text" : "positive-text"}">${formatMoney(row.result)}</strong></td>
      <td>${formatNumber(row.margin)}%</td>
      <td>${row.roi ? `${formatNumber(row.roi)}%` : "-"}</td>
    `,
  );
}

function renderAccessUsers() {
  const body = document.getElementById("access-users-body");
  if (!body) return;
  body.innerHTML = "";
}

function renderAuditLogs() {
  const body = document.getElementById("audit-log-body");
  if (!body) return;
  const summary = document.getElementById("audit-log-summary");
  const startValue = document.getElementById("audit-start")?.value || "";
  const endValue = document.getElementById("audit-end")?.value || "";
  const startDate = startValue ? new Date(`${startValue}T00:00:00`) : null;
  const endDate = endValue ? new Date(`${endValue}T23:59:59.999`) : null;
  const allRows = [...(state.auditLogs || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const hasPeriodFilter = Boolean(startDate || endDate);
  const rows = hasPeriodFilter
    ? allRows
        .filter((log) => {
          const createdAt = new Date(log.createdAt);
          if (Number.isNaN(createdAt.getTime())) return false;
          if (startDate && createdAt < startDate) return false;
          if (endDate && createdAt > endDate) return false;
          return true;
        })
        .slice(0, 120)
    : allRows
        .filter((log) => log.collection === "auth" || log.action === "login_success" || log.action === "logout")
        .slice(0, 5);
  if (summary) {
    summary.textContent = hasPeriodFilter
      ? `${rows.length} evento(s) no periodo selecionado`
      : "Ultimos cinco acessos";
  }
  renderTable(
    "audit-log-body",
    rows,
    (log) => `
      <td>${formatDateTime(log.createdAt)}</td>
      <td>${escapeHtml(log.userName || "Sistema")}</td>
      <td>${escapeHtml(log.action)}</td>
      <td>${escapeHtml(log.collection)}</td>
      <td>${escapeHtml(getAuditType(log))}</td>
      <td>${escapeHtml(log.summary)}</td>
    `,
  );
}

function renderBackupPanel() {
  const status = document.getElementById("backup-status");
  const address = document.getElementById("backup-address");
  const select = document.getElementById("backup-select");
  if (!status || !address || !select) return;

  const backups = loadBackups().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const latest = backups[0] || null;
  if (!latest) {
    status.textContent = "Nenhum backup local gerado.";
    address.textContent = backupFolderReady
      ? `Destino automatico: ${preferredBackupFolderLabel}`
      : `Endereco local: localStorage:${backupKey}. Para outro PC, use Baixar backup e depois Importar arquivo de backup. Em navegadores compativeis, Escolher pasta local tambem grava automaticamente.`;
    select.innerHTML = `<option value="">Nenhum backup disponivel</option>`;
    return;
  }

  const counts = latest.counts || getBusinessCounts(latest.state || {});
  status.textContent = `Ultimo backup: ${formatDateTime(latest.createdAt)} - ${latest.reasonLabel || getBackupReasonLabel(latest.reason)} - ${counts.properties || 0} imoveis, ${counts.clients || 0} clientes, ${counts.contracts || 0} contratos, ${counts.payments || 0} receitas, ${counts.expenses || 0} despesas.`;
  address.textContent = `Endereco local: ${latest.storageAddress || `localStorage:${backupKey}:${latest.id}`} | Arquivo sugerido: ${latest.fileName || createBackupFileName(latest.createdAt)}`;
  select.innerHTML = backups
    .map((backup) => {
      const backupCounts = backup.counts || getBusinessCounts(backup.state || {});
      const label = `${formatDateTime(backup.createdAt)} - ${backup.reasonLabel || getBackupReasonLabel(backup.reason)} - ${backupCounts.properties || 0} imoveis`;
      return `<option value="${escapeHtml(backup.id)}">${escapeHtml(label)}</option>`;
    })
    .join("");
}

function getAuditType(log) {
  if (log.collection === "auth" || log.collection === "users") return "Seguranca";
  if (log.financial) return "Financeiro";
  if (log.collection === "sync" || log.collection === "system") return "Sistema";
  return "Operacional";
}

function renderReports() {
  updateReportModeVisibility();
  const dataset = getReportDataset();
  const propertyId = document.getElementById("report-property").value;
  const clientId = document.getElementById("report-client").value;
  const status = document.getElementById("report-status").value;
  const filters = getReportFilters();
  if (dataset !== "financial") {
    renderRegistrationReport(dataset, propertyId, clientId, status, filters);
    return;
  }
  const payments = getFilteredPayments(filters, propertyId, clientId, status);

  const rows = state.contracts
    .filter((contract) => propertyId === "all" || contract.propertyId === propertyId)
    .filter((contract) => clientId === "all" || contract.clientId === clientId)
    .filter((contract) => status === "all" || getContractStatus(contract).key === status)
    .filter((contract) => contractMatchesReportFilters(contract, filters))
    .map(toReportRow);

  renderReportMetrics(rows, payments);
  renderRevenueReport(payments);
  renderPropertyReports(rows, filters, payments);
  renderExpenseTypeReport(rows, filters);
  renderChargesReport(propertyId, clientId, status, filters);
  renderSummaryReport(rows, filters);

  renderTable(
    "reports-body",
    rows,
    (row) => `
      <td>${escapeHtml(row.property)}</td>
      <td>${escapeHtml(row.client)}</td>
      <td>${escapeHtml(row.contact)}</td>
      <td>${row.period}</td>
      <td>${formatMoney(row.monthlyValue)}</td>
      <td>${formatMoney(row.expenses)}</td>
      <td><span class="status ${row.statusKey}">${row.status}</span></td>
    `,
  );
}

function updateReportModeVisibility() {
  const isRegistrationReport = getReportDataset() !== "financial";
  document.querySelectorAll(".analytic-report").forEach((item) => item.classList.toggle("hidden", isRegistrationReport || reportMode !== "analytic"));
  document.querySelector("#reports > .metrics-grid")?.classList.toggle("hidden", isRegistrationReport);
  document.querySelector(".registration-report")?.classList.toggle("hidden", !isRegistrationReport);
  document.querySelector(".report-mode")?.classList.toggle("hidden", isRegistrationReport);
  const summary = document.getElementById("summary-report");
  if (summary) summary.classList.toggle("active", !isRegistrationReport && reportMode === "summary");
}

function getReportDataset() {
  return document.getElementById("report-dataset")?.value || "financial";
}

function renderRegistrationReport(dataset = getReportDataset(), propertyId = "all", clientId = "all", status = "all", filters = getReportFilters()) {
  const report = getRegistrationReportData(dataset, propertyId, clientId, status, filters);
  setText("registration-report-title", report.title);
  setText("registration-report-count", `${report.rows.length} registro(s)`);
  const head = document.getElementById("registration-report-head");
  if (head) head.innerHTML = report.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  renderTable(
    "registration-report-body",
    report.rows,
    (row) => row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join(""),
  );
}

function getRegistrationReportData(dataset = getReportDataset(), propertyId = "all", clientId = "all", status = "all", filters = getReportFilters()) {
  if (dataset === "properties") return getPropertiesRegistrationReport(propertyId, clientId, status);
  if (dataset === "clients") return getClientsRegistrationReport(propertyId, clientId, status);
  return getContractsRegistrationReport(propertyId, clientId, status, filters);
}

function getPropertiesRegistrationReport(propertyId, clientId, status) {
  const rows = state.properties
    .filter((property) => propertyId === "all" || property.id === propertyId)
    .map((property) => {
      const contracts = state.contracts.filter((contract) => contract.propertyId === property.id && (clientId === "all" || contract.clientId === clientId));
      const activeContracts = contracts.filter((contract) => getContractStatus(contract).key !== "expired");
      const expiredContracts = contracts.filter((contract) => getContractStatus(contract).key === "expired");
      const statusKey = activeContracts.length ? "active" : expiredContracts.length ? "expired" : "none";
      return {
        statusKey,
        row: [
          property.description || "-",
          property.type || "-",
          property.area || "-",
          property.location || "-",
          property.investmentValue ? formatMoney(property.investmentValue) : "-",
          activeContracts.length ? "Ativo" : expiredContracts.length ? "Encerrado" : "Sem contrato",
          String(contracts.length),
        ],
      };
    })
    .filter((item) => status === "all" || item.statusKey === status || (status === "ending" && item.statusKey === "active"))
    .map((item) => item.row);
  return { title: "Relatorio do cadastro de imoveis", headers: ["Imovel", "Tipo", "Area", "Localizacao", "Investimento", "Situacao", "Contratos"], rows };
}

function getClientsRegistrationReport(propertyId, clientId, status) {
  const rows = state.clients
    .filter((client) => clientId === "all" || client.id === clientId)
    .map((client) => {
      const contracts = state.contracts.filter((contract) => contract.clientId === client.id && (propertyId === "all" || contract.propertyId === propertyId));
      const activeContracts = contracts.filter((contract) => getContractStatus(contract).key !== "expired");
      const expiredContracts = contracts.filter((contract) => getContractStatus(contract).key === "expired");
      const statusKey = activeContracts.length ? "active" : expiredContracts.length ? "expired" : "none";
      return {
        statusKey,
        row: [
          client.document || "-",
          client.name || "-",
          client.contact || "-",
          client.phone || "-",
          client.email || "-",
          activeContracts.length ? "Ativo" : expiredContracts.length ? "Encerrado" : "Sem contrato",
          String(contracts.length),
        ],
      };
    })
    .filter((item) => status === "all" || item.statusKey === status || (status === "ending" && item.statusKey === "active"))
    .map((item) => item.row);
  return { title: "Relatorio do cadastro de clientes", headers: ["Documento", "Nome", "Contato", "Telefone", "E-mail", "Situacao", "Contratos"], rows };
}

function getContractsRegistrationReport(propertyId, clientId, status, filters) {
  const rows = state.contracts
    .filter((contract) => propertyId === "all" || contract.propertyId === propertyId)
    .filter((contract) => clientId === "all" || contract.clientId === clientId)
    .filter((contract) => status === "all" || getContractStatus(contract).key === status)
    .filter((contract) => contractMatchesReportFilters(contract, filters))
    .map((contract) => {
      const property = findProperty(contract.propertyId);
      const client = findClient(contract.clientId);
      const contractStatus = getContractStatus(contract);
      return [
        property?.description || "-",
        client?.name || "-",
        formatCpfCnpj(client?.document || ""),
        `${formatDate(contract.startDate)} a ${formatDate(contract.endDate)}`,
        formatMoney(contract.monthlyValue),
        `Dia ${contract.dueDay || 1}`,
        `${contract.adjustmentFrequency || "-"} - ${contract.adjustmentMethod || "-"}`,
        contractStatus.label,
      ];
    });
  return { title: "Relatorio do cadastro de contratos", headers: ["Imovel", "Cliente", "Documento", "Vigencia", "Valor mensal", "Vencimento", "Reajuste", "Situacao"], rows };
}

function getReportFilters() {
  return {
    expenseType: document.getElementById("report-expense-type").value,
    startDate: document.getElementById("report-start").value,
    endDate: document.getElementById("report-end").value,
    minValue: Number(document.getElementById("report-min-value").value || 0),
    maxValue: Number(document.getElementById("report-max-value").value || 0),
  };
}

function contractMatchesReportFilters(contract, filters) {
  const startsBeforeEnd = !filters.endDate || parseDate(contract.startDate) <= parseDate(filters.endDate);
  const endsAfterStart = !filters.startDate || parseDate(contract.endDate) >= parseDate(filters.startDate);
  const aboveMin = !filters.minValue || Number(contract.monthlyValue || 0) >= filters.minValue;
  const belowMax = !filters.maxValue || Number(contract.monthlyValue || 0) <= filters.maxValue;
  return startsBeforeEnd && endsAfterStart && aboveMin && belowMax;
}

function renderReportMetrics(rows, payments = getFilteredPayments()) {
  const revenue = payments.reduce((sum, payment) => sum + Number(payment.totalAmount || 0), 0);
  const chargesReceived = payments.reduce((sum, payment) => sum + Number(payment.chargeAmount || 0), 0);
  const ownerExpenses = rows.reduce((sum, row) => sum + row.ownerExpenses, 0);
  const averageTicket = payments.length ? revenue / payments.length : 0;
  const propertyTotals = payments.reduce((totals, payment) => {
    const property = findProperty(payment.propertyId)?.description || "-";
    totals[property] = (totals[property] || 0) + Number(payment.totalAmount || 0);
    return totals;
  }, {});
  const topProperty = Object.entries(propertyTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
  const netMargin = revenue ? ((revenue - ownerExpenses) / revenue) * 100 : 0;

  setText("report-revenue", formatMoney(revenue));
  setText("report-owner-expenses", formatMoney(ownerExpenses));
  setText("report-net-revenue", formatMoney(revenue - ownerExpenses));
  setText("report-tenant-charges", formatMoney(chargesReceived));
  setText("report-contract-count", rows.length);
  setText("report-average-ticket", formatMoney(averageTicket));
  setText("report-top-property", topProperty);
  setText("report-net-margin", `${formatNumber(netMargin)}%`);
}

function renderSummaryReport(reportRows, filters = getReportFilters()) {
  const summary = getSummaryReportData(reportRows, filters);
  setText("summary-period", getSummaryPeriodLabel(filters));
  setText("summary-properties", summary.propertyCount);
  setText("summary-clients", summary.clientCount);
  setText("summary-active-contracts", summary.activeContracts);
  setText("summary-ending-contracts", summary.endingContracts);
  setText("summary-gross-revenue", formatMoney(summary.revenue));
  setText("summary-entered-expenses", formatMoney(summary.expenses));
  setText("summary-net-result", formatMoney(summary.netResult));
  setText("summary-net-margin", `${formatNumber(summary.netMargin)}%`);

  renderTable(
    "summary-report-body",
    [
      { indicator: "Carteira filtrada", result: `${summary.contractCount} contrato(s)`, note: `${summary.activeContracts} ativo(s), ${summary.endingContracts} a vencer e ${summary.expiredContracts} encerrado(s).` },
      { indicator: "Receita recebida", result: formatMoney(summary.revenue), note: `Ticket medio de ${formatMoney(summary.averageTicket)} por pagamento lancado.` },
      { indicator: "Encargos recebidos", result: formatMoney(summary.chargesReceived), note: `${summary.paymentCount} pagamento(s) lancado(s) no recorte atual.` },
      { indicator: "Despesas apropriadas", result: formatMoney(summary.expenses), note: `${summary.expenseCount} lancamento(s) de despesa no recorte atual.` },
      { indicator: "Resultado liquido", result: formatMoney(summary.netResult), note: `Margem gerencial de ${formatNumber(summary.netMargin)}% sobre a receita filtrada.` },
      { indicator: "Maior receita", result: summary.topProperty, note: summary.topProperty === "-" ? "Sem imovel com receita no filtro." : "Imovel com maior participacao na receita bruta." },
      { indicator: "Encargos do cliente", result: `${summary.tenantCharges} encargo(s)`, note: "Quantidade de impostos e taxas sob responsabilidade do cliente nos contratos filtrados." },
    ],
    (row) => `
      <td>${escapeHtml(row.indicator)}</td>
      <td>${escapeHtml(row.result)}</td>
      <td>${escapeHtml(row.note)}</td>
    `,
  );

  renderTable(
    "summary-property-body",
    summary.propertyRows,
    (row) => `
      <td>${escapeHtml(row.property)}</td>
      <td>${formatMoney(row.revenue)}</td>
      <td>${formatMoney(row.chargesReceived)}</td>
      <td>${formatMoney(row.expenses)}</td>
      <td>${formatMoney(row.netResult)}</td>
      <td>${formatNumber(row.participation)}%</td>
    `,
  );
}

function getSummaryReportData(reportRows, filters = getReportFilters()) {
  const propertyId = document.getElementById("report-property")?.value || "all";
  const clientId = document.getElementById("report-client")?.value || "all";
  const status = document.getElementById("report-status")?.value || "all";
  const payments = getFilteredPayments(filters, propertyId, clientId, status);
  const revenue = payments.reduce((sum, payment) => sum + Number(payment.totalAmount || 0), 0);
  const chargesReceived = payments.reduce((sum, payment) => sum + Number(payment.chargeAmount || 0), 0);
  const clientIds = new Set(reportRows.map((row) => row.clientId));
  const reportPropertyIds = new Set(reportRows.map((row) => row.propertyId));
  const paymentPropertyIds = new Set(payments.map((payment) => payment.propertyId));
  const expenses = getFilteredExpenses(filters).filter((expense) => reportPropertyIds.size || paymentPropertyIds.size ? reportPropertyIds.has(expense.propertyId) || paymentPropertyIds.has(expense.propertyId) : true);
  const propertyIds = new Set([...reportPropertyIds, ...paymentPropertyIds, ...expenses.map((expense) => expense.propertyId)]);
  const expensesTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const activeContracts = reportRows.filter((row) => row.statusKey === "active").length;
  const endingContracts = reportRows.filter((row) => row.statusKey === "ending").length;
  const expiredContracts = reportRows.filter((row) => row.statusKey === "expired").length;
  const tenantCharges = getFilteredChargeRows().filter((row) => row.responsible === "cliente" && reportRows.some((reportRow) => reportRow.contractId === row.contractId)).length;
  const averageTicket = payments.length ? revenue / payments.length : 0;
  const netResult = revenue - expensesTotal;
  const netMargin = revenue ? (netResult / revenue) * 100 : 0;
  const propertyRows = [...propertyIds]
    .map((propertyId) => {
      const property = findProperty(propertyId);
      const propertyPayments = payments.filter((payment) => payment.propertyId === propertyId);
      const propertyRevenue = propertyPayments.reduce((sum, payment) => sum + Number(payment.totalAmount || 0), 0);
      const propertyCharges = propertyPayments.reduce((sum, payment) => sum + Number(payment.chargeAmount || 0), 0);
      const propertyExpenses = expenses.filter((expense) => expense.propertyId === propertyId).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      return {
        property: property?.description || "-",
        revenue: propertyRevenue,
        chargesReceived: propertyCharges,
        expenses: propertyExpenses,
        netResult: propertyRevenue - propertyExpenses,
        participation: revenue ? (propertyRevenue / revenue) * 100 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    revenue,
    chargesReceived,
    paymentCount: payments.length,
    expenses: expensesTotal,
    expenseCount: expenses.length,
    netResult,
    netMargin,
    propertyCount: propertyIds.size,
    clientCount: clientIds.size,
    contractCount: reportRows.length,
    activeContracts,
    endingContracts,
    expiredContracts,
    tenantCharges,
    averageTicket,
    topProperty: propertyRows[0]?.property || "-",
    propertyRows,
  };
}

function getSummaryPeriodLabel(filters = getReportFilters()) {
  if (filters.startDate && filters.endDate) return `${formatDate(filters.startDate)} a ${formatDate(filters.endDate)}`;
  if (filters.startDate) return `A partir de ${formatDate(filters.startDate)}`;
  if (filters.endDate) return `Ate ${formatDate(filters.endDate)}`;
  return "Todos os periodos";
}

function renderRevenueReport(payments = getFilteredPayments()) {
  const rows = payments
    .map((payment) => ({
      ...payment,
      property: findProperty(payment.propertyId)?.description || "-",
    }))
    .sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)));

  renderTable(
    "revenue-report-body",
    rows,
    (row) => `
      <td>${escapeHtml(row.property)}</td>
      <td>${formatDate(row.paymentDate)}</td>
      <td>${formatMoney(row.amount)}</td>
      <td>${formatMoney(row.chargeAmount)}</td>
      <td>${formatMoney(row.totalAmount)}</td>
      <td>${escapeHtml(row.history || "-")}</td>
    `,
  );
}

function renderPropertyReports(reportRows, filters = getReportFilters(), payments = getFilteredPayments(filters)) {
  const rows = state.properties
    .map((property) => {
      const propertyContracts = reportRows.filter((row) => row.propertyId === property.id);
      const revenue = payments.filter((payment) => payment.propertyId === property.id).reduce((sum, payment) => sum + Number(payment.totalAmount || 0), 0);
      const enteredExpenses = getEnteredExpenses(property.id, filters);
      const ownerCharges = propertyContracts.reduce((sum, row) => sum + row.ownerChargeCount, 0);
      const ownerExpenses = enteredExpenses;
      return {
        property: property.description,
        revenue,
        enteredExpenses,
        ownerCharges,
        netRevenue: revenue - ownerExpenses,
      };
    })
    .filter((row) => row.revenue > 0 || row.enteredExpenses > 0 || row.ownerCharges > 0);

  renderTable(
    "property-report-body",
    rows,
    (row) => `
      <td>${escapeHtml(row.property)}</td>
      <td>${formatMoney(row.revenue)}</td>
      <td>${formatMoney(row.enteredExpenses)}</td>
      <td>${row.ownerCharges} taxa(s)</td>
      <td>${formatMoney(row.netRevenue)}</td>
    `,
  );

  renderChart("expense-chart", rows, "enteredExpenses", "expense");
  renderChart("net-chart", rows, "netRevenue", "net");
}

function renderExpenseTypeReport(reportRows, filters = getReportFilters()) {
  const propertyIds = new Set(reportRows.map((row) => row.propertyId));
  const expenses = getFilteredExpenses(filters).filter((expense) => propertyIds.has(expense.propertyId));
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const grouped = expenses.reduce((rows, expense) => {
    const key = expense.expenseType || "Outros";
    rows[key] ||= { expenseType: key, count: 0, total: 0 };
    rows[key].count += 1;
    rows[key].total += Number(expense.amount || 0);
    return rows;
  }, {});

  renderTable(
    "expense-type-report-body",
    Object.values(grouped).sort((a, b) => b.total - a.total),
    (row) => `
      <td>${escapeHtml(row.expenseType)}</td>
      <td>${row.count}</td>
      <td>${formatMoney(row.total)}</td>
      <td>${total ? formatNumber((row.total / total) * 100) : "0"}%</td>
    `,
  );
}

function renderChargesReport(propertyId, clientId, status, filters = getReportFilters()) {
  const rows = getFilteredChargeRows(propertyId, clientId, status).filter((row) => contractMatchesReportFilters(row.contract, filters));

  renderTable(
    "charges-report-body",
    rows,
    (row) => `
      <td>${escapeHtml(row.property)}</td>
      <td>${escapeHtml(row.client)}</td>
      <td>${escapeHtml(row.charge)}</td>
      <td>${escapeHtml(capitalize(row.responsible))}</td>
      <td>${escapeHtml(row.baseDue)}</td>
      <td>${formatDate(row.adjustedDue)}</td>
    `,
  );
}

function renderChart(id, rows, valueKey, tone) {
  const target = document.getElementById(id);
  const visibleRows = rows.filter((row) => row[valueKey] !== 0);
  if (!visibleRows.length) {
    target.innerHTML = document.getElementById("empty-template").innerHTML;
    return;
  }

  const max = Math.max(...visibleRows.map((row) => Math.abs(row[valueKey])));
  target.innerHTML = visibleRows
    .map((row) => {
      const width = Math.max(3, Math.round((Math.abs(row[valueKey]) / max) * 100));
      const barClass = [
        "chart-bar",
        tone === "expense" ? "expense" : "",
        row[valueKey] < 0 ? "negative" : "",
      ].join(" ");
      return `
        <div class="chart-row">
          <div class="chart-label">
            <span>${escapeHtml(row.property)}</span>
            <strong>${formatMoney(row[valueKey])}</strong>
          </div>
          <div class="chart-track">
            <div class="${barClass}" style="width: ${width}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderChargeSummary(contract) {
  return chargeRules
    .map((rule) => {
      const responsible = contract[rule.key] || "cliente";
      return `<span class="mini-line">${escapeHtml(rule.label)}: ${escapeHtml(capitalize(responsible))}</span>`;
    })
    .join("");
}

function addAuditLog(action, collection, recordId, before, after, financial = false) {
  const user = getCurrentUser();
  const beforeSummary = summarizeRecord(before);
  const afterSummary = summarizeRecord(after);
  const summary = beforeSummary && afterSummary
    ? `${beforeSummary} -> ${afterSummary}`
    : afterSummary || beforeSummary || "-";
  state.auditLogs = [
    ...(state.auditLogs || []),
    {
      id: uid("audit"),
      createdAt: new Date().toISOString(),
      userId: user?.id || "system",
      userName: user?.username || "Sistema",
      userRole: user?.role || "system",
      action,
      collection,
      recordId,
      financial,
      summary,
      before: before ? structuredClone(before) : null,
      after: after ? structuredClone(after) : null,
    },
  ].slice(-500);
  saveState();
}

function summarizeRecord(record) {
  if (!record) return "";
  if (record.username) return `${record.username} (${roleLabels[record.role] || record.role || "sem perfil"})`;
  if (record.description) return record.description;
  if (record.name) return record.name;
  if (record.paymentDate) return `${formatDate(record.paymentDate)} ${formatMoney(record.totalAmount || record.amount)}`;
  if (record.expenseDate) return `${formatDate(record.expenseDate)} ${formatMoney(record.amount)} ${record.expenseType || ""}`.trim();
  if (record.monthlyValue) return `${formatMoney(record.monthlyValue)} ${record.startDate || ""}`.trim();
  if (record.message) return record.message;
  if (record.endpoint) return record.endpoint;
  return record.id || JSON.stringify(record).slice(0, 80);
}

function summarizeUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, role: user.role };
}

function renderTable(bodyId, rows, rowTemplate) {
  const body = document.getElementById(bodyId);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8">${document.getElementById("empty-template").innerHTML}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((row) => `<tr>${rowTemplate(row)}</tr>`).join("");
}

function renderList(id, rows, template) {
  const target = document.getElementById(id);
  if (!rows.length) {
    target.innerHTML = document.getElementById("empty-template").innerHTML;
    return;
  }
  target.innerHTML = rows.map((row) => `<article class="list-item">${template(row)}</article>`).join("");
}

function actions(collection, id, formId) {
  const editButton = canWriteCollection(collection) ? `<button class="small-button" data-edit="${collection}:${id}:${formId}" type="button">Editar</button>` : "";
  const deleteButton = canDeleteRecords() ? `<button class="small-button" data-delete="${collection}:${id}" type="button">Excluir</button>` : "";
  if (!editButton && !deleteButton) return "-";
  return `
    <div class="actions-cell">
      ${editButton}
      ${deleteButton}
    </div>
  `;
}

function editRecord(collection, id, formId) {
  if (!canWriteCollection(collection)) {
    alert("Seu perfil nao permite editar este registro.");
    return;
  }
  const record = state[collection].find((item) => item.id === id);
  const form = document.getElementById(formId);
  if (!record) return;

  Object.entries(record).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
  if (formId === "payment-form") {
    updatePaymentTotal(form);
    updatePaymentContractInfo(form);
  }
  if (formId === "expense-form") {
    updateExpenseContractInfo(form);
  }
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindTableActions() {
  document.querySelector(".content").addEventListener("click", (event) => {
    const editUserButton = event.target.closest("[data-edit-user]");
    if (editUserButton) {
      editAccessUser(editUserButton.dataset.editUser);
      return;
    }

    const deleteUserButton = event.target.closest("[data-delete-user]");
    if (deleteUserButton) {
      deleteAccessUser(deleteUserButton.dataset.deleteUser);
      return;
    }

    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      const [collection, id, formId] = editButton.dataset.edit.split(":");
      editRecord(collection, id, formId);
      return;
    }

    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) {
      const [collection, id] = deleteButton.dataset.delete.split(":");
      deleteRecord(collection, id);
    }
  });
}

function deleteRecord(collection, id) {
  if (!requirePermission("admin:write", "Apenas administradores podem excluir registros.")) return;
  if (!canDeleteRecordSafely(collection, id)) return;
  if (!confirm("Deseja excluir este registro?")) return;
  const before = state[collection].find((item) => item.id === id);
  state[collection] = state[collection].filter((item) => item.id !== id);
  addAuditLog("record_deleted", collection, id, before, null, isFinancialCollection(collection));
  saveState();
  renderAll();
}

function editAccessUser(id) {
  purgeLocalAccessUsers();
  setText("settings-message", "Usuarios locais foram desativados. Edite usuarios no painel Auth do Supabase.");
}

function deleteAccessUser(id) {
  purgeLocalAccessUsers();
  setText("settings-message", "Usuarios locais foram removidos. A autenticacao ativa e feita pelo Supabase.");
}

function toReportRow(contract) {
  const property = findProperty(contract.propertyId);
  const client = findClient(contract.clientId);
  const expenses = state.expenses
    .filter((expense) => expenseBelongsToContract(expense, contract))
    .reduce((sum, expense) => sum + expense.amount, 0);
  const ownerChargeCount = chargeRules.filter((rule) => (contract[rule.key] || "cliente") === "locador").length;
  const status = getContractStatus(contract);

  return {
    contractId: contract.id,
    propertyId: contract.propertyId,
    clientId: contract.clientId,
    property: property?.description || "-",
    client: client?.name || "-",
    contact: client ? `${client.contact} | ${client.phone}` : "-",
    period: `${formatDate(contract.startDate)} a ${formatDate(contract.endDate)}`,
    monthlyValue: contract.monthlyValue,
    expenses,
    ownerExpenses: expenses,
    ownerChargeCount,
    status: status.label,
    statusKey: status.key,
  };
}

function expenseBelongsToContract(expense, contract) {
  if (!expense || !contract) return false;
  if (expense.contractId) return expense.contractId === contract.id;
  if (expense.propertyId !== contract.propertyId) return false;
  const expenseDate = parseDate(expense.expenseDate);
  const start = parseDate(contract.startDate);
  const end = parseDate(contract.endDate);
  return Boolean(expenseDate && start && end && expenseDate >= start && expenseDate <= end);
}

function getContractStatus(contract) {
  const days = daysUntil(contract.endDate);
  if (days < 0) return { key: "expired", label: "Encerrado" };
  if (days <= 90) return { key: "ending", label: "A vencer" };
  return { key: "active", label: "Ativo" };
}

function openWhatsApp(contractId) {
  const message = buildContractMessage(contractId);
  if (!message.client?.phone) {
    alert("Cliente sem telefone cadastrado.");
    return;
  }
  const phone = message.client.phone.replace(/\D/g, "");
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message.text)}`, "_blank");
}

function openEmail(contractId) {
  const message = buildContractMessage(contractId);
  if (!message.client?.email) {
    alert("Cliente sem e-mail cadastrado.");
    return;
  }
  const subject = encodeURIComponent("Aviso sobre contrato de locacao");
  const body = encodeURIComponent(message.text);
  window.location.href = `mailto:${message.client.email}?subject=${subject}&body=${body}`;
}

async function shareChargesAttachment(contractId) {
  const message = buildContractMessage(contractId);
  const attachment = buildChargesAttachment(contractId);
  if (!attachment || !message.client?.phone) {
    alert("Contrato sem cliente, telefone ou taxas para gerar anexo.");
    return;
  }

  const file = new File([attachment.csv], attachment.fileName, { type: "text/csv" });
  const sharePayload = {
    title: "Impostos e taxas do contrato",
    text: message.text,
    files: [file],
  };

  if (navigator.canShare && navigator.canShare(sharePayload) && navigator.share) {
    await navigator.share(sharePayload);
    return;
  }

  downloadTextFile(attachment.csv, attachment.fileName, "text/csv;charset=utf-8");
  openWhatsApp(contractId);
  alert("O anexo foi baixado. No WhatsApp, clique no icone de anexar e selecione o arquivo gerado.");
}

function buildChargesAttachment(contractId) {
  const contract = state.contracts.find((item) => item.id === contractId);
  if (!contract) return null;

  const property = findProperty(contract.propertyId);
  const client = findClient(contract.clientId);
  const rows = chargeRules.map((rule) => {
    const dueDate = getChargeDueDate(rule);
    return [
      property?.description || "-",
      client?.name || "-",
      rule.label,
      capitalize(contract[rule.key] || "cliente"),
      rule.baseLabel,
      formatDate(toIsoDate(adjustToPreviousBusinessDay(dueDate))),
    ];
  });

  const csvRows = [
    ["Imovel", "Cliente", "Imposto ou taxa", "Responsavel", "Vencimento base", "Vencimento ajustado"],
    ...rows,
  ];
  const csv = csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
  const safeName = `${property?.description || "imovel"}-${client?.name || "cliente"}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return {
    csv,
    fileName: `impostos-taxas-${safeName || "contrato"}.csv`,
  };
}

function downloadTextFile(content, fileName, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function buildContractMessage(contractId) {
  const contract = state.contracts.find((item) => item.id === contractId);
  const client = findClient(contract?.clientId);
  const property = findProperty(contract?.propertyId);
  const dueDate = nextDueDate(contract?.dueDay);
  const text = `Ola, ${client?.contact || client?.name || ""}. Lembramos que o contrato do imovel ${property?.description || ""} possui aluguel mensal de ${formatMoney(contract?.monthlyValue || 0)} com vencimento em ${formatDate(dueDate)}. Vigencia atual: ${formatDate(contract?.startDate)} a ${formatDate(contract?.endDate)}.`;
  return { client, text };
}

function nextDueDate(day) {
  const today = new Date();
  const due = new Date(today.getFullYear(), today.getMonth(), Math.min(Number(day || 1), 28));
  if (due < today) due.setMonth(due.getMonth() + 1);
  return due.toISOString().slice(0, 10);
}

function exportReportsCsv() {
  if (getReportDataset() !== "financial") {
    const report = getCurrentRegistrationReportData();
    const csv = [report.headers, ...report.rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
    downloadTextFile(csv, `${getRegistrationReportFileBase(report)}.csv`, "text/csv;charset=utf-8");
    return;
  }
  const rows = reportMode === "summary"
    ? [["Indicador", "Resultado", "Leitura gerencial"]]
    : [["Imovel", "Data", "Pagamento", "Encargo", "Total recebido", "Historico"]];
  const selector = reportMode === "summary" ? "#summary-report-body tr" : "#revenue-report-body tr";
  document.querySelectorAll(selector).forEach((tr) => {
    const cells = [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").trim());
    if (cells.length) rows.push(cells);
  });

  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(";")).join("\n");
  downloadTextFile(csv, reportMode === "summary" ? "relatorio-gerencial-locacoes.csv" : "relatorio-locacoes.csv", "text/csv;charset=utf-8");
}

function exportReportsExcel() {
  renderReports();
  if (getReportDataset() !== "financial") {
    const report = getCurrentRegistrationReportData();
    const workbook = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8" /></head>
      <body>
        <h2>${escapeHtml(report.title)}</h2>
        <table>
          <thead><tr>${report.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
          <tbody>${report.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </body>
    </html>
  `;
    downloadTextFile(workbook, `${getRegistrationReportFileBase(report)}.xls`, "application/vnd.ms-excel;charset=utf-8");
    return;
  }
  const analyticTables = [
    { title: "Receitas lancadas", selector: "#revenue-report-body", headers: ["Imovel", "Data", "Pagamento", "Encargo", "Total recebido", "Historico"] },
    { title: "Resultado por imovel", selector: "#property-report-body", headers: ["Imovel", "Receita recebida", "Despesas apropriadas", "Taxas do locador", "Receita liquida"] },
    { title: "Despesas por tipo", selector: "#expense-type-report-body", headers: ["Despesa", "Quantidade", "Total", "Participacao"] },
    { title: "Encargos e vencimentos", selector: "#charges-report-body", headers: ["Imovel", "Cliente", "Encargo", "Responsavel", "Vencimento base", "Vencimento ajustado"] },
    { title: "Contratos filtrados", selector: "#reports-body", headers: ["Imovel", "Cliente", "Contato", "Vigencia", "Valor mensal", "Despesa vinculada", "Status"] },
  ];
  const summaryTables = [
    { title: "Resumo executivo", selector: "#summary-report-body", headers: ["Indicador", "Resultado", "Leitura gerencial"] },
    { title: "Resultado gerencial por imovel", selector: "#summary-property-body", headers: ["Imovel", "Receita", "Encargos", "Despesas", "Resultado", "Participacao na receita"] },
  ];
  const tables = reportMode === "summary" ? summaryTables : analyticTables;
  const sections = tables.map((table) => `
    <h2>${escapeHtml(table.title)}</h2>
    <table>
      <thead><tr>${table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${document.querySelector(table.selector).innerHTML}</tbody>
    </table>
  `);
  const workbook = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8" /></head>
      <body>${sections.join("<br />")}</body>
    </html>
  `;
  downloadTextFile(workbook, reportMode === "summary" ? "relatorio-gerencial-locacoes.xls" : "relatorio-locacoes.xls", "application/vnd.ms-excel;charset=utf-8");
}

function exportReportsPdf() {
  renderReports();
  if (getReportDataset() !== "financial") {
    exportRegistrationReportPdf();
    return;
  }
  const report = document.getElementById("reports").cloneNode(true);
  report.querySelectorAll("button").forEach((button) => button.remove());
  const styles = document.querySelector("link[rel='stylesheet']").href;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Permita pop-ups para gerar o PDF.");
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Relatorio - ${companyName}</title>
        <link rel="stylesheet" href="${styles}" />
        <style>
          body { background: #fff; padding: 24px; }
          .view { display: grid; gap: 18px; }
          .print-header { display: flex; align-items: center; gap: 18px; margin-bottom: 18px; }
          .print-header img { width: 220px; }
          .report-actions, .filters { display: none; }
          .panel, .metric { box-shadow: none; }
        </style>
      </head>
      <body>
        <header class="print-header">
          <img src="logo-imobiliaria-rio.svg" alt="${companyName}" />
          <div>
            <h1>Relatorio ${reportMode === "summary" ? "sintetico gerencial" : "analitico"}</h1>
            <p>Gerado em ${formatDate(toIsoDate(new Date()))}</p>
          </div>
        </header>
        ${report.outerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}

function getCurrentRegistrationReportData() {
  return getRegistrationReportData(
    getReportDataset(),
    document.getElementById("report-property")?.value || "all",
    document.getElementById("report-client")?.value || "all",
    document.getElementById("report-status")?.value || "all",
    getReportFilters(),
  );
}

function getRegistrationReportFileBase(report) {
  return report.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function exportRegistrationReportPdf() {
  const report = getCurrentRegistrationReportData();
  const styles = document.querySelector("link[rel='stylesheet']").href;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Permita pop-ups para gerar o PDF.");
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(report.title)} - ${companyName}</title>
        <link rel="stylesheet" href="${styles}" />
        <style>
          body { background: #fff; padding: 24px; }
          .print-header { display: flex; align-items: center; gap: 18px; margin-bottom: 18px; }
          .print-header img { width: 220px; }
          .panel { box-shadow: none; }
        </style>
      </head>
      <body>
        <header class="print-header">
          <img src="logo-imobiliaria-rio.svg" alt="${companyName}" />
          <div>
            <h1>${escapeHtml(report.title)}</h1>
            <p>Gerado em ${formatDate(toIsoDate(new Date()))}</p>
          </div>
        </header>
        <table>
          <thead><tr>${report.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
          <tbody>${report.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}

function createSampleData() {
  const propertyA = { id: uid("property"), description: "Sala comercial 204", type: "Sala comercial", area: "45 m2", location: "Aldeota, Fortaleza" };
  const propertyB = { id: uid("property"), description: "Terreno BR-116", type: "Terreno", area: "1.800 m2", location: "Eusebio, CE" };
  const clientA = { id: uid("client"), document: "12.345.678/0001-90", name: "Comercial Lima Ltda", contact: "Mariana Lima", phone: "5585999999999", email: "cliente@example.com" };
  const clientB = { id: uid("client"), document: "529.982.247-25", name: "Joao Pereira", contact: "Joao Pereira", phone: "5585888888888", email: "joao@example.com" };

  return {
    properties: [propertyA, propertyB],
    clients: [clientA, clientB],
    contracts: [
      { id: uid("contract"), propertyId: propertyA.id, clientId: clientA.id, startDate: "2026-01-01", endDate: "2027-01-01", monthlyValue: 2800, adjustmentFrequency: "Anual", adjustmentMethod: "IPCA", dueDay: 10, condoFeeResponsible: "cliente", iptuResponsible: "locador", spuResponsible: "locador", fireFeeResponsible: "cliente" },
      { id: uid("contract"), propertyId: propertyB.id, clientId: clientB.id, startDate: "2025-08-01", endDate: "2026-07-31", monthlyValue: 5200, adjustmentFrequency: "Anual", adjustmentMethod: "IGP-M", dueDay: 5, condoFeeResponsible: "locador", iptuResponsible: "cliente", spuResponsible: "cliente", fireFeeResponsible: "cliente" },
    ],
    expenses: [
      { id: uid("expense"), propertyId: propertyA.id, expenseType: "Manutencao", expenseDate: "2026-05-10", amount: 450, note: "Reparo eletrico" },
      { id: uid("expense"), propertyId: propertyB.id, expenseType: "Impostos e taxas", expenseDate: "2026-04-20", amount: 1300, note: "Taxa municipal" },
    ],
    payments: [
      { id: uid("payment"), propertyId: propertyA.id, paymentDate: "2026-05-10", amount: 2800, chargeAmount: 0, totalAmount: 2800, history: "Pagamento no vencimento" },
      { id: uid("payment"), propertyId: propertyB.id, paymentDate: "2026-05-12", amount: 5200, chargeAmount: 180, totalAmount: 5380, history: "Pagamento com encargo por atraso" },
    ],
  };
}

function getFilteredChargeRows(propertyId = document.getElementById("report-property")?.value || "all", clientId = document.getElementById("report-client")?.value || "all", status = document.getElementById("report-status")?.value || "all") {
  return state.contracts
    .filter((contract) => propertyId === "all" || contract.propertyId === propertyId)
    .filter((contract) => clientId === "all" || contract.clientId === clientId)
    .filter((contract) => status === "all" || getContractStatus(contract).key === status)
    .flatMap((contract) => {
      const property = findProperty(contract.propertyId);
      const client = findClient(contract.clientId);
      return chargeRules.map((rule) => {
        const dueDate = getChargeDueDate(rule);
        return {
          property: property?.description || "-",
          client: client?.name || "-",
          charge: rule.label,
          contract,
          contractId: contract.id,
          responsible: contract[rule.key] || "cliente",
          baseDue: rule.baseLabel,
          adjustedDue: toIsoDate(adjustToPreviousBusinessDay(dueDate)),
        };
      });
    });
}

function getChargeDueDate(rule) {
  const today = new Date();
  if (rule.kind === "monthly") {
    const dueDate = new Date(today.getFullYear(), today.getMonth(), rule.day);
    if (dueDate < today) dueDate.setMonth(dueDate.getMonth() + 1);
    return dueDate;
  }

  const dueDate = new Date(today.getFullYear(), rule.month, rule.day);
  if (dueDate < today) dueDate.setFullYear(dueDate.getFullYear() + 1);
  return dueDate;
}

function adjustToPreviousBusinessDay(date) {
  const adjusted = new Date(date);
  while (adjusted.getDay() === 0 || adjusted.getDay() === 6) {
    adjusted.setDate(adjusted.getDate() - 1);
  }
  return adjusted;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function getFilteredExpenses(filters = getReportFilters()) {
  return state.expenses
    .filter((expense) => filters.expenseType === "all" || expense.expenseType === filters.expenseType)
    .filter((expense) => !filters.startDate || parseDate(expense.expenseDate) >= parseDate(filters.startDate))
    .filter((expense) => !filters.endDate || parseDate(expense.expenseDate) <= parseDate(filters.endDate));
}

function getFilteredPayments(filters = getReportFilters(), propertyId = document.getElementById("report-property")?.value || "all", clientId = document.getElementById("report-client")?.value || "all", status = document.getElementById("report-status")?.value || "all") {
  const allowedProperties = getAllowedPaymentPropertyIds(clientId, status);
  return state.payments
    .filter((payment) => propertyId === "all" || payment.propertyId === propertyId)
    .filter((payment) => !allowedProperties || allowedProperties.has(payment.propertyId))
    .filter((payment) => !filters.startDate || parseDate(payment.paymentDate) >= parseDate(filters.startDate))
    .filter((payment) => !filters.endDate || parseDate(payment.paymentDate) <= parseDate(filters.endDate))
    .filter((payment) => !filters.minValue || Number(payment.totalAmount || 0) >= filters.minValue)
    .filter((payment) => !filters.maxValue || Number(payment.totalAmount || 0) <= filters.maxValue);
}

function getAllowedPaymentPropertyIds(clientId, status) {
  if (clientId === "all" && status === "all") return null;
  return new Set(
    state.contracts
      .filter((contract) => clientId === "all" || contract.clientId === clientId)
      .filter((contract) => status === "all" || getContractStatus(contract).key === status)
      .map((contract) => contract.propertyId),
  );
}

function getEnteredExpenses(propertyId, filters = getReportFilters()) {
  return getFilteredExpenses(filters)
    .filter((expense) => expense.propertyId === propertyId)
    .reduce((sum, expense) => sum + expense.amount, 0);
}

function capitalize(value) {
  return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
}

function findProperty(id) {
  return state.properties.find((property) => property.id === id);
}

function findClient(id) {
  return state.clients.find((client) => client.id === id);
}

function getContractsForProperty(propertyId) {
  if (!propertyId) return [];
  return state.contracts
    .filter((contract) => contract.propertyId === propertyId)
    .sort((left, right) => String(right.startDate || "").localeCompare(String(left.startDate || "")));
}

function findActiveContractForDate(contracts, launchDate) {
  const date = parseDate(launchDate);
  if (!date || !Array.isArray(contracts)) return null;
  return contracts.find((contract) => {
    const start = parseDate(contract.startDate);
    const end = parseDate(contract.endDate);
    return start && end && date >= start && date <= end;
  }) || null;
}

function findFinancialContract(propertyId, launchDate, preferredContractId = "") {
  if (!propertyId) return null;
  const matchingContracts = getContractsForProperty(propertyId);
  if (!matchingContracts.length) return null;

  const activeContract = findActiveContractForDate(matchingContracts, launchDate);
  if (activeContract) return activeContract;

  if (preferredContractId) {
    const preferred = matchingContracts.find((contract) => contract.id === preferredContractId);
    if (preferred) return preferred;
  }

  return matchingContracts.length === 1 ? matchingContracts[0] : null;
}

function findPaymentContract(propertyId, paymentDate, preferredContractId = "") {
  return findFinancialContract(propertyId, paymentDate, preferredContractId);
}

function getContractCode(contract) {
  if (!contract?.id) return "";
  return String(contract.id).replace(/^contract-?/, "CTR-").slice(0, 12).toUpperCase();
}

function daysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateString}T00:00:00`);
  return Math.ceil((target - today) / 86400000);
}

function toMonthValue(date) {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthValue(value) {
  const [year, month] = String(value || "").split("-").map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, 1);
}

function listMonths(startDate, endDate) {
  const months = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cursor <= end) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months.length ? months : [new Date(startDate.getFullYear(), startDate.getMonth(), 1)];
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "2-digit", year: "numeric" }).format(date);
}

function formatMoney(value) {
  return moneyFormatter.format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatDate(dateString) {
  if (!dateString) return "-";
  return dateFormatter.format(new Date(`${dateString}T00:00:00Z`));
}

function formatDateTime(dateString) {
  if (!dateString) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(dateString));
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================================
 * Exportacoes do ERP financeiro - PDF, Excel (xlsx) e CSV
 * Usa SheetJS (XLSX global) e jsPDF + autoTable carregados via CDN no HTML.
 * Em caso de bloqueio da CDN, fallback para .xls (HTML) e janela de impressao.
 * ========================================================================= */

function getErpExportData() {
  renderFinancialErp();
  const period = getErpPeriod();
  const receivables = buildAutomaticReceivables(period);
  const payments = state.payments.filter((p) =>
    isDateInPeriod(parseDate(p.paymentDate), period.startDate, period.endDate),
  );
  const expenses = state.expenses.filter((e) =>
    isDateInPeriod(parseDate(e.expenseDate), period.startDate, period.endDate),
  );
  const receivedRevenue = payments.reduce((s, p) => s + Number(p.totalAmount || 0), 0);
  const expectedRevenue = receivables.reduce((s, i) => s + i.expected, 0);
  const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const overdueTotal = receivables
    .filter((i) => i.statusKey === "overdue")
    .reduce((s, i) => s + i.balance, 0);
  const operatingResult = receivedRevenue - expensesTotal;
  const operatingMargin = receivedRevenue ? (operatingResult / receivedRevenue) * 100 : 0;
  const totalInvestment = state.properties.reduce(
    (s, p) => s + Number(p.investmentValue || 0),
    0,
  );
  const annualizedRoi = totalInvestment
    ? (operatingResult / totalInvestment) * (12 / period.months.length) * 100
    : 0;

  const summary = [
    ["Periodo", `${formatMonth(period.startDate)} a ${formatMonth(period.endDate)}`],
    ["Recebiveis previstos", formatMoney(expectedRevenue)],
    ["Recebido no periodo", formatMoney(receivedRevenue)],
    ["Inadimplencia vencida", formatMoney(overdueTotal)],
    ["Despesas operacionais", formatMoney(expensesTotal)],
    ["Resultado operacional", formatMoney(operatingResult)],
    ["Margem operacional", `${formatNumber(operatingMargin)}%`],
    ["ROI anualizado", `${formatNumber(annualizedRoi)}%`],
  ];

  const receivablesRows = receivables.map((i) => [
    formatDate(toDateInputValue(i.dueDate)),
    i.property?.description || "-",
    i.client?.name || "-",
    Number(i.expected.toFixed(2)),
    Number(i.received.toFixed(2)),
    Number(i.balance.toFixed(2)),
    i.status,
  ]);

  const cashflowRows = period.months.map((monthDate) => {
    const month = toMonthValue(monthDate);
    const inflow = payments
      .filter((p) => toMonthValue(parseDate(p.paymentDate)) === month)
      .reduce((s, p) => s + Number(p.totalAmount || 0), 0);
    const outflow = expenses
      .filter((e) => toMonthValue(parseDate(e.expenseDate)) === month)
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    return [formatMonth(monthDate), Number(inflow.toFixed(2)), Number(outflow.toFixed(2)), Number((inflow - outflow).toFixed(2))];
  });

  const expenseCatRows = Object.entries(
    expenses.reduce((g, e) => {
      const k = e.expenseType || "Outros";
      g[k] = (g[k] || 0) + Number(e.amount || 0);
      return g;
    }, {}),
  )
    .map(([cat, amt]) => [cat, Number(amt.toFixed(2)), expensesTotal ? Number(((amt / expensesTotal) * 100).toFixed(2)) : 0])
    .sort((a, b) => b[1] - a[1]);

  const propRows = state.properties
    .map((property) => {
      const revenue = payments
        .filter((p) => p.propertyId === property.id)
        .reduce((s, p) => s + Number(p.totalAmount || 0), 0);
      const expTotal = expenses
        .filter((e) => e.propertyId === property.id)
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      const result = revenue - expTotal;
      const margin = revenue ? (result / revenue) * 100 : 0;
      const investment = Number(property.investmentValue || 0);
      const roi = investment ? (result / investment) * (12 / period.months.length) * 100 : 0;
      return [property.description, Number(revenue.toFixed(2)), Number(expTotal.toFixed(2)), Number(result.toFixed(2)), Number(margin.toFixed(2)), Number(roi.toFixed(2))];
    })
    .filter((r) => r[1] || r[2] || r[3]);

  return {
    period,
    summary,
    receivables: { headers: ["Vencimento", "Imovel", "Cliente", "Previsto", "Recebido", "Saldo", "Status"], rows: receivablesRows },
    cashflow: { headers: ["Mes", "Entradas", "Saidas", "Saldo"], rows: cashflowRows },
    expenseCategories: { headers: ["Categoria", "Total", "Participacao %"], rows: expenseCatRows },
    profitability: { headers: ["Imovel", "Receita", "Despesas", "Resultado", "Margem %", "ROI anualizado %"], rows: propRows },
  };
}

function exportFinancialErpExcel() {
  const data = getErpExportData();
  const fileName = `erp-financeiro-${toMonthValue(data.period.startDate)}_a_${toMonthValue(data.period.endDate)}.xlsx`;

  if (typeof XLSX === "undefined") {
    alert("Biblioteca XLSX nao carregou. Verifique sua conexao para gerar o arquivo Excel.");
    return;
  }
  const wb = XLSX.utils.book_new();
  const addSheet = (name, headers, rows, prefix = []) => {
    const aoa = [...prefix];
    if (headers) aoa.push(headers);
    aoa.push(...rows);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };
  addSheet("Resumo", null, data.summary, [[`ERP Financeiro - ${companyName}`], [`Gerado em ${formatDate(toIsoDate(new Date()))}`], []]);
  addSheet("Contas a receber", data.receivables.headers, data.receivables.rows);
  addSheet("Fluxo de caixa", data.cashflow.headers, data.cashflow.rows);
  addSheet("Despesas por categoria", data.expenseCategories.headers, data.expenseCategories.rows);
  addSheet("Rentabilidade por imovel", data.profitability.headers, data.profitability.rows);
  XLSX.writeFile(wb, fileName);
}

function exportFinancialErpPdf() {
  const data = getErpExportData();
  const fileName = `erp-financeiro-${toMonthValue(data.period.startDate)}_a_${toMonthValue(data.period.endDate)}.pdf`;

  const jsPDFCtor = window.jspdf?.jsPDF;
  if (!jsPDFCtor) {
    alert("Biblioteca jsPDF nao carregou. Verifique sua conexao para gerar o PDF.");
    return;
  }
  const doc = new jsPDFCtor({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(16);
  doc.text(`ERP Financeiro - ${companyName}`, 40, 50);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `Periodo: ${formatMonth(data.period.startDate)} a ${formatMonth(data.period.endDate)}    -    Gerado em ${formatDate(toIsoDate(new Date()))}`,
    40,
    68,
  );
  doc.setTextColor(0);

  const drawTable = (title, headers, rows) => {
    if (typeof doc.autoTable !== "function") {
      doc.setFontSize(12);
      doc.text(title, 40, doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 30 : 100);
      return;
    }
    doc.autoTable({
      head: headers ? [headers] : undefined,
      body: rows.map((r) => r.map((c) => (typeof c === "number" ? formatMoneyOrNumber(c) : String(c)))),
      startY: doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 24 : 90,
      margin: { left: 40, right: 40 },
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [92, 23, 27], textColor: 255 },
      didDrawPage: () => {
        doc.setFontSize(11);
        doc.setTextColor(92, 23, 27);
        doc.text(title, 40, doc.lastAutoTable?.finalY ? 40 : 86);
        doc.setTextColor(0);
      },
    });
  };

  // Resumo como tabela simples
  if (typeof doc.autoTable === "function") {
    doc.autoTable({
      body: data.summary,
      startY: 90,
      margin: { left: 40, right: 40 },
      styles: { fontSize: 10, cellPadding: 5 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 200 } },
    });
  }
  drawTable("Contas a receber", data.receivables.headers, data.receivables.rows);
  drawTable("Fluxo de caixa", data.cashflow.headers, data.cashflow.rows);
  drawTable("Despesas por categoria", data.expenseCategories.headers, data.expenseCategories.rows);
  drawTable("Rentabilidade por imovel", data.profitability.headers, data.profitability.rows);

  doc.save(fileName);
}

function formatMoneyOrNumber(value) {
  if (Number.isFinite(value)) return formatMoney(value);
  return String(value);
}

function exportFinancialErpCsv() {
  const data = getErpExportData();
  const lines = [];
  const push = (title, headers, rows) => {
    lines.push(title);
    if (headers) lines.push(headers.join(";"));
    rows.forEach((r) => lines.push(r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")));
    lines.push("");
  };
  push("Resumo", null, data.summary);
  push("Contas a receber", data.receivables.headers, data.receivables.rows);
  push("Fluxo de caixa", data.cashflow.headers, data.cashflow.rows);
  push("Despesas por categoria", data.expenseCategories.headers, data.expenseCategories.rows);
  push("Rentabilidade por imovel", data.profitability.headers, data.profitability.rows);
  downloadTextFile(
    "\ufeff" + lines.join("\n"),
    `erp-financeiro-${toMonthValue(data.period.startDate)}_a_${toMonthValue(data.period.endDate)}.csv`,
    "text/csv;charset=utf-8",
  );
}
