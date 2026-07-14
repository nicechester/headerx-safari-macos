// Isolated-world bridge: reads the extension config and forwards it to page.js
(() => {
  let pageReady = false;

  async function pushConfig() {
    try {
      const { headers = [], enabled = false } = await browser.storage.local.get([
        "headers",
        "enabled"
      ]);
      const active = enabled ? headers.filter(h => h.enabled !== false) : [];
      window.postMessage({ type: "HEADERX_CONFIG", headers: active }, "*");
    } catch (err) {
      console.error("[HeaderX] content bridge storage access error:", err);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source === window && event.data && event.data.type === "HEADERX_PAGE_READY") {
      pageReady = true;
      console.log("[HeaderX] bridge: page patch is alive, sending config");
      pushConfig();
    }
  });

  pushConfig();

  setTimeout(() => {
    if (pageReady) return;
    console.warn("[HeaderX] bridge: no page patch detected, injecting script element fallback");
    const script = document.createElement("script");
    script.src = browser.runtime.getURL("page.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }, 300);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && ("headers" in changes || "enabled" in changes)) {
      pushConfig();
    }
  });
})();