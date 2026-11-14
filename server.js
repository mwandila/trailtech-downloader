#!/usr/bin/env node
/**
 * Downloader engine server:
 *  - localhost WebSocket that the browser extension connects to
 *  - validates Origin (chrome-extension / moz-extension only)
 *  - accepts {"type":"add","url":...,"headers":{...}}
 *  - broadcasts {"type":"status", id, state, pct, speed, file, error}
 *  - CLI passthrough: node server.js <url> (like cli.js)
 */
import { WsServer } from "./src/ws.js";
import { download } from "./src/engine.js";
import { shouldUseYtDlp, downloadWithYtDlp, normalizeMediaFormat, isExtractorPage, isVideoContentType, hasAudioStream } from "./src/youtube.js";
import { getDownloadDirectory } from "./src/output.js";
import fs from "node:fs";

const PORT = Number(process.env.DOWNLOADER_PORT) || 4991;
const MAX_CONCURRENT = Math.min(8, Math.max(1, Number.parseInt(process.env.DOWNLOADER_MAX_CONCURRENT || "4", 10) || 4));

const tasks = new Map(); // id -> task
const queue = [];
let running = 0;
let ws;

function broadcast(task, fields = {}) {
  ws?.broadcast(
    {
      type: "status",
      id: task.id,
      url: task.url,
      file: task.file,
      state: task.state,
      pct: task.pct,
      speed: task.speed,
      phase: task.phase,
      tabId: task.tabId,
      format: task.format,
      error: task.error,
      ...fields,
    },
    { throttleGroup: "status", minInterval: 300 }
  );
}

function taskSummary(task) {
  return {
    id: task.id,
    url: task.url,
    file: task.file,
    state: task.state,
    pct: task.pct,
    speed: task.speed,
    phase: task.phase,
    tabId: task.tabId,
    error: task.error,
    format: task.format,
  };
}

function add(msg) {
  console.log("[Engine] add() called with URL:", msg.url);

  const requestedFormat = normalizeMediaFormat(msg.format);
  // Direct video URLs from extractor-backed pages (twitter, tiktok, facebook...)
  // are often VIDEO-ONLY adaptive streams; the page extractor returns muxed
  // video+audio, so prefer yt-dlp on the page URL in those cases.
  const fromExtractorPage = msg.pageUrl && isExtractorPage(msg.pageUrl) &&
    isVideoContentType(msg.contentType || "", msg.url);
  const useYtDlp = shouldUseYtDlp(msg.url, msg.contentType) || fromExtractorPage;
  const existing = [...tasks.values()].find((task) =>
    task.originalUrl === msg.url && task.format === requestedFormat &&
    ["queued", "active", "extracting"].includes(task.state)
  );
  if (existing) return existing.id;
  
  const task = {
    id: Date.now(),
    url: msg.url,
    originalUrl: msg.url,
    pageUrl: msg.pageUrl || null,
    contentType: msg.contentType || "",
    headers: sanitizeHeaders(msg.headers),
    file: null,
    state: "queued",
    pct: useYtDlp ? -1 : 0,
    speed: 0,
    error: null,
    phase: "Queued",
    tabId: Number.isInteger(msg.tabId) ? msg.tabId : null,
    controller: new AbortController(),
    useYtDlp,
    format: requestedFormat,
    useChromeCookies: msg.useChromeCookies === true,
  };
  
  tasks.set(task.id, task);
  broadcast(task);
  queue.push(task);
  pump();
  return task.id;
}

function pump() {
  while (running < MAX_CONCURRENT && queue.length) {
    running++;
    runTask(queue.shift());
  }
}

async function runTask(task) {
  task.state = "active";
  broadcast(task);
  console.log("[Engine] Starting download task:", task.id, task.url);
  
  try {
    // Video pages and adaptive streams must be downloaded and merged by yt-dlp.
    if (task.useYtDlp) {
      task.state = "extracting";
      task.pct = -1;
      task.phase = "Preparing video";
      broadcast(task);
      const result = await downloadWithYtDlp(task.originalUrl, {
        format: task.format,
        useChromeCookies: task.useChromeCookies,
        signal: task.controller.signal,
        onProgress: (p, speed) => {
          task.pct = p.pct;
          task.speed = speed;
          task.phase = p.phase || "Downloading";
          broadcast(task);
        },
      });
      task.file = result.file;
      task.pct = 100;
      task.state = "done";
      task.phase = "Complete";
      console.log("[Engine] yt-dlp download finished:", task.id, task.file);
    } else {
      const result = await download(task.url, {
        segments: 8,
        headers: task.headers,
        signal: task.controller.signal,
        onProgress: (p, speed) => {
          task.pct = p.pct;
          task.speed = speed;
          task.phase = "Downloading";
          broadcast(task);
        },
      });

      task.file = result.file;
      task.state = result.complete ? "done" : "paused";
      task.phase = task.state === "done" ? "Complete" : "Paused";
      if (task.state === "paused") {
        task.error = "some segments never finished; retry by adding the URL again";
      }

      // Silent-file safety net: direct downloads of adaptive streams can
      // yield video-only files. If the source page has a yt-dlp extractor,
      // re-fetch with muxed audio and replace the silent file.
      if (result.complete && task.pageUrl && isVideoContentType(task.contentType || "", task.file) &&
          !(await hasAudioStream(task.file))) {
        console.warn("[Engine] downloaded file has no audio stream; trying page extractor:", task.pageUrl);
        task.state = "extracting";
        task.phase = "Re-downloading with audio";
        task.pct = -1;
        broadcast(task);
        try {
          const retried = await downloadWithYtDlp(task.pageUrl, {
            format: task.format,
            useChromeCookies: task.useChromeCookies,
            signal: task.controller.signal,
            onProgress: (p, speed) => {
              task.pct = p.pct;
              task.speed = speed;
              task.phase = p.phase || "Downloading";
              broadcast(task);
            },
          });
          const silentFile = task.file;
          task.file = retried.file;
          task.pct = 100;
          task.state = "done";
          task.phase = "Complete (with audio)";
          fs.rm(silentFile, { force: true }, () => {});
          console.log("[Engine] replaced silent file via extractor:", task.file);
        } catch (retryErr) {
          task.state = "done";
          task.phase = "Complete";
          task.error = "File downloaded, but the source stream had no audio track and the page extractor could not provide one";
          console.warn("[Engine] extractor retry failed:", retryErr?.message || retryErr);
        }
      }
    }

    console.log("[Engine] Download finished:", task.id, task.state, task.file);
  } catch (err) {
    task.state = task.pauseRequested ? "paused" : task.controller.signal.aborted ? "canceled" : "error";
    task.phase = task.state === "paused" ? "Paused" : task.state === "canceled" ? "Canceled" : "Failed";
    task.error = ["paused", "canceled"].includes(task.state) ? null : String(err?.message || err);
    console.error("[Engine] Download error:", task.id, task.error);
  }
  
  broadcast(task);
  running--;
  pump();
}

