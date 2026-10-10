"use strict";

const SETTINGS_KEY = "settings";

const {
  getDefaultSettings,
  getOrigin,
  withDefaults
} = TabDedupeCore;

const elements = {
  enabledToggle: document.querySelector("#enabledToggle"),
  statusText: document.querySelector("#statusText"),
  blockedCount: document.querySelector("#blockedCount"),
  currentSite: document.querySelector("#currentSite"),
  siteState: document.querySelector("#siteState"),
  siteHint: document.querySelector("#siteHint"),
  toggleSiteButton: document.querySelector("#toggleSiteButton"),
  openOptionsButton: document.querySelector("#openOptionsButton"),
  saveStatus: document.querySelector("#saveStatus")
};

let settings = getDefaultSettings();
let currentOrigin = null;
let saveStatusTimer = null;

function showSaveStatus(message, isError = false) {
  window.clearTimeout(saveStatusTimer);
  elements.saveStatus.textContent = message;
  elements.saveStatus.classList.toggle("is-error", isError);

  saveStatusTimer = window.setTimeout(() => {
    elements.saveStatus.textContent = "";
    elements.saveStatus.classList.remove("is-error");
  }, 1800);
}

async function saveSettings(nextSettings) {
  settings = withDefaults(nextSettings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

function renderGeneralState() {
  elements.enabledToggle.checked = settings.enabled;
  elements.statusText.textContent = settings.enabled ? "正在自动合并重复页" : "自动去重已暂停";
  elements.blockedCount.textContent = String(settings.blockedCount);
}

function renderSiteState() {
  const isSupported = Boolean(currentOrigin);
  const isExempt = isSupported && settings.exemptOrigins.includes(currentOrigin);

  elements.toggleSiteButton.disabled = !isSupported;
  elements.currentSite.textContent = isSupported
    ? new URL(currentOrigin).hostname
    : "此页面不适用";

  elements.siteState.textContent = !isSupported ? "不可用" : isExempt ? "已放行" : "去重中";
  elements.siteState.classList.toggle("is-exempt", isExempt);

  if (!isSupported) {
    elements.siteHint.textContent = "浏览器内部页面、扩展页和本地文件不会被处理。";
  } else if (isExempt) {
    elements.siteHint.textContent = "此网站可以同时打开多个相同页面。";
  } else {
    elements.siteHint.textContent = "重复页面会合并到最早打开的标签页。";
  }

  elements.toggleSiteButton.textContent = isExempt ? "恢复本站去重" : "在本站允许多开";
}

async function loadCurrentSite() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentOrigin = tabs[0] ? getOrigin(tabs[0].url) : null;
  renderSiteState();
}

async function init() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  settings = withDefaults(stored[SETTINGS_KEY]);

  renderGeneralState();
  await loadCurrentSite();
}

elements.enabledToggle.addEventListener("change", async () => {
  const previousValue = settings.enabled;
  settings.enabled = elements.enabledToggle.checked;
  renderGeneralState();

  try {
    await saveSettings(settings);
    showSaveStatus(settings.enabled ? "自动去重已开启" : "自动去重已暂停");
  } catch (error) {
    settings.enabled = previousValue;
    renderGeneralState();
    showSaveStatus("保存失败，请重试", true);
  }
});

elements.toggleSiteButton.addEventListener("click", async () => {
  if (!currentOrigin) {
    return;
  }

  const wasExempt = settings.exemptOrigins.includes(currentOrigin);
  const nextOrigins = wasExempt
    ? settings.exemptOrigins.filter((origin) => origin !== currentOrigin)
    : [...settings.exemptOrigins, currentOrigin];

  settings.exemptOrigins = nextOrigins;
  renderSiteState();

  try {
    await saveSettings(settings);
    showSaveStatus(wasExempt ? "已恢复本站去重" : "已允许本站多开");
  } catch (error) {
    settings.exemptOrigins = wasExempt
      ? [...settings.exemptOrigins, currentOrigin]
      : settings.exemptOrigins.filter((origin) => origin !== currentOrigin);
    renderSiteState();
    showSaveStatus("保存失败，请重试", true);
  }
});

elements.openOptionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SETTINGS_KEY]) {
    return;
  }

  settings = withDefaults(changes[SETTINGS_KEY].newValue);
  renderGeneralState();
  renderSiteState();
});

init().catch((error) => {
  console.error("Tab 去重助手弹窗初始化失败：", error);
  elements.statusText.textContent = "读取设置失败";
  elements.siteHint.textContent = "请重新打开扩展弹窗。";
});
