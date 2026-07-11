(function () {
  const VERSION_PREFIX = "bdn:v1";
  const VALID_ZONES = new Set(["primary", "secondary", "trivia", "footer"]);
  const REGION_SCOPED_ZONES = new Set(["primary", "trivia", "footer"]);
  const DEVICE_SCOPED_ZONES = new Set(["secondary"]);

  function normalizeToken(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeRegion(value) {
    return normalizeToken(value);
  }

  function normalizeTenant(value) {
    return normalizeToken(value);
  }

  function normalizeDevice(value) {
    return normalizeToken(value);
  }

  function normalizeZone(value) {
    const zone = normalizeToken(value);
    return VALID_ZONES.has(zone) ? zone : "";
  }

  function readParams(sourceWindow) {
    try {
      const params = new URLSearchParams(sourceWindow.location.search || "");
      return {
        tenant: params.get("tenant") || params.get("customer") || params.get("tenant_id") || "",
        region: params.get("region") || "",
        device: params.get("device") || params.get("device_id") || params.get("deviceId") || ""
      };
    } catch {
      return { tenant: "", region: "", device: "" };
    }
  }

  function getIdentity() {
    const candidates = [window];

    try {
      if (window.top && window.top !== window) {
        candidates.push(window.top);
      }
    } catch {}

    try {
      if (window.parent && window.parent !== window && window.parent !== window.top) {
        candidates.push(window.parent);
      }
    } catch {}

    for (const candidate of candidates) {
      const raw = readParams(candidate);
      const tenant = normalizeTenant(raw.tenant);
      const region = normalizeRegion(raw.region);
      const device = normalizeDevice(raw.device);
      if (tenant || region || device) {
        return {
          tenant,
          region,
          device,
          hasIdentity: Boolean(tenant && region && device)
        };
      }
    }

    return {
      tenant: "",
      region: "",
      device: "",
      hasIdentity: false
    };
  }

  function buildRegionScope(zone, identity) {
    const safeZone = normalizeZone(zone);
    const safeIdentity = identity || getIdentity();
    if (!safeZone || !safeIdentity.tenant || !safeIdentity.region) return "";
    return `${VERSION_PREFIX}:tenant:${safeIdentity.tenant}:region:${safeIdentity.region}:zone:${safeZone}`;
  }

  function buildDeviceScope(zone, identity) {
    const safeZone = normalizeZone(zone);
    const safeIdentity = identity || getIdentity();
    if (!safeZone || !safeIdentity.tenant || !safeIdentity.region || !safeIdentity.device) return "";
    return `${VERSION_PREFIX}:tenant:${safeIdentity.tenant}:device:${safeIdentity.region}:${safeIdentity.device}:zone:${safeZone}`;
  }

  function buildSyncScope(zone, identity) {
    const safeZone = normalizeZone(zone);
    if (!safeZone) return "";
    if (DEVICE_SCOPED_ZONES.has(safeZone)) {
      return buildDeviceScope(safeZone, identity) || safeZone;
    }
    if (REGION_SCOPED_ZONES.has(safeZone)) {
      return buildRegionScope(safeZone, identity) || safeZone;
    }
    return safeZone;
  }

  function applyIdentityDataset(target, identity) {
    const el = target || document.documentElement;
    if (!el || !el.dataset) return;
    const safeIdentity = identity || getIdentity();
    el.dataset.bdnTenant = safeIdentity.tenant || "";
    el.dataset.bdnRegion = safeIdentity.region || "";
    el.dataset.bdnDevice = safeIdentity.device || "";
    el.dataset.bdnHasIdentity = safeIdentity.hasIdentity ? "true" : "false";
  }

  window.beaconIdentity = {
    normalizeTenant,
    normalizeRegion,
    normalizeDevice,
    normalizeZone,
    getIdentity,
    buildRegionScope,
    buildDeviceScope,
    buildSyncScope,
    applyIdentityDataset
  };
})();
