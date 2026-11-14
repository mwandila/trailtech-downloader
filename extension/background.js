/**
 * Background service worker (MV3)
 * Based on IDM interception pattern:
 *  - webRequest monitoring for response headers (cookies, content-type, content-disposition)
 *  - context menus for "Download with DM"
 *  - WebSocket connection to localhost engine (ws://127.0.0.1:4991)
 *  - Origin validation (chrome-extension://...)
 */

const ENGINE_WS_URL = "ws://127.0.0.1:4991/";
const MIN_SIZE_INTERCEPT = 1024 * 1024; // 1MB minimum for interception
const RECONNECT_INTERVAL = 5000;

let ws = null;
let reconnectTimer = null;
let engineReady = false;
const pendingDownloads = new Map(); // url -> metadata
const requestHeadersById = new Map();
const downloadCache = new Map();

// Opcodes for messages (compact numeric style like IDM)
const OP = {
  MEDIA_ELEMENT: 41,
  LINK_CLICK: 32,
  CONTEXT_MENU: 33,
  RESPONSE_HEADER: 34
};

// ==================== WebSocket connection ====================
function connectEngine() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  try {
    ws = new WebSocket(ENGINE_WS_URL);
    
    ws.onopen = () => {
      console.log("[DM] Engine connected");
      engineReady = true;
      clearTimeout(reconnectTimer);
      // Send hello
      ws.send(JSON.stringify({ type: "ping" }));
      ws.send(JSON.stringify({ type: "list" }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleEngineMessage(msg);
      } catch (e) {
        console.error("[DM] Message parse error:", e);
      }
    };

    ws.onerror = (err) => {
      console.error("[DM] WebSocket error:", err);
      engineReady = false;
    };

    ws.onclose = () => {
      console.log("[DM] Engine disconnected, reconnecting...");
      engineReady = false;
      ws = null;
      reconnectTimer = setTimeout(connectEngine, RECONNECT_INTERVAL);
    };
  } catch (e) {
    console.error("[DM] Connection failed:", e);
    reconnectTimer = setTimeout(connectEngine, RECONNECT_INTERVAL);
  }
}

function handleEngineMessage(msg) {
  if (msg.type === "pong") {
    console.log("[DM] Engine alive");
  } else if (msg.type === "status") {
    downloadCache.set(msg.id, msg);
    // Update badge or notification
    updateDownloadStatus(msg);
    if (Number.isInteger(msg.tabId)) {
      chrome.tabs.sendMessage(msg.tabId, { type: "download-status", ...msg }, () => void chrome.runtime.lastError);
    }
    chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError);
  } else if (msg.type === "downloads") {
    downloadCache.clear();
    for (const task of msg.items || []) downloadCache.set(task.id, task);
    chrome.runtime.sendMessage({ type: "downloads-snapshot", items: [...downloadCache.values()] }, () => void chrome.runtime.lastError);
  } else if (msg.type === "ack") {
    console.log("[DM] Download queued:", msg.url);
    showNotification("Download Started", msg.url);
  }
}

function sendToEngine(data) {
  console.log("[DM] sendToEngine - engineReady:", engineReady, "ws.readyState:", ws?.readyState);
  
  if (!engineReady || !ws || ws.readyState !== WebSocket.OPEN) {
    console.warn("[DM] Engine not ready, cannot send:", data);
    console.log("[DM] Attempting to reconnect...");
    connectEngine();
    return false;
  }
  
  try {
    const json = JSON.stringify(data);
    console.log("[DM] Sending JSON to engine:", json);
    ws.send(json);
    console.log("[DM] Message sent successfully");
    return true;
  } catch (e) {
    console.error("[DM] Error sending to engine:", e);
    return false;
  }
}

