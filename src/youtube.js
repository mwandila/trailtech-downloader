import { spawn } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs/promises";
import path from "node:path";
import { getDownloadDirectory } from "./output.js";

const VALID_FORMATS = new Set(["best", "1080p", "720p", "480p", "360p", "audio-mp3"]);
const CONCURRENT_FRAGMENTS = Math.min(16, Math.max(1, Number.parseInt(process.env.DOWNLOADER_CONCURRENT_FRAGMENTS || "8", 10) || 8));
let executablePromise;
let ffmpegAvailablePromise;

/** YouTube and other yt-dlp-supported page URLs need extractor-aware downloads. */
export function isYouTubeUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.length > 1;
    if (host !== "youtube.com" && !host.endsWith(".youtube.com") && host !== "youtube-nocookie.com") return false;
    return (parsed.pathname === "/watch" && Boolean(parsed.searchParams.get("v"))) || /^\/(shorts|live|embed)\/[^/]+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** Treat web pages as extractor URLs; direct media and file links use HTTP. */
export function shouldUseYtDlp(value, contentType = "") {
  if (isYouTubeUrl(value)) return true;
  if (/mpegurl|dash\+xml/i.test(contentType)) return true;
  if (contentType && !/^(text\/html|application\/xhtml\+xml)/i.test(contentType)) return false;
  try {
    const pathname = new URL(value).pathname;
    const extension = pathname.match(/\.([a-z0-9]{2,8})$/i)?.[1]?.toLowerCase();
    const directExtensions = new Set([
      "mp4", "m4v", "mkv", "webm", "mov", "avi", "mp3", "m4a", "aac", "wav", "flac", "ogg", "opus",
      "ts", "zip", "rar", "7z", "exe", "msi", "dmg", "pkg", "iso", "tar", "gz", "bz2", "xz", "pdf", "apk", "ipa", "bin", "csv", "txt",
    ]);
    return !extension || !directExtensions.has(extension);
  } catch {
    return false;
  }
}

export function normalizeMediaFormat(value) {
  return VALID_FORMATS.has(value) ? value : "best";
}

/**
 * Let yt-dlp download and merge adaptive video/audio streams itself. Returning
 * a direct YouTube media URL and passing it to the HTTP engine loses the audio
 * stream and often fails because signed URLs reject HEAD/range requests.
 */
