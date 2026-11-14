/**
 * Content script (injected at document_start, all_frames)
 * Based on IDM pattern:
 *  - Monitors DOM for media elements (video, audio, source)
 *  - Watches for download links
 *  - Injects document.js into main world for deeper access
 *  - Sends candidates to background via compact opcodes
 */

const OP = {
  MEDIA_ELEMENT: 41,
  LINK_CLICK: 32,
  INLINE_SCRIPT: 34
};

function sendExtensionMessage(message, callback) {
  try {
    if (!chrome.runtime?.id) return false;
    chrome.runtime.sendMessage(message, (response) => {
      try {
        const error = chrome.runtime.lastError?.message || "";
        callback?.(response, error);
      } catch {
        // Chrome may invalidate this content-script context during an update.
      }
    });
    return true;
  } catch (error) {
    try { callback?.(undefined, error?.message || "Extension context unavailable"); } catch { }
    return false;
  }
}

// ==================== Inject main-world script ====================
function injectMainWorld() {
  try {
    if (!chrome.runtime?.id) return;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("document.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  } catch {
    // An old content script can outlive an extension reload briefly.
  }
}

// Try injection immediately and on DOMContentLoaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectMainWorld);
} else {
  injectMainWorld();
}

// ==================== Media element observer ====================
const observedElements = new WeakSet();
let hiddenYouTubeOverlayUrl = "";

function checkMediaElement(el) {
  if (observedElements.has(el)) return;
  observedElements.add(el);

  const tagName = el.tagName.toLowerCase();
  let url = null;

  if (tagName === "video" || tagName === "audio") {
    url = el.src || el.currentSrc;
  } else if (tagName === "source" && el.parentElement) {
    url = el.src;
  }

  if (url && url.startsWith("http") && !url.includes("blob:")) {
    console.log("[DM] Media detected:", tagName, url);
    sendExtensionMessage({
      type: "media-detected",
      url,
      contentType: el.type || (tagName === "video" ? "video/mp4" : "audio/mpeg"),
      tag: tagName,
      pageUrl: location.href
    });
    // YouTube gets one control from ensureYouTubeOverlay() at the player level.
    // Adding the generic media-element control as well creates a duplicate.
    if ((tagName === "video" || tagName === "audio") && !isYouTubeVideoPage()) {
      attachDownloadControls(el.parentElement || document.body, url, "dm-media-overlay");
    }
  }
}

// Observe existing and new media elements
function scanMedia() {
  document.querySelectorAll("video, audio, source").forEach(checkMediaElement);
  ensureYouTubeOverlay();
}

const mediaObserver = new MutationObserver((mutations) => {
  for (const mut of mutations) {
    for (const node of mut.addedNodes) {
      if (node.nodeType === 1) {
        if (/^(video|audio|source)$/i.test(node.tagName)) {
          checkMediaElement(node);
        }
        node.querySelectorAll?.("video, audio, source").forEach(checkMediaElement);
      }
    }
  }
  ensureYouTubeOverlay();
});

if (document.body) {
  scanMedia();
  mediaObserver.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener("DOMContentLoaded", () => {
    scanMedia();
    mediaObserver.observe(document.body, { childList: true, subtree: true });
  });
}

// ==================== Link click monitoring ====================
document.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (!link || !link.href) return;

  const url = link.href;
  // Check if it's a download link
  const isDownload = link.download !== undefined || 
                    /\.(zip|rar|7z|exe|msi|dmg|pkg|iso|tar|gz|pdf|apk)$/i.test(url);
  
  if (isDownload) {
    console.log("[DM] Download link clicked:", url);
    // Could show overlay here offering to intercept
  }
}, true);

// ==================== Messages from main world ====================
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data && event.data.source === "dm-main-world") {
    // Forward to background
    sendExtensionMessage(event.data);
  }
});

// ==================== Messages from background ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "download-candidate") {
    showDownloadPrompt(message);
    sendResponse?.({ shown: true });
  } else if (message.type === "download-status") {
    updateDownloadOverlay(message);
  }
});

// ==================== Compact in-player download controls ====================
function showDownloadPrompt(data) {
  if (isYouTubeVideoPage()) {
    ensureYouTubeOverlay();
    return;
  }
  const player = document.querySelector("#movie_player") || document.querySelector("video")?.parentElement || document.body;
  attachDownloadControls(player, data.url, "dm-download-prompt", true);
}

