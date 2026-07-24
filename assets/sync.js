(function () {
  const CONFIG_PATH = "data/sync.json";
  const DEFAULT_DEBOUNCE_MS = 250;
  const RECONNECT_DELAY_MS = 90000;
  const DEFAULT_FALLBACK_POLL_MS = 30000;
  const SECONDARY_FALLBACK_POLL_MS = 120000;

  function normalizeBaseUrl(value) {
    if (!value) return "";
    return String(value).trim().replace(/\/+$/, "");
  }

  async function resolveBaseUrl(explicitUrl) {
    if (explicitUrl) return normalizeBaseUrl(explicitUrl);
    if (window.BEACON_SYNC_URL) return normalizeBaseUrl(window.BEACON_SYNC_URL);
    if (window.beaconRuntimeConfig && typeof window.beaconRuntimeConfig.getSyncUrl === "function") {
      return normalizeBaseUrl(await window.beaconRuntimeConfig.getSyncUrl());
    }
    try {
      const response = await fetch(CONFIG_PATH, { cache: "no-store" });
      if (!response.ok) return "";
      const json = await response.json();
      return normalizeBaseUrl(json && json.syncUrl ? json.syncUrl : "");
    } catch {
      return "";
    }
  }

  function settingsUrl(baseUrl, scope) {
    return `${baseUrl}/settings/${encodeURIComponent(scope)}`;
  }

  function socketUrl(baseUrl, scope) {
    const wsBase = baseUrl.replace(/^http/i, "ws");
    return `${wsBase}/connect/${encodeURIComponent(scope)}`;
  }

  function inferFallbackPollMs(scope) {
    const normalized = String(scope || "").trim().toLowerCase();
    if (normalized === "secondary" || normalized.endsWith(":zone:secondary")) {
      return SECONDARY_FALLBACK_POLL_MS;
    }
    return DEFAULT_FALLBACK_POLL_MS;
  }

  function createClient(options) {
    const scope = options.scope;
    const getState = options.getState;
    const applyState = options.applyState;
    const debounceMs = Number.isFinite(options.debounceMs)
      ? options.debounceMs
      : DEFAULT_DEBOUNCE_MS;
    const fallbackPollMs = Number.isFinite(options.fallbackPollMs) && options.fallbackPollMs >= 1000
      ? options.fallbackPollMs
      : inferFallbackPollMs(scope);

    let baseUrl = "";
    let enabled = false;
    let ready = false;
    let applying = false;
    let connected = false;
    let fallbackPolling = false;
    let lastStateJson = "";
    let commitTimer = null;
    let reconnectTimer = null;
    let fallbackPollTimer = null;
    let socket = null;
    let stateFetchInFlight = false;
    const seedIfMissing = options.seedIfMissing !== false;

    function emitStatus() {
      const status = { configured: enabled, connected, ready, fallbackPolling, fallbackPollMs };
      if (typeof options.onStatus === "function") {
        options.onStatus(status);
      }
      try {
        window.top.postMessage({ type: "beacon-sync-status", scope, status }, "*");
      } catch {
        // Status is advisory only.
      }
    }

    function safeStringify(value) {
      try {
        return JSON.stringify(value);
      } catch {
        return "";
      }
    }

    function applyRemote(state) {
      if (!state || typeof state !== "object") return;
      const json = safeStringify(state);
      if (json && json === lastStateJson) return;
      applying = true;
      try {
        applyState(state);
      } finally {
        applying = false;
      }
      if (json) {
        lastStateJson = json;
      }
    }

    function clearReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function stopFallbackPolling() {
      if (fallbackPollTimer) {
        clearInterval(fallbackPollTimer);
        fallbackPollTimer = null;
      }
      if (fallbackPolling) {
        fallbackPolling = false;
        emitStatus();
      }
    }

    function scheduleReconnect() {
      if (!enabled || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    }

    async function fetchStatePayload() {
      try {
        const response = await fetch(settingsUrl(baseUrl, scope), { cache: "no-store" });
        if (!response.ok) return null;
        const json = await response.json();
        if (!json || typeof json !== "object") return null;
        return json;
      } catch {
        return null;
      }
    }

    async function pollFallbackState() {
      if (!enabled || !ready || connected || stateFetchInFlight) return;
      stateFetchInFlight = true;
      try {
        const payload = await fetchStatePayload();
        if (payload && payload.state && typeof payload.state === "object") {
          applyRemote(payload.state);
        }
      } finally {
        stateFetchInFlight = false;
      }
    }

    function startFallbackPolling() {
      if (!enabled || !ready || fallbackPollTimer) return;
      fallbackPolling = true;
      emitStatus();
      fallbackPollTimer = setInterval(() => {
        void pollFallbackState();
      }, fallbackPollMs);
    }

    async function commitNow() {
      if (!enabled || applying) return;
      const state = getState();
      if (!state || typeof state !== "object") return;
      const json = safeStringify(state);
      if (json && json === lastStateJson) return;
      if (json) {
        lastStateJson = json;
      }
      try {
        await fetch(settingsUrl(baseUrl, scope), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state })
        });
      } catch {
        // Keep local behavior if sync fails.
      }
    }

    function commit() {
      if (!enabled || applying || !ready) return;
      if (commitTimer) {
        clearTimeout(commitTimer);
      }
      commitTimer = setTimeout(commitNow, debounceMs);
    }

    function connect() {
      if (!enabled) return;
      clearReconnectTimer();
      const url = socketUrl(baseUrl, scope);

      function handleDisconnect() {
        if (socket) {
          try {
            socket.close();
          } catch {}
        }
        socket = null;
        connected = false;
        emitStatus();
        startFallbackPolling();
        scheduleReconnect();
      }

      try {
        socket = new WebSocket(url);
      } catch {
        handleDisconnect();
        return;
      }

      socket.addEventListener("open", () => {
        connected = true;
        stopFallbackPolling();
        emitStatus();
      });

      socket.addEventListener("message", (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (payload && payload.type === "state") {
          applyRemote(payload.state);
        }
      });

      socket.addEventListener("close", () => {
        handleDisconnect();
      });

      socket.addEventListener("error", () => {
        handleDisconnect();
      });
    }

    async function start() {
      baseUrl = await resolveBaseUrl(options.baseUrl);
      if (!baseUrl) {
        emitStatus();
        return false;
      }
      enabled = true;
      emitStatus();
      const remotePayload = await fetchStatePayload();
      if (remotePayload && remotePayload.state && typeof remotePayload.state === "object") {
        applyRemote(remotePayload.state);
      } else if (seedIfMissing) {
        ready = true;
        await commitNow();
      }
      ready = true;
      emitStatus();
      connect();
      return true;
    }

    function stop() {
      enabled = false;
      ready = false;
      if (commitTimer) {
        clearTimeout(commitTimer);
        commitTimer = null;
      }
      clearReconnectTimer();
      stopFallbackPolling();
      if (socket) {
        try {
          socket.close();
        } catch {}
        socket = null;
      }
      connected = false;
      emitStatus();
    }

    return {
      start,
      stop,
      commit,
      commitNow,
      isApplying: () => applying
    };
  }

  window.beaconSync = {
    createClient
  };
})();
