const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findOriginalTab,
  getDefaultSettings,
  isUrlIgnored,
  normalizeUrl,
  patternMatches,
  withDefaults
} = require("../common.js");

test("normalizes supported URLs and optionally removes hash fragments", () => {
  assert.equal(
    normalizeUrl("https://Example.com/path?q=1#section"),
    "https://example.com/path?q=1"
  );
  assert.equal(
    normalizeUrl("https://example.com/path#section", false),
    "https://example.com/path#section"
  );
  assert.equal(normalizeUrl("chrome://extensions"), null);
  assert.equal(normalizeUrl("not a url"), null);
});

test("keeps query strings distinct", () => {
  assert.notEqual(
    normalizeUrl("https://example.com/search?q=one"),
    normalizeUrl("https://example.com/search?q=two")
  );
});

test("withDefaults produces independent list values", () => {
  const first = withDefaults({});
  const second = withDefaults({});

  first.ignoredPatterns.push("example.com");
  first.exemptOrigins.push("https://example.com");

  assert.deepEqual(second.ignoredPatterns, []);
  assert.deepEqual(second.exemptOrigins, []);
  assert.deepEqual(getDefaultSettings().ignoredPatterns, []);
});

test("matches domains, subdomains, paths, and wildcard patterns", () => {
  assert.equal(patternMatches("https://example.com/page", "example.com"), true);
  assert.equal(patternMatches("https://www.example.com/page", "example.com"), true);
  assert.equal(patternMatches("https://example.com/docs/start", "example.com/docs*"), true);
  assert.equal(patternMatches("https://example.com/other", "example.com/docs*"), false);
  assert.equal(patternMatches("https://cdn.example.com/a.js", "*://*.example.com/*"), true);
  assert.equal(patternMatches("https://different.com/page", "example.com"), false);
});

test("honors site exceptions and ignored patterns", () => {
  const settings = {
    ignoredPatterns: ["news.example.com"],
    exemptOrigins: ["https://example.com"]
  };

  assert.equal(isUrlIgnored("https://news.example.com/article", settings), true);
  assert.equal(isUrlIgnored("https://example.com/page", settings), true);
  assert.equal(isUrlIgnored("https://other.com/page", settings), false);
});

test("selects the oldest matching tab and skips pinned tabs by default", () => {
  const candidate = { id: 30, pinned: false };
  const tabs = [
    { id: 30, url: "https://example.com/page" },
    { id: 12, url: "https://example.com/page", pinned: true },
    { id: 18, url: "https://example.com/page" },
    { id: 22, url: "https://example.com/other" }
  ];

  assert.equal(
    findOriginalTab(candidate, tabs, "https://example.com/page", {}).id,
    18
  );

  assert.equal(
    findOriginalTab(
      candidate,
      tabs,
      "https://example.com/page",
      { preservePinned: false }
    ).id,
    12
  );
});

test("uses pendingUrl when a matching tab is still navigating", () => {
  const candidate = { id: 20, pinned: false };
  const tabs = [
    { id: 20, url: "https://example.com/loading" },
    { id: 8, url: "chrome://newtab/", pendingUrl: "https://example.com/loading" }
  ];

  assert.equal(
    findOriginalTab(candidate, tabs, "https://example.com/loading", {}).id,
    8
  );
});
