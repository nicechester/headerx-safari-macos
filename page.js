// MAIN-world interceptor: Safari's declarativeNetRequest rejects custom
// header names (WebKit bug 290922), so page-initiated fetch/XHR requests get
// their headers added here instead. Loaded two ways: via the manifest
// content_scripts entry with world MAIN, and (if Safari ignores that key)
// injected as a <script> element by content.js — the guard below keeps a
// double load harmless.
(() => {
  if (window.__headerxPatched) return;
  window.__headerxPatched = true;

  let injectHeaders = [];

  window.addEventListener("message", (event) => {
    if (
      event.source === window &&
      event.data &&
      event.data.type === "HEADERX_CONFIG" &&
      Array.isArray(event.data.headers)
    ) {
      injectHeaders = event.data.headers;
      console.log(`[HeaderX] page patch received ${injectHeaders.length} header(s)`);
    }
  });

  // --- fetch ---
  const originalFetch = window.fetch;
  window.fetch = function (resource, options) {
    if (injectHeaders.length === 0) {
      return originalFetch.call(this, resource, options);
    }
    try {
      // Normalizing through a Request merges init options with a Request
      // resource, so the page's own headers are preserved either way
      const request = new Request(resource, options);
      injectHeaders.forEach(h => request.headers.set(h.name, h.value));
      return originalFetch.call(this, request);
    } catch (err) {
      return originalFetch.call(this, resource, options);
    }
  };

  // --- XMLHttpRequest ---
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (...args) {
    this._headerxInject = true;
    return originalOpen.apply(this, args);
  };

  // Inject in send(), after the page's own setRequestHeader calls
  XMLHttpRequest.prototype.send = function (...args) {
    if (this._headerxInject) {
      this._headerxInject = false;
      injectHeaders.forEach(h => {
        try {
          this.setRequestHeader(h.name, h.value);
        } catch (err) {
          // invalid state or forbidden header — leave the request as-is
        }
      });
    }
    return originalSend.apply(this, args);
  };

  console.log("[HeaderX] page patch installed");
  // Tell content.js we're alive so it (re)sends the config — this also
  // closes the startup race where config is posted before our listener exists
  window.postMessage({ type: "HEADERX_PAGE_READY" }, "*");
})();
