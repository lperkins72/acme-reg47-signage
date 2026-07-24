(function () {
  const CONFIG_PATH = "data/sync.json";
  const DEFAULT_DEBOUNCE_MS = 250;

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

  function createClient(options) {
    const scope = options.scope;
    const getState = options.getState;
    const applyState = options.applyState;
    const debounceMs = Number.isFinite(options.debounceMs)
      ? options.debounceMs
      : DEFAULT_DEBOUNCE_MS;

    let baseUrl = "";
    let enabled = false;
    let ready = false;
    let applying = false;
    let connected = false;
    let lastStateJson = "";
    let commitTimer = null;
    let socket = null;

    function emitStatus() {
      const status = { configured: enabled, connected, ready };
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

    async function fetchState() {
      try {
        const response = await fetch(settingsUrl(baseUrl, scope), { cache: "no-store" });
        if (!response.ok) return null;
        const json = await response.json();
        if (!json || typeof json.state !== "object") return null;
        return json.state;
      } catch {
        return null;
      }
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
      const url = socketUrl(baseUrl, scope);
      try {
        socket = new WebSocket(url);
      } catch {
        socket = null;
        connected = false;
        emitStatus();
        return;
      }

      socket.addEventListener("open", () => {
        connected = true;
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
        socket = null;
        connected = false;
        emitStatus();
        setTimeout(connect, 90000);
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
      const remoteState = await fetchState();
      if (remoteState) {
        applyRemote(remoteState);
      } else {
        ready = true;
        await commitNow();
      }
      ready = true;
      emitStatus();
      connect();
      return true;
    }

    return {
      start,
      commit,
      commitNow,
      isApplying: () => applying
    };
  }

  window.beaconSync = {
    createClient
  };
})();
