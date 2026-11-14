import os from "node:os";
import path from "node:path";

/** Use the conventional user Downloads folder unless the engine is configured otherwise. */
export function getDownloadDirectory() {
  return path.resolve(process.env.DOWNLOADER_DIR || path.join(os.homedir(), "Downloads"));
}

export function safeFilename(value) {
  const leaf = path.basename(String(value || "download"));
  return leaf.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "") || "download";
}

export function outputPath(filename) {
  return path.join(getDownloadDirectory(), safeFilename(filename));
}
