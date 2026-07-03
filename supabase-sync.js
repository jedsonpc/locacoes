(function () {
  const SETTINGS_KEY = "app-locacao-supabase-settings-v1";
  const defaults = window.LOCACOES_SUPABASE_DEFAULTS || {};
  const table = defaults.table || "locacoes_state";
  const rowId = defaults.rowId || "main";

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

  async function restoreSession() {
    const sb = ensureClient();
    const { data, error } = await sb.auth.getUser();
    if (error) throw error;
    user = data.user || null;
    emit(user ? `Conectado como ${user.email}` : "Supabase aguardando login.");
    return user;
  }

  async function signIn(email, password) {
    if (!email || !password) throw new Error("Informe e-mail e senha.");
    const sb = ensureClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
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
    const sb = ensureClient();
    await restoreSession();
    if (!user) throw new Error("Entre no Supabase antes de sincronizar.");
    emit("Enviando dados ao Supabase...");
    const payload = {
      id: rowId,
      user_id: user.id,
      data: appState,
      updated_at: new Date().toISOString()
    };
    const { error } = await sb.from(table).upsert(payload, { onConflict: "user_id,id" });
    if (error) throw error;
    emit(`Sincronizado como ${user.email}`);
  }

  function queueSave(appState) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!client || !user || !navigator.onLine) return;
      saveNow(appState).catch((error) => emit(error.message || "Falha ao sincronizar."));
    }, 1200);
  }

  window.LocacoesSupabaseSync = {
    configure,
    restoreSession,
    signIn,
    signOut,
    loadRemote,
    saveNow,
    queueSave,
    getUser: () => user,
    getStatus: () => status,
    onStatus: (handler) => {
      statusHandler = handler;
      handler(status);
    }
  };
})();
