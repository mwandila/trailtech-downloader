const statusEl = document.getElementById("status");
const downloadsList = document.getElementById("downloads-list");
const chromeCookiesSetting = document.getElementById("chrome-cookies");
const downloads = new Map();

chrome.storage.local.get({ useChromeCookies: false }, (settings) => {
  chromeCookiesSetting.checked = settings.useChromeCookies === true;
});
chromeCookiesSetting.addEventListener("change", () => {
  chrome.storage.local.set({ useChromeCookies: chromeCookiesSetting.checked });
});

function updateStatus(connected) {
  statusEl.textContent = connected ? "Engine Connected" : "Engine Offline";
  statusEl.className = `status ${connected ? "connected" : "disconnected"}`;
}

function renderDownloads() {
  downloadsList.replaceChildren();
  if (downloads.size === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No downloads yet";
    downloadsList.appendChild(empty);
    return;
  }

  const recent = [...downloads.values()].sort((a, b) => b.id - a.id);
  for (const dl of recent) {
    const item = document.createElement("div");
    item.className = "download-item";
    const info = document.createElement("div");
    info.className = "download-info";
    const name = document.createElement("div");
    name.className = "download-url";
    name.title = dl.file || dl.url || "";
    name.textContent = downloadName(dl);
    const progress = document.createElement("div");
    progress.className = "download-progress";
    const pct = Number.isFinite(dl.pct) && dl.pct >= 0 ? ` · ${dl.pct.toFixed(1)}%` : "";
    const showSpeed = dl.phase === "Downloading" && Number.isFinite(dl.pct) && dl.pct >= 0;
    const speed = showSpeed ? ` · ${formatSpeed(dl.speed || 0)}` : "";
    progress.textContent = `${dl.phase || dl.state}${pct}${speed}${dl.error ? ` · ${dl.error}` : ""}`;
    info.append(name, progress);

    const hasProgress = ["queued", "active", "extracting", "paused"].includes(dl.state);
    if (hasProgress) {
      const bar = document.createElement("div");
      bar.className = "progress-bar";
      const fill = document.createElement("div");
      fill.className = "progress-fill";
      const width = Number.isFinite(dl.pct) && dl.pct >= 0 ? Math.max(0, Math.min(100, dl.pct)) : 18;
      fill.style.width = `${width}%`;
      if (dl.state === "queued" || dl.state === "extracting" && dl.pct < 0) fill.classList.add("indeterminate");
      bar.appendChild(fill);
      info.appendChild(bar);
    }
    item.appendChild(info);

    if (["queued", "active", "extracting", "paused"].includes(dl.state)) {
      const actions = document.createElement("div");
      actions.className = "download-actions";
      if (dl.state === "paused") actions.appendChild(actionButton("Resume", "resume-download", dl.id));
      else actions.appendChild(actionButton(dl.phase === "Pausing" ? "Pausing…" : "Pause", "pause-download", dl.id, dl.phase === "Pausing"));
      actions.appendChild(actionButton("Cancel", "cancel-download", dl.id));
      item.appendChild(actions);
    } else if (dl.state === "error") {
      const actions = document.createElement("div");
      actions.className = "download-actions";
      actions.appendChild(actionButton("Retry", "retry-download", dl.id));
      item.appendChild(actions);
    }
    downloadsList.appendChild(item);
  }
}

function actionButton(label, type, id, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "download-action-button";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", () => {
    button.disabled = true;
    chrome.runtime.sendMessage({ type, id }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        button.disabled = false;
        button.title = chrome.runtime.lastError?.message || "Engine is offline";
      } else if (type === "retry-download") {
        button.textContent = "Queued";
      }
    });
  });
  return button;
}

function downloadName(download) {
  if (download.file) return download.file.split(/[\\/]/).pop();
  try {
    const url = new URL(download.url);
    if (/youtube|youtu\.be/.test(url.hostname)) return "YouTube video";
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "Video download");
  } catch {
    return "Download";
  }
}

function formatSpeed(bytesPerSec) {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

function mergeSnapshot(items, replace = false) {
  if (replace) downloads.clear();
  for (const item of items || []) downloads.set(item.id, item);
  renderDownloads();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "status") {
    downloads.set(message.id, message);
    renderDownloads();
  } else if (message.type === "downloads-snapshot") {
    mergeSnapshot(message.items, true);
  }
});

function checkEngineStatus() {
  chrome.runtime.sendMessage({ type: "ping-engine" }, (response) => {
    if (chrome.runtime.lastError) return updateStatus(false);
    updateStatus(Boolean(response?.connected));
  });
}

statusEl.textContent = "Checking…";
chrome.runtime.sendMessage({ type: "get-downloads" }, (response) => mergeSnapshot(response?.items));
checkEngineStatus();
setInterval(checkEngineStatus, 3000);
renderDownloads();
