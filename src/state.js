import fs from "node:fs";

export const STATE_EXT = ".download";

function statePath(file) {
  return file + STATE_EXT;
}

/**
 * Build fresh segments for a size, or restore from an existing state file.
 * A state JSON looks like:
 * {
 *   url, size, segments: [{ start, end, done }], etag, lastModified
 * }
 */
export function loadOrCreate(file, meta, segments) {
  const sp = statePath(file);
  if (fs.existsSync(sp)) {
    try {
      const state = JSON.parse(fs.readFileSync(sp, "utf8"));
      if (state.size === meta.size && state.url === meta.url) return state;
      console.warn("state mismatch (server changed); restarting download");
    } catch {
      // corrupt state -> restart
    }
  }
  return {
    url: meta.url,
    size: meta.size,
    etag: meta.etag,
    lastModified: meta.lastModified,
    createdAt: Date.now(),
    segments,
  };
}

export function save(file, state) {
  const sp = statePath(file);
  const tmp = sp + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, sp);
}

export async function saveEvery(file, state, getPausedRef, intervalMs = 500) {
  const token = setInterval(() => {
    if (!getPausedRef()) save(file, state);
  }, intervalMs);
  token?.unref?.();
  return token;
}

/** Remaining bytes: sum of (end - (start + done) + 1) per segment. */
export function remainingBytes(state) {
  let remaining = 0;
  for (const s of state.segments) {
    if (s.start + s.done <= s.end) remaining += s.end - (s.start + s.done) + 1;
  }
  return remaining;
}
