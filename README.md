# Trail Video Downloader (TVD)

IDM-style multi-segment download engine built in Node.js with no npm dependencies. Video page extraction uses the external yt-dlp tool; FFmpeg is needed for MP3 conversion and for merging separate video/audio streams.

## How it works

1. **Probe** — HEAD request (falls back to a byte-range probe) to learn the file size, `Content-Disposition` filename, range support, ETag, etc. (`src/probe.js`)
2. **Segment** — the file is split into N byte ranges (default 8); each segment gets its own parallel `Range` HTTP connection, like IDM's dynamic file segmentation. (`src/engine.js`)
3. **Sparse write** — the target file is preallocated at full size and all segments write at their byte offsets into the *same* file, so there's no merge step.
4. **Resume** — progress is checkpointed to `<file>.download` every ~800ms. Re-running the same command resumes from saved state; requests continue from each segment's last written offset.
5. **Retry** — each segment retries with exponential backoff (up to 20 tries) if a stream dies.

## Usage

```powershell
node cli.js "<url>" [-o output-file] [-s 8] [-f best|1080p|720p|480p|360p|audio-mp3]
```

- `-o` output path (default: your user Downloads folder; configurable with `DOWNLOADER_DIR`)
- `-s` number of parallel segments (1–32)
- `-f` video resolution or MP3 audio format for yt-dlp-supported page URLs
- Interrupt with Ctrl+C, then re-run the same command to resume.

## Architecture

```
cli.js          argument parsing + progress bar
src/engine.js   segmented download engine (probe → split → parallel streams → reassemble-in-place)
src/probe.js    HEAD/range probing + sparse file reservation
src/state.js    .download state file (load / create / checkpoint)
```

## Components

### 1. **CLI** (`cli.js`)
Command-line downloader with progress bar:
```powershell
node cli.js "<url>" [-o output-file] [-s 8]
```

### 2. **Engine Server** (`server.js`)
WebSocket server that accepts download requests from the browser extension:
```powershell
node server.js
```
- Listens on `ws://127.0.0.1:4991`
- Origin validation (chrome-extension:// only)
- Queue management (4 simultaneous jobs by default; configurable up to 8)
- Real-time status broadcasts

### 3. **Browser Extension** (`extension/`)
Chrome Manifest V3 extension for intercepting downloads:
- Automatic detection of large files (>1MB)
- Context menu "Download with TVD"
- Media element sniffing
- Real-time progress UI

See **[EXTENSION_README.md](EXTENSION_README.md)** for complete setup and usage.

### Video sites and audio

On YouTube video pages, a compact blue control appears in the video's upper-right corner with best quality, up to 1080p/720p/480p/360p, and MP3 options. The extension popup shows engine status and download progress; direct file links can be sent through the context menu. Video-page extraction requires [yt-dlp](https://github.com/yt-dlp/yt-dlp), and MP3 conversion or merging separate video/audio streams requires FFmpeg. Downloads go to the user's Downloads folder by default. See [YOUTUBE_SETUP.md](YOUTUBE_SETUP.md).

The popup's **Downloads** list shows current and recent tasks, progress, speed, and Pause/Resume/Cancel controls. Paused HTTP downloads resume from their checkpoint; yt-dlp resumes from its partial file.

Video fragments download 8 at a time by default (up to 16). To change fragment or simultaneous-job concurrency, set `DOWNLOADER_CONCURRENT_FRAGMENTS` or `DOWNLOADER_MAX_CONCURRENT` before starting the engine.

## Quick Start

### CLI Mode
```powershell
node cli.js "https://example.com/largefile.zip"
```

### Extension + Engine Mode
```powershell
# Terminal 1: Start the engine
node server.js

# Terminal 2 (optional): Direct download via engine
node server.js "https://example.com/file.zip"

# Browser: Load extension from ./extension folder
# Then browse and download files - they'll be intercepted automatically
```

## Next steps (roadmap)

✅ Multi-segment download engine  
✅ Resume capability with state files  
✅ Browser extension + WebSocket IPC  
✅ Context menu integration  
✅ Real-time progress UI  

- [ ] Speed check + dynamic segment re-balancing at runtime
- [ ] Pause/resume API (SIGINT → graceful pause)
- [ ] Download history persistence
- [ ] Electron UI
- [ ] Firefox extension port
