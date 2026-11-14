#!/usr/bin/env node
import fs from "node:fs";
import { download } from "./src/engine.js";
import { downloadWithYtDlp, normalizeMediaFormat, shouldUseYtDlp } from "./src/youtube.js";

const [url, ...flags] = process.argv.slice(2);
const help = () => {
  console.log(`Usage:
  node cli.js <url> [-o file] [-s segments] [-f format]

Options:
  -o <file>     output file (default: from URL/Content-Disposition)
  -s <count>    parallel segments, 1-32 (default 8)
  -f <format>   best, 1080p, 720p, 480p, 360p, or audio-mp3 (yt-dlp URLs)
Resume: re-running the same command continues an interrupted download
(the <file>.download state file is used automatically).`);
  process.exit(1);
};

if (!url || url.startsWith("-")) help();

const get = (flag) => {
  const i = flags.indexOf(flag);
  return i >= 0 && flags[i + 1] ? flags[i + 1] : undefined;
};
const file = get("-o");
const segs = Number(get("-s")) || 8;
const format = normalizeMediaFormat(get("-f"));

try {
  const render = (p, speed) => {
    const spd = speed ? fmtBytes(speed) + "/s" : "";
    const bar =
      p.pct < 0 ? "…"
      : `${p.pct.toFixed(1)}%${p.done != null && p.total != null ? `  ${fmtBytes(p.done)}/${fmtBytes(p.total)}` : ""}`;
    const width = 24;
    const filled = p.pct < 0 ? 0 : Math.round((p.pct / 100) * width);
    process.stdout.write(
      `\r[${"█".repeat(filled)}${"·".repeat(width - filled)}] ${bar}  ${spd}   `
    );
  };

  const result = shouldUseYtDlp(url)
    ? await downloadWithYtDlp(url, { format, file, onProgress: render })
    : await download(url, { file, segments: segs, onProgress: render });
  if (!result.complete) {
    const pct = pDone(result.file);
    process.stdout.write(`\rIncomplete: ${pct.toFixed(1)}% — re-run to resume.      \n`);
  } else {
    process.stdout.write("\r" + " ".repeat(80) + "\r");
    console.log(`Done: ${result.file}${result.size ? ` (${fmtBytes(result.size)})` : ""}`);
  }
} catch (err) {
  console.error("\nDownload failed:", err.message);
  process.exit(1);
}

function fmtBytes(b) {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) (b /= 1024), i++;
  return `${b.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function pDone(file) {
  const st = JSON.parse(fs.readFileSync(file + ".download", "utf8"));
  let done = 0,
    total = 0;
  for (const s of st.segments) (done += s.done), (total += s.end - s.start + 1);
  return total ? (done / total) * 100 : 100;
}
