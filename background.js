importScripts("common.js");

const {
  canDedupeUrl,
  findOriginalTab,
  getDefaultSettings,
  isUrlIgnored,
  withDefaults
} = TabDedupeCore;

const SETTINGS_KEY = "settings";
const processingTabs = new Set();

async function readSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return withDefaults(stored[SETTINGS_KEY]);
}

async function writeSettings(settings) {
  const resolved = withDefaults(settings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: resolved });
  return resolved;
}

async function ensureSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);

  if (!stored[SETTINGS_KEY]) {
    await writeSettings(getDefaultSettings());
  }
}

async function incrementBlockedCount() {
  const settings = await readSettings();
  settings.blockedCount += 1;
  await writeSettings(settings);
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });

  if (Number.isInteger(tab.windowId)) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
}

async function handleNavigation(tabId, rawUrl) {
  if (processingTabs.has(tabId) || !canDedupeUrl(rawUrl)) {
    return;
  }

  processingTabs.add(tabId);

  try {
    const settings = await readSettings();

    if (!settings.enabled || isUrlIgnored(rawUrl, settings)) {
      return;
    }

    let candidate;

    try {
      candidate = await chrome.tabs.get(tabId);
    } catch (_error) {
      return;
    }

    if (settings.preservePinned && candidate.pinned) {
      return;
    }

    const tabs = await chrome.tabs.query({});
    const original = findOriginalTab(candidate, tabs, rawUrl, settings);

    if (!original || !Number.isInteger(original.id)) {
      return;
    }

    await focusTab(original);
    await chrome.tabs.remove(tabId);
    await incrementBlockedCount();
  } catch (error) {
    console.warn("Tab 去重助手未能处理这次导航：", error);
  } finally {
    processingTabs.delete(tabId);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureSettings().catch((error) => {
    console.warn("Tab 去重助手初始化失败：", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  ensureSettings().catch((error) => {
    console.warn("Tab 去重助手启动检查失败：", error);
  });
});

function isActiveMainFrameNavigation(details) {
  return (
    details.frameId === 0 &&
    (!details.documentLifecycle || details.documentLifecycle === "active")
  );
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (!isActiveMainFrameNavigation(details)) {
    return;
  }

  handleNavigation(details.tabId, details.url);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (!isActiveMainFrameNavigation(details)) {
    return;
  }

  handleNavigation(details.tabId, details.url);
});