function pauseTask(task) {
  if (["queued"].includes(task.state)) {
    const index = queue.indexOf(task);
    if (index >= 0) queue.splice(index, 1);
    task.state = "paused";
    task.phase = "Paused";
    broadcast(task);
  } else if (["active", "extracting"].includes(task.state)) {
    task.pauseRequested = true;
    task.phase = "Pausing";
    broadcast(task);
    task.controller.abort();
  }
}

function resumeTask(task) {
  if (task.state !== "paused") return;
  task.controller = new AbortController();
  task.pauseRequested = false;
  task.state = "queued";
  task.phase = "Queued to resume";
  task.error = null;
  queue.push(task);
  broadcast(task);
  pump();
}

function cancelTask(task) {
  if (["queued", "paused"].includes(task.state)) {
    const index = queue.indexOf(task);
    if (index >= 0) queue.splice(index, 1);
    task.state = "canceled";
    task.phase = "Canceled";
    broadcast(task);
  } else if (["active", "extracting"].includes(task.state)) {
    task.pauseRequested = false;
    task.controller.abort();
  }
}

// ---------- WS message handling ----------
function handleMessage(text) {
  console.log("[Engine] Received message:", text);
  
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    console.error("[Engine] Invalid JSON:", text);
    ws.broadcast({ type: "error", reason: "bad json" });
    return;
  }
  
  console.log("[Engine] Parsed message type:", msg.type);
  
  if (msg.type === "add") {
    if (!msg.url || !/^https?:\/\//i.test(msg.url)) {
      console.error("[Engine] Invalid URL:", msg.url);
      ws.broadcast({ type: "error", reason: "invalid url" });
      return;
    }
    console.log("[Engine] Adding download:", msg.url);
    const id = add(msg);
    ws.broadcast({ type: "ack", id, url: msg.url });
    console.log("[Engine] Download queued with ID:", id);
  } else if (msg.type === "cancel") {
    const t = tasks.get(msg.id);
    if (t) cancelTask(t);
  } else if (msg.type === "pause") {
    const t = tasks.get(msg.id);
    if (t) pauseTask(t);
  } else if (msg.type === "resume") {
    const t = tasks.get(msg.id);
    if (t) resumeTask(t);
  } else if (msg.type === "list") {
    ws.broadcast({ type: "downloads", items: [...tasks.values()].map(taskSummary) });
  } else if (msg.type === "ping") {
    console.log("[Engine] Ping received, sending pong");
    ws.broadcast({ type: "pong" });
  } else {
    console.log("[Engine] Unknown message type:", msg.type);
  }
}

function sanitizeHeaders(h) {
  if (!h || typeof h !== "object") return {};
  const skip = new Set([
    "host", "connection", "upgrade", "sec-websocket-key", "sec-websocket-version",
    "sec-websocket-extensions", "sec-framing", "origin", "user-agent",
  ]);
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    if (skip.has(String(k).toLowerCase())) continue;
    if (typeof v === "string" && v.length < 8192) out[k] = v;
  }
  return out;
}

// cleanup finished tasks after 15 min so history doesn't grow forever
setInterval(() => {
  for (const [id, t] of tasks) {
    if (["done", "error", "canceled", "paused"].includes(t.state) && Date.now() - id > 15 * 60_000) {
      tasks.delete(id);
    }
  }
}, 60_000);

// ---------- main ----------
main().catch((e) => {
  console.error("server failed:", e);
  process.exit(1);
});

async function main() {
  console.log("[Engine] Starting download engine...");
  fs.mkdirSync(getDownloadDirectory(), { recursive: true });
  console.log("[Engine] Downloads folder:", getDownloadDirectory());
  console.log("[Engine] Concurrent download jobs:", MAX_CONCURRENT);
  
  ws = new WsServer({
    port: PORT,
    onMessage: (text) => handleMessage(text),
    log: (m) => console.log("[WS]", m),
  });

  const cliUrl = process.argv.slice(2).find((a) => !a.startsWith("-") && /^https?:/i.test(a));
  if (cliUrl) {
    console.log("[Engine] CLI download requested:", cliUrl);
    add({ url: cliUrl });
  }

  console.log("[Engine] Downloader engine ready - Ctrl+C to stop.");
  process.on("SIGINT", () => shutdown());
  process.on("SIGTERM", () => shutdown());
}

function shutdown() {
  console.log("\nstopping engine...");
  for (const t of tasks.values()) t.controller.abort();
  ws?.close();
  process.exit(0);
}
