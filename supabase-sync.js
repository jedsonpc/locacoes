// ============================================================
// CAMADA DE SINCRONIZACAO COM SUPABASE
// ============================================================
// - Login com email/senha
// - Carrega estado de workspace_state (linha unica compartilhada)
// - Salva com debounce para evitar excesso de writes
// - Realtime: outros usuarios veem mudancas na hora
// - Fallback: mantem ultimo estado em localStorage como cache offline
// ============================================================

(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const hasConfig = Boolean(
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    cfg.WORKSPACE_ID &&
    window.supabase
  );

  if (!hasConfig) {
    console.warn("[Supabase] Configure supabase-config.js antes de usar.");
    return;
  }

  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const CACHE_KEY = "gestao-supabase-cache-v1";
  const META_KEY = "gestao-supabase-meta-v1";
  let saveTimer = null;
  let lastLocalUpdate = 0;

  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  async function signOut() {
    await client.auth.signOut();
  }

  async function getCurrentUser() {
    const { data } = await client.auth.getUser();
    return data.user || null;
  }

  async function loadRemoteState(options = {}) {
    const fallbackToCache = options.fallbackToCache !== false;
    const includeMetadata = options.includeMetadata === true;
    const { data, error } = await client
      .from("workspace_state")
      .select("data, updated_at")
      .eq("id", cfg.WORKSPACE_ID)
      .maybeSingle();

    if (error) {
      console.error("[Supabase] Erro ao carregar:", error);
      const cachedState = fallbackToCache ? loadCachedState() : null;
      return includeMetadata && cachedState ? { state: cachedState, updatedAt: loadCachedMeta()?.updatedAt || null } : cachedState;
    }

    if (!data?.data) {
      const cachedState = fallbackToCache ? loadCachedState() : null;
      return includeMetadata && cachedState ? { state: cachedState, updatedAt: loadCachedMeta()?.updatedAt || null } : cachedState;
    }

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data.data));
      localStorage.setItem(META_KEY, JSON.stringify({ updatedAt: data.updated_at || null }));
    } catch {
      console.warn("[Supabase] Nao foi possivel atualizar o cache local.");
    }
    return includeMetadata ? { state: data.data, updatedAt: data.updated_at || null } : data.data;
  }

  function loadCachedState() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  function loadCachedMeta() {
    try {
      const cached = localStorage.getItem(META_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state || {}));
  }

  function cacheState(state) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(state));
    } catch {
      console.warn("[Supabase] Nao foi possivel salvar o cache local.");
    }
  }

  function countStateRecords(state) {
    return ["properties", "clients", "contracts", "expenses", "payments", "auditLogs"].reduce(
      (counts, key) => {
        counts[key] = Array.isArray(state?.[key]) ? state[key].length : 0;
        return counts;
      },
      {},
    );
  }

  function mergeCollections(localItems = [], remoteItems = [], deletedIds = new Set()) {
    const merged = new Map();
    remoteItems.forEach((item) => {
      if (item?.id && !deletedIds.has(item.id)) merged.set(item.id, item);
    });
    localItems.forEach((item) => {
      if (!item?.id) return;
      if (deletedIds.has(item.id)) {
        merged.delete(item.id);
        return;
      }
      const current = merged.get(item.id);
      const currentTime = new Date(current?.updatedAt || 0).getTime();
      const itemTime = new Date(item.updatedAt || 0).getTime();
      if (!current || itemTime >= currentTime) merged.set(item.id, item);
    });
    return [...merged.values()];
  }

  function getLocallyDeletedIds(localState, collection) {
    return new Set(
      (localState.auditLogs || [])
        .filter((log) => log.action === "record_deleted" && log.collection === collection && log.recordId)
        .map((log) => log.recordId)
    );
  }

  function mergeStateForSave(localState, remoteState) {
    if (!remoteState?.data && !remoteState?.properties) return localState;
    const remoteData = remoteState.data || remoteState;
    const merged = { ...remoteData, ...localState };
    ["properties", "clients", "contracts", "expenses", "payments"].forEach((collection) => {
      merged[collection] = mergeCollections(
        Array.isArray(localState[collection]) ? localState[collection] : [],
        Array.isArray(remoteData[collection]) ? remoteData[collection] : [],
        getLocallyDeletedIds(localState, collection)
      );
    });
    merged.auditLogs = [
      ...(Array.isArray(remoteData.auditLogs) ? remoteData.auditLogs : []),
      ...(Array.isArray(localState.auditLogs) ? localState.auditLogs : []),
    ]
      .filter((log, index, logs) => log?.id && logs.findIndex((item) => item.id === log.id) === index)
      .slice(-500);
    return merged;
  }

  async function persistRemoteState(state) {
    let snapshot = cloneState(state);
    lastLocalUpdate = Date.now();
    const user = await getCurrentUser();
    const { data: remoteRow, error: readError } = await client
      .from("workspace_state")
      .select("data")
      .eq("id", cfg.WORKSPACE_ID)
      .maybeSingle();

    if (!readError && remoteRow?.data) {
      snapshot = mergeStateForSave(snapshot, remoteRow.data);
    }

    const { data, error } = await client
      .from("workspace_state")
      .upsert(
        {
          id: cfg.WORKSPACE_ID,
          data: snapshot,
          updated_at: new Date().toISOString(),
          updated_by: user ? user.id : null,
        },
        { onConflict: "id" },
      )
      .select("updated_at")
      .maybeSingle();

    if (error) {
      console.error("[Supabase] Erro ao salvar:", error);
      throw error;
    }

    console.log("[Supabase] Salvo na nuvem.");
    try {
      localStorage.setItem(META_KEY, JSON.stringify({ updatedAt: data?.updated_at || null }));
    } catch {
      console.warn("[Supabase] Nao foi possivel salvar metadados de sincronizacao.");
    }
    return {
      updatedAt: data?.updated_at || null,
      counts: countStateRecords(snapshot),
    };
  }

  function saveRemoteState(state) {
    const snapshot = cloneState(state);
    cacheState(snapshot);

    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await persistRemoteState(snapshot);
      } catch (error) {
        alert(
          "Falha ao salvar na nuvem: " +
          error.message +
          "\nOs dados foram mantidos neste dispositivo como backup."
        );
      }
    }, 500);
  }

  async function saveRemoteStateNow(state) {
    const snapshot = cloneState(state);
    cacheState(snapshot);
    clearTimeout(saveTimer);
    return persistRemoteState(snapshot);
  }

  function subscribeChanges(onChange) {
    return client
      .channel("workspace-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_state", filter: `id=eq.${cfg.WORKSPACE_ID}` },
        (payload) => {
          if (Date.now() - lastLocalUpdate < 2000) return;
          const remoteData = payload.new?.data;
          if (!remoteData) return;
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(remoteData));
            localStorage.setItem(META_KEY, JSON.stringify({ updatedAt: payload.new?.updated_at || null }));
          } catch {
            console.warn("[Supabase] Nao foi possivel atualizar o cache local.");
          }
          console.log("[Supabase] Mudanca remota recebida.");
          onChange(remoteData, payload.new?.updated_at || null);
        }
      )
      .subscribe();
  }

  window.SupabaseSync = {
    signIn,
    signOut,
    getCurrentUser,
    loadRemoteState,
    saveRemoteState,
    saveRemoteStateNow,
    subscribeChanges,
    client,
  };
})();
