(function () {
  const SETTINGS_KEY = "app-locacao-supabase-settings-v1";
  const defaults = window.LOCACOES_SUPABASE_DEFAULTS || {};
  const table = defaults.table || "locacoes_state";
  const rowId = defaults.rowId || "main";
  const OUTBOX_KEY = `${table}:${rowId}`;
  const offlineDatabase = window.createOfflineDatabase?.({ dbName: "app-locacao-offline-v1" }) || null;

  let client = null;
  let user = null;
  let status = "Aguardando configuracao.";
  let statusHandler = null;
  let saveTimer = null;

  function emit(nextStatus) {
    status = nextStatus;
    if (statusHandler) statusHandler(nextStatus);
  }

  function loadSettings() {
    try {
      return { ...defaults, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
    } catch {
      return { ...defaults };
    }
  }

  function configure(next = {}) {
    const settings = { ...loadSettings(), ...next };
    if (!settings.url || !settings.anonKey || !window.supabase) {
      client = null;
      emit("Supabase aguardando URL e anon key.");
      return null;
    }
    client = window.supabase.createClient(settings.url, settings.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    emit("Supabase configurado.");
    return client;
  }

  function ensureClient() {
    if (!client) configure();
    if (!client) throw new Error("Configure URL e anon key do Supabase.");
    return client;
  }

  function hasLocacaoAccess(account) {
    if (!account) return false;
    if (String(account.email || "").toLowerCase() === "edson@cupe.com") return true;
    return account.app_metadata?.app_access?.locacao?.active === true;
  }

  async function restoreSession() {
    const sb = ensureClient();
    const { data, error } = await sb.auth.getUser();
    if (error) throw error;
    user = hasLocacaoAccess(data.user) ? data.user : null;
    if (data.user && !user) await sb.auth.signOut();
    emit(user ? `Conectado como ${user.email}` : "Supabase aguardando login.");
    return user;
  }

  async function signIn(email, password) {
    if (!email || !password) throw new Error("Informe e-mail e senha.");
    const sb = ensureClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!hasLocacaoAccess(data.user)) {
      await sb.auth.signOut();
      throw new Error("Este usuário não possui acesso ao App Locação.");
    }
    user = data.user;
    emit(`Conectado como ${user.email}`);
    return user;
  }

  async function signOut() {
    const sb = ensureClient();
    await sb.auth.signOut();
    user = null;
    emit("Supabase desconectado.");
  }

  async function invokeUserManagement(action, payload = {}) {
    const sb = ensureClient();
    const { data, error } = await sb.functions.invoke("manage-users", { body: { action, appId: "locacao", ...payload } });
    if (error) {
      try {
        const details = await error.context?.clone?.().json();
        if (details?.error || details?.message) throw new Error(details.error || details.message);
      } catch (detailsError) {
        if (detailsError?.message !== error.message) throw detailsError;
      }
      throw error;
    }
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  const inviteAccessUser = (payload) => invokeUserManagement("invite", payload);
  const listAccessUsers = () => invokeUserManagement("list");
  const updateAccessUserRole = (userId, role) => invokeUserManagement("update-role", { userId, role });
  const deactivateAccessUser = (userId) => invokeUserManagement("deactivate", { userId });

  async function requestPasswordReset(email, redirectTo) {
    const sb = ensureClient();
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }

  async function updatePassword(password) {
    const sb = ensureClient();
    const { data, error } = await sb.auth.updateUser({ password });
    if (error) throw error;
    return data.user;
  }

  async function loadRemote() {
    const sb = ensureClient();
    await restoreSession();
    if (!user) throw new Error("Entre no Supabase antes de sincronizar.");
    emit("Baixando dados da nuvem...");
    const { data, error } = await sb
      .from(table)
      .select("data, updated_at")
      .eq("id", rowId)
      .maybeSingle();
    if (error) throw error;
    emit(data ? "Dados da nuvem carregados." : "Nenhum dado na nuvem ainda.");
    return data ? { data: data.data, updatedAt: data.updated_at } : null;
  }

  async function saveNow(appState) {
    const snapshot = structuredClone(appState);
    const sb = ensureClient();
    await restoreSession();
    if (!user) throw new Error("Entre no Supabase antes de sincronizar.");
    emit("Enviando dados ao Supabase...");
    const payload = {
      id: rowId,
      user_id: user.id,
      data: snapshot,
      updated_at: new Date().toISOString()
    };
    const { error } = await sb.from(table).upsert(payload, { onConflict: "user_id,id" });
    if (error) throw error;
    if (offlineDatabase) {
      const pending = await offlineDatabase.getPending(OUTBOX_KEY).catch(() => null);
      if (pending?.value && JSON.stringify(pending.value) === JSON.stringify(snapshot)) {
        await offlineDatabase.removePending(OUTBOX_KEY);
      }
    }
    emit(`Sincronizado como ${user.email}`);
  }

  function queueSave(appState) {
    const snapshot = structuredClone(appState);
    offlineDatabase?.enqueue(OUTBOX_KEY, snapshot, { reason: navigator.onLine ? "debounce" : "offline" })
      .catch((error) => console.warn("[Supabase] Fila IndexedDB indisponível:", error));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!client || !user || !navigator.onLine) return;
      saveNow(snapshot).catch((error) => emit(error.message || "Falha ao sincronizar."));
    }, 1200);
  }

  async function flushDurableQueue() {
    if (!offlineDatabase || !navigator.onLine || !client || !user) return null;
    const pending = await offlineDatabase.getPending(OUTBOX_KEY);
    if (!pending?.value) return null;
    await saveNow(pending.value);
    return pending;
  }

  async function restoreDurableQueue() {
    if (!offlineDatabase) return null;
    return offlineDatabase.getPending(OUTBOX_KEY).catch(() => null);
  }

  window.LocacoesSupabaseSync = {
    configure,
    restoreSession,
    signIn,
    signOut,
    loadRemote,
    saveNow,
    queueSave,
    flushDurableQueue,
    restoreDurableQueue,
    inviteAccessUser,
    listAccessUsers,
    updateAccessUserRole,
    deactivateAccessUser,
    requestPasswordReset,
    updatePassword,
    getUser: () => user,
    getStatus: () => status,
    onStatus: (handler) => {
      statusHandler = handler;
      handler(status);
    }
  };

  window.addEventListener("online", () => {
    flushDurableQueue().catch((error) => emit(error.message || "Falha ao reenviar alterações pendentes."));
  });
})();
