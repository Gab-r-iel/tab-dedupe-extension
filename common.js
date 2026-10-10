(function initTabDedupeCore(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.TabDedupeCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createCore() {
  "use strict";

  const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    ignoreHash: true,
    preservePinned: true,
    ignoredPatterns: [],
    exemptOrigins: [],
    blockedCount: 0
  });

  function getDefaultSettings() {
    return {
      ...DEFAULT_SETTINGS,
      ignoredPatterns: [],
      exemptOrigins: []
    };
  }

  function withDefaults(value) {
    const source = value && typeof value === "object" ? value : {};

    return {
      enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_SETTINGS.enabled,
      ignoreHash:
        typeof source.ignoreHash === "boolean" ? source.ignoreHash : DEFAULT_SETTINGS.ignoreHash,
      preservePinned:
        typeof source.preservePinned === "boolean"
          ? source.preservePinned
          : DEFAULT_SETTINGS.preservePinned,
      ignoredPatterns: Array.isArray(source.ignoredPatterns)
        ? source.ignoredPatterns.map(String).map((item) => item.trim()).filter(Boolean)
        : [],
      exemptOrigins: Array.isArray(source.exemptOrigins)
        ? source.exemptOrigins.map(String).map((item) => item.trim()).filter(Boolean)
        : [],
      blockedCount:
        Number.isFinite(source.blockedCount) && source.blockedCount >= 0
          ? Math.floor(source.blockedCount)
          : 0
    };
  }

  function parseUrl(rawUrl) {
    try {
      return new URL(String(rawUrl || ""));
    } catch (_error) {
      return null;
    }
  }

  function canDedupeUrl(rawUrl) {
    const parsed = parseUrl(rawUrl);
    return Boolean(parsed && SUPPORTED_PROTOCOLS.has(parsed.protocol));
  }

  function normalizeUrl(rawUrl, ignoreHash = true) {
    const parsed = parseUrl(rawUrl);

    if (!parsed || !SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }

    if (ignoreHash) {
      parsed.hash = "";
    }

    if (parsed.hostname.endsWith(".")) {
      parsed.hostname = parsed.hostname.slice(0, -1);
    }

    return parsed.href;
  }

  function getOrigin(rawUrl) {
    const parsed = parseUrl(rawUrl);

    if (!parsed || !SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }

    return parsed.origin;
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function globToRegExp(pattern, anchored = true) {
    const source = pattern
      .split("*")
      .map(escapeRegExp)
      .join(".*");

    return `${anchored ? "^" : ""}${source}${anchored ? "$" : ""}`;
  }

  function patternMatches(rawUrl, rawPattern) {
    const url = String(rawUrl || "");
    const pattern = String(rawPattern || "").trim();

    if (!url || !pattern) {
      return false;
    }

    if (pattern.includes("://")) {
      try {
        return new RegExp(globToRegExp(pattern), "i").test(url);
      } catch (_error) {
        return false;
      }
    }

    const slashIndex = pattern.indexOf("/");
    const hostPart = slashIndex === -1 ? pattern : pattern.slice(0, slashIndex);
    const pathPart = slashIndex === -1 ? "" : pattern.slice(slashIndex);
    const host = hostPart.replace(/^\*\./, "").trim();

    if (!host) {
      return false;
    }

    const hostSource = `(?:[^/]+\\.)?${host.split(".").map(escapeRegExp).join("\\.")}`;
    const pathSource = pathPart
      ? globToRegExp(pathPart, false)
      : "(?::\\d+)?(?:[/?#]|$)";

    try {
      return new RegExp(`^https?://${hostSource}${pathSource}`, "i").test(url);
    } catch (_error) {
      return false;
    }
  }

  function isUrlIgnored(rawUrl, settings) {
    const resolved = withDefaults(settings);
    const origin = getOrigin(rawUrl);

    if (origin && resolved.exemptOrigins.includes(origin)) {
      return true;
    }

    return resolved.ignoredPatterns.some((pattern) => patternMatches(rawUrl, pattern));
  }

  function getComparableTabUrl(tab) {
    return tab && (tab.pendingUrl || tab.url);
  }

  function findOriginalTab(candidate, tabs, targetUrl, settings) {
    const resolved = withDefaults(settings);
    const normalizedTarget = normalizeUrl(targetUrl, resolved.ignoreHash);

    if (!candidate || !Number.isInteger(candidate.id) || !normalizedTarget) {
      return null;
    }

    return (Array.isArray(tabs) ? tabs : [])
      .filter((tab) => {
        if (!tab || tab.id === candidate.id || !Number.isInteger(tab.id)) {
          return false;
        }

        if (resolved.preservePinned && tab.pinned) {
          return false;
        }

        const tabUrl = getComparableTabUrl(tab);
        return normalizeUrl(tabUrl, resolved.ignoreHash) === normalizedTarget;
      })
      .sort((left, right) => left.id - right.id)[0] || null;
  }

  return {
    DEFAULT_SETTINGS,
    canDedupeUrl,
    findOriginalTab,
    getDefaultSettings,
    getOrigin,
    isUrlIgnored,
    normalizeUrl,
    patternMatches,
    withDefaults
  };
});