export async function downloadWithYtDlp(url, { format = "best", file, signal, onProgress, useChromeCookies = false } = {}) {
  const selectedFormat = normalizeMediaFormat(format);
  const output = file ? path.resolve(file) : path.join(getDownloadDirectory(), "%(title).180B [%(id)s].%(ext)s");
  await fs.mkdir(path.dirname(output), { recursive: true });
  const args = [
    "--no-playlist", "--newline", "--progress", "--no-warnings",
    "--concurrent-fragments", String(CONCURRENT_FRAGMENTS),
    "--output", output,
  ];
  if (useChromeCookies && isYouTubeUrl(url)) args.push("--cookies-from-browser", "chrome");

  if (selectedFormat === "audio-mp3") {
    args.push("--format", "bestaudio/best", "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    const maxHeight = selectedFormat === "best" ? null : Number.parseInt(selectedFormat, 10);
    const hasFfmpeg = await hasFfmpegAvailable();
    if (hasFfmpeg) {
      // `bv` guarantees a video-only stream, so `ba` is explicitly merged
      // into the result. `b` remains a single-file fallback.
      const video = maxHeight ? `bv[height<=${maxHeight}]` : "bv";
      const combined = maxHeight ? `b[height<=${maxHeight}]` : "b";
      args.push("--format", `${video}+ba/${combined}`, "--merge-output-format", "mp4/mkv/webm");
    } else {
      // Without FFmpeg, choose a pre-merged file so the saved video still has sound.
      const combined = maxHeight ? `b[height<=${maxHeight}]` : "b";
      args.push("--format", combined);
    }
  }
  args.push("--print", "after_move:filepath", url);

  const executable = await getYtDlpExecutable();
  if (signal?.aborted) throw new DOMException("Download canceled", "AbortError");

  return new Promise((resolve, reject) => {
    const child = spawn(executable.command, [...executable.prefixArgs, ...args], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = readline.createInterface({ input: child.stdout });
    const stderr = readline.createInterface({ input: child.stderr });
    const outputLines = [];
    let errorText = "";
    let settled = false;

    const cleanup = () => {
      stdout.close();
      stderr.close();
      signal?.removeEventListener("abort", abort);
    };
    const finish = (error, file) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve({ file, complete: true });
    };
    const abort = () => child.kill("SIGTERM");

    signal?.addEventListener("abort", abort, { once: true });
    const processLine = (line, stream) => {
      const value = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").trim();
      if (!value) return;
      if (stream === "stderr") errorText = (errorText + value + "\n").slice(-8000);
      if (stream === "stdout" && !/^\[/.test(value)) outputLines.push(value);
      if (/\[Merger\]|Merging formats/i.test(value)) {
        onProgress?.({ pct: 100, phase: "Merging video and audio" }, 0);
      }

      // yt-dlp versions and wrappers may emit progress to either output stream.
      // Parse the percentage even when the speed field is temporarily absent.
      const progress = value.match(/\[download\]\s+(\d+(?:\.\d+)?)%/i);
      if (!progress) return;
      const speed = value.match(/\bat\s+([\d.]+)\s*(B|KiB|MiB|GiB|KB|MB|GB)\/s\b/i);
      const multipliers = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, KB: 1000, MB: 1000 ** 2, GB: 1000 ** 3 };
      const bytesPerSecond = speed ? Number(speed[1]) * multipliers[speed[2]] : 0;
      onProgress?.({ pct: Number(progress[1]), done: null, total: null, phase: "Downloading" }, bytesPerSecond);
    };
    stdout.on("line", (line) => processLine(line, "stdout"));
    stderr.on("line", (line) => processLine(line, "stderr"));
    child.once("error", (error) => {
      finish(new Error(`Could not start yt-dlp: ${error.message}. Install yt-dlp and restart the engine.`));
    });
    child.once("close", (code) => {
      if (signal?.aborted) return finish(new DOMException("Download canceled", "AbortError"));
      if (code !== 0) {
        const detail = errorText.trim().split(/\r?\n/).filter(Boolean).slice(-4).join(" ");
        const installHint = /ffmpeg|ffprobe/i.test(detail) ? " MP3 conversion and merging separate video/audio streams require FFmpeg." : "";
        return finish(new Error(`yt-dlp exited with code ${code}.${installHint} ${detail || "Check that the URL is public and yt-dlp is up to date."}`));
      }
      const file = [...outputLines].reverse().find((line) => !/^\[/.test(line));
      finish(null, file || "Download complete");
    });
  });
}

async function getYtDlpExecutable() {
  if (!executablePromise) executablePromise = findYtDlpExecutable();
  return executablePromise;
}

async function hasFfmpegAvailable() {
  if (!ffmpegAvailablePromise) {
    const commands = process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg"];
    ffmpegAvailablePromise = (async () => {
      for (const command of commands) {
        const available = await new Promise((resolve) => {
          const child = spawn(command, ["-version"], { windowsHide: true, stdio: "ignore" });
          child.once("error", () => resolve(false));
          child.once("close", (code) => resolve(code === 0));
        });
        if (available) return true;
      }
      return false;
    })();
  }
  return ffmpegAvailablePromise;
}

async function findYtDlpExecutable() {
  const bundledYtDlp = path.resolve(process.cwd(), "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  const candidates = [
    { command: bundledYtDlp, prefixArgs: [] },
    ...(process.platform === "win32"
      ? [{ command: "yt-dlp.exe", prefixArgs: [] }, { command: "yt-dlp", prefixArgs: [] }, { command: "py", prefixArgs: ["-m", "yt_dlp"] }, { command: "python", prefixArgs: ["-m", "yt_dlp"] }]
      : [{ command: "yt-dlp", prefixArgs: [] }, { command: "python3", prefixArgs: ["-m", "yt_dlp"] }, { command: "python", prefixArgs: ["-m", "yt_dlp"] }]),
  ];

  for (const candidate of candidates) {
    const available = await new Promise((resolve) => {
      const child = spawn(candidate.command, [...candidate.prefixArgs, "--version"], { windowsHide: true, stdio: "ignore" });
      child.once("error", () => resolve(false));
      child.once("close", (code) => resolve(code === 0));
    });
    if (available) return candidate;
  }
  throw new Error("yt-dlp is required for YouTube downloads. On Windows run: winget install yt-dlp. Audio conversion and separate-stream merging also require FFmpeg.");
}

/* ---------- audio verification + extractor-site routing ---------- */

/** Pages whose yt-dlp extractor reliably returns video+audio muxed. */
const EXTRACTOR_HOSTS = [
  "youtube.com", "youtu.be", "youtube-nocookie.com",
  "twitter.com", "x.com", "mobile.twitter.com",
  "facebook.com", "fb.watch",
  "instagram.com",
  "tiktok.com",
  "reddit.com", "v.redd.it",
  "vimeo.com",
  "dailymotion.com", "dai.ly",
  "bilibili.com", "b23.tv",
  "soundcloud.com",
  "bandcamp.com",
  "twitch.tv", "clips.twitch.tv",
  "pinterest.com", "pin.it",
  "linkedin.com",
  "snackvideo.com", "kuaishou.com",
];

/** True when the URL belongs to a page with a strong yt-dlp extractor. */
export function isExtractorPage(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return EXTRACTOR_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

export function isVideoContentType(contentType = "", file = "") {
  const ext = (file.match(/\.([a-z0-9]{2,5})$/i)?.[1] || "").toLowerCase();
  return /(^video\/)|(^application\/vnd\.apple\.mpegurl)|(^application\/dash)/i.test(contentType) ||
    ["mp4", "m4v", "mkv", "webm", "mov", "avi", "ts"].includes(ext);
}

/** Uses ffprobe to check whether a media file contains an audio stream. */
export async function hasAudioStream(file) {
  try {
    const { spawn } = await import("node:child_process");
    const out = await new Promise((resolve, reject) => {
      const child = spawn("ffprobe", [
        "-v", "error",
        "-select_streams", "a",
        "-show_entries", "stream=index",
        "-of", "csv=p=0",
        file,
      ], { windowsHide: true });
      let stdout = "", stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", reject);
      child.on("exit", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `ffprobe exit ${code}`)));
    });
    return out.trim().length > 0;
  } catch {
    return true; // can't verify -> assume audio present rather than re-downloading
  }
}
