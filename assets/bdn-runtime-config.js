(function () {
  const CONFIG_PATH = "data/sync.json";
  let loadPromise = null;

  function normalizeBaseUrl(value) {
    if (!value) return "";
    return String(value).trim().replace(/\/+$/, "");
  }

  function normalizeConfig(json) {
    const source = json && typeof json === "object" ? json : {};
    return {
      syncUrl: normalizeBaseUrl(source.syncUrl),
      heartbeatUrl: normalizeBaseUrl(source.heartbeatUrl),
      settingsAuthUrl: normalizeBaseUrl(source.settingsAuthUrl)
    };
  }

  async function load() {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        const response = await fetch(CONFIG_PATH, { cache: "no-store" });
        if (!response.ok) return normalizeConfig({});
        const json = await response.json();
        return normalizeConfig(json);
      } catch {
        return normalizeConfig({});
      }
    })();

    return loadPromise;
  }

  async function getSyncUrl() {
    const config = await load();
    return config.syncUrl;
  }

  async function getHeartbeatUrl() {
    const config = await load();
    return config.heartbeatUrl;
  }

  async function getSettingsAuthUrl() {
    const config = await load();
    return config.settingsAuthUrl;
  }

  window.beaconRuntimeConfig = {
    load,
    getSyncUrl,
    getHeartbeatUrl,
    getSettingsAuthUrl
  };
})();