function isYouTubeVideoPage() {
  const page = new URL(location.href);
  const host = page.hostname.toLowerCase().replace(/^www\./, "");
  return (host === "youtu.be" && page.pathname.length > 1) ||
    ((host === "youtube.com" || host.endsWith(".youtube.com")) &&
      ((page.pathname === "/watch" && page.searchParams.has("v")) || /^\/(shorts|live|embed)\/[^/]+/.test(page.pathname)));
}

function ensureYouTubeOverlay() {
  if (window.top !== window || !isYouTubeVideoPage()) {
    document.getElementById("dm-youtube-overlay")?.remove();
    return;
  }
  if (hiddenYouTubeOverlayUrl === location.href) return;
  if (hiddenYouTubeOverlayUrl) hiddenYouTubeOverlayUrl = "";
  const player = document.querySelector("#movie_player") || document.querySelector("video")?.parentElement;
  if (!player) return;
  attachDownloadControls(player, location.href, "dm-youtube-overlay");
}

function attachDownloadControls(host, url, id, fixed = false) {
  if (!host || !url) return;
  if (!document.getElementById("dm-progress-animation")) {
    const style = document.createElement("style");
    style.id = "dm-progress-animation";
    style.textContent = "@keyframes dmProgressPulse{from{opacity:.45}to{opacity:1}}";
    (document.head || document.documentElement).appendChild(style);
  }
  const existing = document.getElementById(id);
  if (existing?.dataset.url === url) return;
  existing?.remove();

  if (fixed) {
    host = document.body;
  } else if (getComputedStyle(host).position === "static") {
    host.style.position = "relative";
  }

  // Follow the site's theme system: dark ink by default, paper in light mode.
  const light = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  const THEME = light
    ? {
        surface: "#fffdf7", text: "#080d12", muted: "#51666f",
        line: "#ddd5c6", track: "#eae4d7", shadow: "0 8px 26px -12px rgba(80, 70, 40, .35), 0 1px 0 rgba(8,13,18,.05) inset",
      }
    : {
        surface: "linear-gradient(155deg, rgba(30, 47, 61, .97), rgba(14, 22, 30, .99))",
        text: "#ffffff", muted: "#93a6b4", line: "#23343f", track: "#1e2f3d",
        shadow: "0 8px 26px -10px rgba(0,0,0,.85), 0 1px 0 rgba(244,239,228,.07) inset",
      };

  const overlay = document.createElement("div");
  overlay.id = id;
  overlay.className = "dm-download-controls";
  overlay.dataset.url = url;
  overlay.style.cssText = `
    position: ${fixed ? "fixed" : "absolute"};
    ${fixed ? "top: 110px; right: 18px;" : "top: 12px; right: 12px;"}
    z-index: 2147483647; width: 220px; padding: 8px;
    border: 1px solid ${THEME.line}; border-radius: 7px;
    background: ${THEME.surface}; color: ${THEME.text};
    box-shadow: ${THEME.shadow};
    font: 12px/1.3 system-ui, sans-serif; box-sizing: border-box;
  `;

  const dragHandle = document.createElement("div");
  dragHandle.setAttribute("aria-label", "Hold and drag to move TVD controls");
  dragHandle.style.cssText = "position:absolute;top:0;left:0;right:0;height:7px;cursor:move;touch-action:none;user-select:none";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.title = "Hide download control";
  close.style.cssText = "width:18px;flex:none;border:0;background:transparent;color:" + THEME.muted + ";font:17px/14px system-ui;cursor:pointer;padding:0 2px";
  close.addEventListener("click", () => {
    if (id === "dm-youtube-overlay") hiddenYouTubeOverlayUrl = url;
    overlay.remove();
  });
  overlay.appendChild(dragHandle);
  if (!fixed) makeDraggable(overlay, dragHandle, host);

  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;gap:6px;align-items:center;margin-top:4px";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Video resolution or audio format");
  select.style.cssText = "min-width:0;flex:1;padding:6px 4px;border:1px solid " + THEME.line + ";border-radius:5px;background:" + (light ? "#fffdf7" : "#0e161e") + ";color:" + THEME.text + ";font:11px system-ui";
  for (const [value, text] of [["best", "Best"], ["1080p", "1080p"], ["720p", "720p"], ["480p", "480p"], ["360p", "360p"], ["audio-mp3", "MP3 audio"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  }
  const download = document.createElement("button");
  download.className = "dm-download-action";
  download.type = "button";
  download.textContent = "Download";
  download.style.cssText = "padding:6px 8px;border:0;border-radius:99px;background:#f0b429;color:#16110a;font:700 11px system-ui;cursor:pointer;box-shadow:0 6px 16px -6px rgba(240,180,41,.75)";
  download.addEventListener("click", () => {
    download.disabled = true;
    download.textContent = "Queued…";
    const waiting = setTimeout(() => {
      if (download.textContent === "Queued…") {
        download.disabled = false;
        download.textContent = "Retry";
        download.title = "No reply from TVD. Check that the engine is running, then retry.";
      }
    }, 7000);
    sendExtensionMessage({ type: "download-with-dm", url, format: select.value, pageUrl: location.href }, (response, runtimeError) => {
      clearTimeout(waiting);
      if (runtimeError || !response?.success) {
        download.disabled = false;
        download.textContent = "Retry";
        download.title = runtimeError || response?.error || "Could not connect to the download engine";
      } else {
        download.textContent = "Added";
        setTimeout(() => { download.disabled = false; download.textContent = "Download"; }, 2200);
      }
    });
  });
  controls.append(select, download, close);
  const status = document.createElement("div");
  status.className = "dm-download-status";
  status.textContent = "Ready";
  status.style.cssText = "display:none;margin-top:5px;color:" + THEME.muted + ";font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
  const track = document.createElement("div");
  track.className = "dm-download-progress";
  track.style.cssText = "display:none;height:4px;margin-top:4px;border-radius:3px;background:" + THEME.track + ";overflow:hidden";
  const fill = document.createElement("div");
  fill.className = "dm-download-progress-fill";
  fill.style.cssText = "height:100%;width:0;background:#f0b429;box-shadow:0 0 8px rgba(240,180,41,.55);transition:width .2s ease";
  track.appendChild(fill);
  overlay.append(controls, status, track);
  host.appendChild(overlay);
}

function makeDraggable(element, handle, container) {
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    startX = event.clientX;
    startY = event.clientY;
    startLeft = element.offsetLeft;
    startTop = element.offsetTop;
    element.style.left = `${startLeft}px`;
    element.style.top = `${startTop}px`;
    element.style.right = "auto";
    handle.setPointerCapture(event.pointerId);

    const move = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const maxLeft = Math.max(0, container.clientWidth - element.offsetWidth);
      const maxTop = Math.max(0, container.clientHeight - element.offsetHeight);
      const left = Math.min(maxLeft, Math.max(0, startLeft + moveEvent.clientX - startX));
      const top = Math.min(maxTop, Math.max(0, startTop + moveEvent.clientY - startY));
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    };
    const stop = (upEvent) => {
      if (upEvent.pointerId !== event.pointerId) return;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  });
}

