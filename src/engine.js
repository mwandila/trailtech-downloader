import fs from "node:fs";
import path from "node:path";
import { probe, reserveFile } from "./probe.js";
import { loadOrCreate, save, remainingBytes } from "./state.js";
import { outputPath } from "./output.js";

/**
 * IDM-style engine:
 *  - probe size + range support
 *  - split into N byte ranges
 *  - download each segment with its own ranged HTTP connection
 *  - retry with backoff, resume from saved state
 *  - write all segments into ONE sparse preallocated file at their offsets
 */
export async function download(url, { file, segments = 8, headers = {}, signal, onProgress } = {}) {
  const isAbort = (e) => /abort/.test(String(e?.name || "")) || signal?.aborted;
  const meta = await probe(url, { headers, signal });
  file = file || outputPath(meta.filename);
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

  const canRange = meta.acceptRanges && meta.size > 32 * 1024;
  const segCount = canRange ? clamp(segments, 1, 32) : 1;

  let state;
  if (canRange) {
    const fresh = splitSegments(meta.size, segCount);
    state = loadOrCreate(file, meta, fresh);
    reserveFile(file, meta.size);
  } else {
    // single stream, no offset math
    state = loadOrCreate(file, meta, [{ start: 0, end: Math.max(0, meta.size - 1), done: 0 }]);
    reserveFile(file, Math.max(meta.size, 1));
  }

  const speedWindow = { t: Date.now(), bytes: 0, speed: 0, count: 0, lastByte: 0 };
  const fd = fs.openSync(file, "r+");

  const worker = async (seg, idx) => {
    let tries = 0;
    while (seg.start + seg.done <= seg.end && !signal?.aborted) {
      const offset = seg.start + seg.done;
      const range = canRange ? `bytes=${offset}-${seg.end}` : null;

      try {
        const res = await fetch(state.url, {
          headers: range ? { ...headers, Range: range } : headers,
          redirect: "follow",
          signal,
        });
        if (canRange && res.status !== 206) {
          throw new Error(`Server stopped honoring byte ranges (HTTP ${res.status})`);
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        if (!res.body) throw new Error("empty body");

        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          let written = 0;
          while (written < value.byteLength) {
            written += fs.writeSync(fd, value, written, value.byteLength - written, offset + seg.done + written);
          }
          seg.done += value.byteLength;
          speedWindow.bytes += value.byteLength;
          if (++speedWindow.count % 40 === 0) tick(speedWindow);
          onProgress && onProgress(progressOf(state), speedWindow.speed);
        }
      } catch (err) {
        if (isAbort(err)) throw err;
        tries++;
        if (tries > 20) {
          err.message = `segment ${idx}: ${err.message} (giving up)`;
          throw err;
        }
        await sleep(Math.min(1000 * 2 ** tries, 15000));
      }
    }
    seg.done = seg.end - seg.start + 1;
  };

  // Run all segment workers concurrently, but save state periodically.
  const saveTimer = setInterval(() => save(file, state), 800);
  saveTimer.unref?.();

  try {
    await Promise.all(state.segments.map((s, i) => worker(s, i)));
  } finally {
    save(file, state);
    fs.closeSync(fd);
    clearInterval(saveTimer);
  }

  const complete = remainingBytes(state) === 0;
  // single-stream no-size downloads: finish when file finished; no trim needed
  if (complete) {
    fs.unlinkSync(file + ".download");
    return { file, size: meta.size, complete: true };
  }
  return { file, size: meta.size, complete: false };
}

function progressOf(state) {
  if (!state.size) return { pct: -1, done: null };
  let done = 0;
  for (const s of state.segments) done += s.done;
  const total = state.segments.reduce((a, s) => a + (s.end - s.start + 1), 0);
  return { pct: total ? (done / total) * 100 : 0, done, total };
}

function splitSegments(size, n) {
  const size1 = Math.ceil(size / n);
  const out = [];
  for (let start = 0; start < size; start += size1) {
    out.push({ start, end: Math.min(start + size1 - 1, size - 1), done: 0 });
  }
  return out;
}

function tick(w) {
  const now = Date.now();
  const dt = (now - w.t) / 1000;
  if (dt >= 0.2) {
    w.speed = (w.bytes - (w.lastByte ?? 0)) / dt;
    w.t = now;
    w.lastByte = w.bytes;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