// ==================== Download interception ====================
// Using webRequest API for automatic detection (MV3 compatible for reading headers)
if (chrome.webRequest && chrome.webRequest.onResponseStarted) {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      const headers = {};
      const forward = new Set(["cookie", "authorization", "referer", "accept", "accept-language", "user-agent"]);
      for (const header of details.requestHeaders || []) {
        if (forward.has(header.name.toLowerCase()) && typeof header.value === "string") {
          headers[header.name] = header.value;
        }
      }
      requestHeadersById.set(details.requestId, headers);
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders"]
  );

  chrome.webRequest.onResponseStarted.addListener(
    (details) => {
      if (details.method !== "GET" && details.method !== "HEAD") return;
      
      const headers = requestHeadersById.get(details.requestId) || {};
      requestHeadersById.delete(details.requestId);
      let contentLength = 0;
      let contentType = "";
      let disposition = "";

      for (const h of details.responseHeaders || []) {
        const name = h.name.toLowerCase();
        if (name === "content-length") {
          contentLength = parseInt(h.value, 10) || 0;
        } else if (name === "content-type") {
          contentType = h.value.toLowerCase();
        } else if (name === "content-disposition") {
          disposition = h.value;
        }
      }

      // Intercept if:
      // 1. Large file (> MIN_SIZE_INTERCEPT)
      // 2. Has attachment disposition
      // 3. Downloadable content-type or extension
      const isAttachment = disposition.includes("attachment");
      const isDownloadable = /\.(zip|rar|7z|exe|msi|dmg|pkg|deb|rpm|iso|tar|gz|bz2|xz|pdf|apk|ipa|mp4|mkv|avi|mov|wmv|flv|webm)$/i.test(details.url);
      const isBinary = /application\/(octet-stream|zip|x-|pdf)|video\/|audio\//.test(contentType);
      
      if (contentLength > MIN_SIZE_INTERCEPT || isAttachment || (isBinary && isDownloadable)) {
        console.log("[DM] Large download detected:", details.url, contentLength, contentType);
        
        pendingDownloads.set(details.url, {
          url: details.url,
          headers,
          size: contentLength,
          contentType,
          disposition,
          tabId: details.tabId,
          timestamp: Date.now()
        });

        // Send message to content script to show prompt
        chrome.tabs.sendMessage(details.tabId, {
          type: "download-candidate",
          url: details.url,
          size: contentLength,
          contentType
        }).catch(err => {
          // Tab may not have content script yet, that's ok
          console.log("[DM] Could not send message to tab:", err.message);
        });
      }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
  );
  setInterval(() => requestHeadersById.clear(), 60_000).unref?.();
} else {
  console.warn("[DM] webRequest API not available - automatic detection disabled");
}

// ==================== Chrome downloads API interception ====================
// Also intercept downloads started by the browser itself
if (chrome.downloads && chrome.downloads.onCreated) {
  chrome.downloads.onCreated.addListener((downloadItem) => {
    console.log("[DM] Browser download started:", downloadItem.url, downloadItem.fileSize);
    
    // Check if this is a large file we should intercept
    const shouldIntercept = downloadItem.fileSize > MIN_SIZE_INTERCEPT || 
                           downloadItem.fileSize === 0 || // Unknown size
                           /\.(zip|rar|7z|exe|msi|iso|tar|gz|mp4|mkv|avi)$/i.test(downloadItem.url);
    
    if (shouldIntercept && engineReady) {
      console.log("[DM] Intercepting browser download:", downloadItem.url);
      
      // Cancel the browser download
      chrome.downloads.cancel(downloadItem.id, () => {
        chrome.downloads.erase({ id: downloadItem.id }, () => {
          console.log("[DM] Cancelled browser download, sending to engine");
          
          // Send to our engine instead
          downloadWithEngine({
            url: downloadItem.url,
            headers: {},
            size: downloadItem.fileSize || 0,
            contentType: downloadItem.mime || ""
          });
          
          // Show notification
          showNotification("Download Intercepted", "Using multi-segment download manager");
        });
      });
    }
  });
} else {
  console.warn("[DM] downloads API not available");
}

