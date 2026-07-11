(function () {
  function normalizeRelativePath(path) {
    return String(path || "")
      .trim()
      .replace(/^[./\\]+/, "")
      .replace(/\\/g, "/");
  }

  function getIdentity() {
    return window.beaconIdentity && typeof window.beaconIdentity.getIdentity === "function"
      ? window.beaconIdentity.getIdentity()
      : { region: "", device: "", hasIdentity: false };
  }

  function buildRegionPath(relativePath, identity) {
    const safePath = normalizeRelativePath(relativePath);
    const safeIdentity = identity || getIdentity();
    if (!safePath || !safeIdentity || !safeIdentity.region) return "";
    return `regions/${safeIdentity.region}/${safePath}`;
  }

  function buildLayeredPaths(relativePath, identity) {
    const safePath = normalizeRelativePath(relativePath);
    if (!safePath) return [];

    const candidates = [];
    const regionPath = buildRegionPath(safePath, identity);
    if (regionPath) {
      candidates.push(regionPath);
    }
    candidates.push(safePath);

    return Array.from(new Set(candidates));
  }

  async function fetchFirst(relativePath, init, identity) {
    const candidates = buildLayeredPaths(relativePath, identity);
    let lastError = null;

    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, init);
        if (response.ok) {
          return { path: candidate, response };
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) throw lastError;
    throw new Error(`Unable to load ${relativePath}`);
  }

  async function fetchFirstJson(relativePath, init, identity) {
    const { path, response } = await fetchFirst(relativePath, init, identity);
    return {
      path,
      response,
      json: await response.json()
    };
  }

  window.beaconContentPaths = {
    normalizeRelativePath,
    buildRegionPath,
    buildLayeredPaths,
    fetchFirst,
    fetchFirstJson
  };
})();
