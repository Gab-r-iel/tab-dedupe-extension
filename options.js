"use strict";

const SETTINGS_KEY = "settings";

const {
  getDefaultSettings,
  withDefaults
} = TabDedupeCore;

const elements = {
  form: document.querySelector("#settingsForm"),
  enabledToggle: document.querySelector("#enabledToggle"),
  ignoreHashToggle: document.querySelector("#ignoreHashToggle"),
  preservePinnedToggle: document.querySelector("#preservePinnedToggle"),
  ignoredPatterns: document.querySelector("#ignoredPatterns"),
  siteExceptions: document.querySelector("#siteExceptions"),
  blockedCount: document.querySelector("#blockedCount"),
  resetCountButton: document.querySelector("#resetCountButton"),
  saveStatus: document.querySelector("#saveStatus")
};

let settings = getDefaultSettings();
let saveStatusTimer = null;

function showSaveStatus(message, isError = false) {
  window.clearTimeout(saveStatusTimer);
  elements.saveStatus.textContent = message;
  elements.saveStatus.classList.toggle("is-error", isError);

  saveStatusTimer = window.setTimeout(() => {
    elements.saveStatus.textContent = "";
    elements.saveStatus.classList.remove("is-error");
  }, 2200);
}

function formatCount(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function renderSiteExceptions() {
  elements.siteExceptions.replaceChildren();

  if (settings.exemptOrigins.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "暂无放行网站，可在弹窗中为当前网站快速添加。";
    elements.siteExceptions.append(empty);
    return;
  }

  for (const origin of settings.exemptOrigins) {
    const row = document.createElement("div");
    row.className = "exception-row";

    const hostname = document.createElement("span");
    hostname.textContent = origin.replace(/^https?:\/\//, "");

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "text-button danger-text";
    removeButton.dataset.origin = origin;
    removeButton.textContent = "移除";

    row.append(hostname, removeButton);
    elements.siteExceptions.append(row);
  }
}

function render() {
  elements.enabledToggle.checked = settings.enabled;
  elements.ignoreHashToggle.checked = settings.ignoreHash;
  elements.preservePinnedToggle.checked = settings.preservePinned;
  elements.ignoredPatterns.value = settings.ignoredPatterns.join("\n");
  elements.blockedCount.textContent = formatCount(settings.blockedCount);
  renderSiteExceptions();
}

function collectFormSettings() {
  const ignoredPatterns = elements.ignoredPatterns.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return withDefaults({
    ...settings,
    enabled: elements.enabledToggle.checked,
    ignoreHash: elements.ignoreHashToggle.checked,
    preservePinned: elements.preservePinnedToggle.checked,
    ignoredPatterns
  });
}

async function save(nextSettings) {
  settings = withDefaults(nextSettings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  render();
}

async function init() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  settings = withDefaults(stored[SETTINGS_KEY]);
  render();
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await save(collectFormSettings());
    showSaveStatus("设置已保存");
  } catch (error) {
    console.error("保存设置失败：", error);
    showSaveStatus("保存失败，请重试", true);
  }
});

elements.siteExceptions.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-origin]");

  if (!button) {
    return;
  }

  settings.exemptOrigins = settings.exemptOrigins.filter(
    (origin) => origin !== button.dataset.origin
  );

  try {
    await save(settings);
    showSaveStatus("已从放行名单移除");
  } catch (error) {
    showSaveStatus("保存失败，请重试", true);
  }
});

elements.resetCountButton.addEventListener("click", async () => {
  try {
    await save({ ...settings, blockedCount: 0 });
    showSaveStatus("统计已清零");
  } catch (error) {
    showSaveStatus("清零失败，请重试", true);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SETTINGS_KEY]) {
    return;
  }

  settings = withDefaults(changes[SETTINGS_KEY].newValue);
  render();
});

init().catch((error) => {
  console.error("设置页初始化失败：", error);
  showSaveStatus("读取设置失败，请刷新页面", true);
});