// ==================== Content script messages ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get-downloads") {
    sendResponse({ items: [...downloadCache.values()] });
    sendToEngine({ type: "list" });
  } else if (["pause-download", "resume-download", "cancel-download"].includes(message.type)) {
    const type = message.type.replace("-download", "");
    sendResponse({ success: sendToEngine({ type, id: message.id }) });
  } else if (message.type === "retry-download") {
    const failed = downloadCache.get(message.id);
    if (!failed?.url) {
      sendResponse({ success: false, error: "Download details are no longer available" });
    } else {
      chrome.storage.local.get({ useChromeCookies: false }, (settings) => {
        const success = downloadWithEngine({
          url: failed.url,
          format: failed.format || "best",
          tabId: failed.tabId,
          useChromeCookies: settings.useChromeCookies === true
        });
        sendResponse({ success });
      });
    }
  } else if (message.type === "download-with-dm") {
    console.log("[DM] Download request from tab:", sender.tab?.id, message.url, message.format);
    try {
      const meta = pendingDownloads.get(message.url);
      const request = meta
        ? { ...meta, format: message.format, tabId: meta.tabId ?? sender.tab?.id, pageUrl: meta.pageUrl || message.pageUrl || sender.tab?.url || null }
        : { url: message.url, headers: {}, format: message.format, tabId: sender.tab?.id, pageUrl: message.pageUrl || sender.tab?.url || null };
      chrome.storage.local.get({ useChromeCookies: false }, (settings) => {
        const success = downloadWithEngine({ ...request, useChromeCookies: settings.useChromeCookies === true });
        if (meta) pendingDownloads.delete(message.url);
        sendResponse({ success, error: success ? null : "Download engine is offline" });
      });
    } catch (error) {
      console.error("[DM] Could not queue download:", error);
      sendResponse({ success: false, error: String(error?.message || error) });
    }
  } else if (message.type === "media-detected") {
    // Media element detected from content script
    console.log("[DM] Media detected:", message.url);
    pendingDownloads.set(message.url, {
      url: message.url,
      headers: {},
      contentType: message.contentType || "video/mp4",
      tabId: sender.tab?.id,
      pageUrl: message.pageUrl || sender.tab?.url || null,
      source: "media-element"
    });
  } else if (message.type === "ping-engine") {
    // Popup checking connection status
    sendResponse({ connected: engineReady });
  }
  return true; // Keep message channel open for async response
});

function downloadWithEngine(meta) {
  console.log("[DM] downloadWithEngine called with:", meta.url);
  
  const payload = {
    type: "add",
    url: meta.url,
    headers: sanitizeHeaders(meta.headers || {}),
    contentType: meta.contentType || "",
    format: meta.format || "best",
    tabId: meta.tabId,
    pageUrl: meta.pageUrl || null,
    useChromeCookies: meta.useChromeCookies === true
  };
  
  console.log("[DM] Sending to engine:", payload);
  
  if (sendToEngine(payload)) {
    console.log("[DM] Successfully sent to engine:", meta.url);
    showNotification("Download Started", "Using multi-segment download manager");
    return true;
  } else {
    console.error("[DM] Failed to send to engine:", meta.url);
    showNotification("Engine Offline", "Please start the download engine: node server.js");
    return false;
  }
}

function sanitizeHeaders(headers) {
  const skip = ["host", "connection", "upgrade", "origin", "sec-", "content-length", "content-encoding"];
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (skip.some(s => key.startsWith(s))) continue;
    out[k] = v;
  }
  return out;
}

// ==================== Context menu ====================
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "download-with-dm",
      title: "Download with TVD",
      contexts: ["link", "video", "audio", "image"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "download-with-dm") {
    const url = info.linkUrl || info.srcUrl;
    if (url) {
      chrome.storage.local.get({ useChromeCookies: false }, (settings) => {
        downloadWithEngine({ url, headers: {}, tabId: tab?.id, useChromeCookies: settings.useChromeCookies === true });
      });
    }
  }
});

// ==================== Notifications ====================
function showNotification(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message
  });
}

function updateDownloadStatus(status) {
  // Update badge with active download count or progress
  if (status.state === "active") {
    chrome.action.setBadgeText({ text: `${Math.round(status.pct)}%` });
    chrome.action.setBadgeBackgroundColor({ color: "#1EB980" }); // mint
  } else if (status.state === "done") {
    showNotification("Download Complete", status.file || status.url);
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
  } else if (status.state === "error") {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#EF4123" }); // flame
    showNotification("Download Failed", status.error || status.url);
  }
}

// ==================== Startup ====================
// Initialize connection when service worker starts
console.log("[DM] Service worker starting...");
console.log("[DM] Engine URL:", ENGINE_WS_URL);

connectEngine();

// Keep-alive ping every 15 seconds (like IDM)
setInterval(() => {
  if (engineReady && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "ping" }));
  } else if (!engineReady) {
    console.log("[DM] Engine not ready, reconnecting...");
    connectEngine();
  }
}, 15000);

// Service worker keep-alive (prevent Chrome from killing it)
chrome.runtime.onStartup.addListener(() => {
  console.log("[DM] Browser startup - connecting to engine");
  connectEngine();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[DM] Extension installed/updated");
  connectEngine();
});
