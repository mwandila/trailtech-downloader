import fs from "node:fs";
import path from "node:path";

/**
 * Probe a URL with HEAD (falling back to GET with tiny range) to learn
 * total size, range support, and a filename.
 */
export async function probe(url, { headers = {}, signal } = {}) {
  let res;
  try {
    res = await fetch(url, { method: "HEAD", headers, redirect: "follow", signal });
  } catch (error) {
    if (signal?.aborted) throw error;
  }

  let size = Number(res?.headers.get("content-length"));
  let acceptRanges = (res?.headers.get("accept-ranges") || "").includes("bytes");
  let finalRes = res;

  // Some servers reject HEAD or lie about range support. Confirm with a
  // one-byte request and cancel its body so probing never downloads the file.
  if (!res?.ok || !Number.isFinite(size) || size <= 0 || acceptRanges) {
    const rangeRes = await fetch(url, {
      headers: { ...headers, Range: "bytes=0-0" },
      redirect: "follow",
      signal,
    });
    if (!rangeRes.ok && rangeRes.status !== 206) {
      await rangeRes.body?.cancel().catch(() => {});
      throw new Error(`Probe failed: HTTP ${rangeRes.status} ${rangeRes.statusText}`);
    }
    finalRes = rangeRes;
    const contentRange = rangeRes.headers.get("content-range") || "";
    const match = contentRange.match(/^bytes \d+-\d+\/(\d+)$/i);
    if (rangeRes.status === 206 && match) {
      size = Number(match[1]);
      acceptRanges = true;
    } else {
      acceptRanges = false;
      const fallbackSize = Number(rangeRes.headers.get("content-length"));
      if (fallbackSize > 0) size = fallbackSize;
    }
    await rangeRes.body?.cancel().catch(() => {});
  }

  if (!finalRes?.ok) {
    throw new Error(`Probe failed: HTTP ${finalRes?.status} ${finalRes?.statusText || ""}`);
  }

  const disposition = finalRes.headers.get("content-disposition") || "";
  let filename = "";
  const m =
    disposition.match(/filename\*=(?:UTF-8|utf-8)''([^;]+)/i) ||
    disposition.match(/filename="?([^";]+)"?/i);
  if (m) {
    filename = decodeURIComponent(m[1].trim());
    if (/^utf-?8/i.test(filename) === false && /^''/.test(filename.trim())) {
      filename = filename.replace(/^''/, "");
    }
  }
  if (!filename) {
    let base = (finalRes.url || url).split(/[?#]/)[0].split("/").pop() || "download";
    try {
      base = decodeURIComponent(base);
    } catch {}
    filename = base || "download";
  }

  const type = finalRes.headers.get("content-type") || "";
  if (!path.extname(filename) && type && type.startsWith("*") === false) {
    // Leave extension handling simple; keep the URL-derived name.
  }

  return {
    url: finalRes.url || url,
    size: Number.isFinite(size) ? size : 0,
    acceptRanges,
    filename,
    type,
    etag: finalRes.headers.get("etag") || "",
    lastModified: finalRes.headers.get("last-modified") || "",
  };
}

/** Reserve the target file at full size (sparse). */
export function reserveFile(file, size) {
  if (fs.existsSync(file) && fs.statSync(file).size === size) return;
  if (fs.existsSync(file)) fs.truncateSync(file, size);
  else {
    const fd = fs.openSync(file, "w");
    fs.truncateSync(fd, size);
    fs.closeSync(fd);
  }
}
