/**
 * Main-world script (injected via web_accessible_resources)
 * Runs in the page's context to catch blob URLs, video objects,
 * and media players that the isolated content script cannot access.
 * Bridges back to content script via window.postMessage.
 */

(function() {
  "use strict";

  // Wrap XMLHttpRequest and fetch to catch media URLs
  const originalFetch = window.fetch;
  const originalXHR = window.XMLHttpRequest;

  // ==================== Fetch interception ====================
  window.fetch = function(...args) {
    const [resource] = args;
    const url = typeof resource === "string" ? resource : resource.url;
    
    if (url && /\.(mp4|webm|m3u8|mpd|m4a|mp3|wav)(\?|$)/i.test(url)) {
      console.log("[DM-Main] Fetch media:", url);
      window.postMessage({
        source: "dm-main-world",
        type: "media-detected",
        url,
        method: "fetch"
      }, "*");
    }
    
    return originalFetch.apply(this, args);
  };

  // ==================== XHR interception ====================
  const XHRProto = originalXHR.prototype;
  const originalOpen = XHRProto.open;
  const originalSend = XHRProto.send;

  XHRProto.open = function(method, url, ...rest) {
    this._dmUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XHRProto.send = function(...args) {
    if (this._dmUrl && /\.(mp4|webm|m3u8|mpd|m4a|mp3)(\?|$)/i.test(this._dmUrl)) {
      console.log("[DM-Main] XHR media:", this._dmUrl);
      window.postMessage({
        source: "dm-main-world",
        type: "media-detected",
        url: this._dmUrl,
        method: "xhr"
      }, "*");
    }
    return originalSend.apply(this, args);
  };

  // ==================== Video blob detection ====================
  const originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function(blob) {
    const url = originalCreateObjectURL.call(this, blob);
    if (blob instanceof Blob && blob.type.startsWith("video/")) {
      console.log("[DM-Main] Blob video created:", blob.type, blob.size);
      // Can't easily pass blob URLs to engine, but log for debugging
    }
    return url;
  };

  console.log("[DM-Main] Document script loaded");
})();