function updateDownloadOverlay(message) {
  for (const overlay of document.querySelectorAll(".dm-download-controls")) {
    if (overlay.dataset.url !== message.url) continue;
    const status = overlay.querySelector(".dm-download-status");
    const track = overlay.querySelector(".dm-download-progress");
    const fill = overlay.querySelector(".dm-download-progress-fill");
    const button = overlay.querySelector(".dm-download-action");
    if (!status || !track || !fill || !button) continue;
    status.style.display = "block";
    track.style.display = "block";
    const phase = message.phase || message.state || "Downloading";
    const percent = Number.isFinite(message.pct) && message.pct >= 0 ? Math.max(0, Math.min(100, message.pct)) : null;
    const showSpeed = phase === "Downloading" && percent != null;
    status.textContent = `${phase}${percent == null ? "" : ` · ${percent.toFixed(1)}%`}${showSpeed ? ` · ${formatDownloadSpeed(message.speed || 0)}` : ""}`;
    fill.style.width = percent == null ? "18%" : `${percent}%`;
    fill.style.animation = percent == null && !["done", "error", "canceled"].includes(message.state) ? "dmProgressPulse 1s ease-in-out infinite alternate" : "none";

    if (message.state === "done") {
      button.textContent = "Done";
      button.disabled = true;
      fill.style.width = "100%";
      setTimeout(() => { button.disabled = false; button.textContent = "Download"; }, 3500);
    } else if (["error", "canceled", "paused"].includes(message.state)) {
      button.disabled = false;
      button.textContent = message.state === "error" ? "Retry" : "Download";
      button.title = message.error || "Download did not finish";
    } else {
      button.disabled = true;
      button.textContent = "Downloading";
    }
  }
}

function formatDownloadSpeed(bytesPerSecond) {
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytesPerSecond >= 1024) return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
  return `${Math.round(bytesPerSecond)} B/s`;
}

document.addEventListener("yt-navigate-finish", ensureYouTubeOverlay);
window.addEventListener("popstate", ensureYouTubeOverlay);
ensureYouTubeOverlay();
