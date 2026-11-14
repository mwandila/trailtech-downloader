# Trail Video Downloader (TVD)

A complete multi-segment download manager with browser extension, inspired by Internet Download Manager (IDM) architecture, built with Node.js and zero dependencies.

## 🏗️ Architecture

Based on reverse-engineering study of IDM's interception mechanism (see `idm-study/FINDINGS.md`), this implementation includes:

### 1. **Download Engine** (`src/`, `server.js`)
- Multi-segment parallel downloading (like IDM's dynamic file segmentation)
- Sparse file writing (no merge step needed)
- Resume capability with state checkpointing
- WebSocket IPC server for browser extension communication
- Origin validation for security (chrome-extension:// only)

### 2. **Browser Extension** (`extension/`)
- **Manifest V3** Chrome extension
- Content script injection at `document_start`
- Main-world script for blob/media detection
- WebRequest API for response header sniffing
- Context menu integration
- Real-time download progress UI

### 3. **Communication Flow**
```
Browser Tab
    ↓
Content Script (content.js)
    ↓ (detects media/downloads)
Main World Script (document.js)
    ↓ (postMessage)
Background Worker (background.js)
    ↓ (WebSocket ws://127.0.0.1:4991)
Download Engine (server.js)
    ↓
Multi-segment Downloader (engine.js)
```

## 🚀 Quick Start

### 1. Start the Download Engine

```powershell
# Install dependencies (none! zero-dependency)
node --version  # Requires Node.js 18+

# Start the engine server
node server.js
```

The engine listens on `ws://127.0.0.1:4991` for browser extension connections.

### 2. Load the Browser Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select the `extension` folder from this project
5. **Important**: Create placeholder icons first (see `extension/icons/README.md`)

### 3. Download Files

#### Method A: Automatic Interception
- Browse to any large file (>1MB) or media content
- The extension will detect it and show a prompt
- Click "Download" to use the multi-segment manager

#### Method B: Context Menu
- Right-click any link, image, video, or audio
- Select "Download with TVD"

#### Method C: Extension Popup
- Click the extension icon
- Paste a URL in the input field
- Click "Download"

#### Method D: Command Line
```powershell
# Direct CLI download (no extension needed)
node cli.js "https://example.com/largefile.zip"

# With options
node cli.js "https://example.com/file.zip" -o output.zip -s 16
```

## 📋 Features

### Engine Features
✅ Multi-segment parallel downloading (1-32 segments)  
✅ Automatic resume on interruption  
✅ Sparse file pre-allocation (no merge needed)  
✅ Exponential backoff retry (up to 20 attempts per segment)  
✅ Real-time progress tracking  
✅ Speed calculation  
✅ Zero dependencies (pure Node.js)  

### Extension Features
✅ Automatic download detection (webRequest API)  
✅ Media element sniffing (video/audio tags)  
✅ Main-world injection for blob URLs  
✅ Context menu integration  
✅ Real-time download status  
✅ Browser notifications  
✅ Origin-validated WebSocket connection  

## 🔧 Configuration

### Engine Port
Change the engine port by setting an environment variable:

```powershell
$env:DOWNLOADER_PORT=5000
node server.js
```

Then update `ENGINE_WS_URL` in `extension/background.js`:
```javascript
const ENGINE_WS_URL = "ws://127.0.0.1:5000/";
```

### Interception Threshold
Adjust minimum file size for automatic interception in `extension/background.js`:
```javascript
const MIN_SIZE_INTERCEPT = 1024 * 1024; // 1MB default
```

### Max Concurrent Downloads
Change in `server.js`:
```javascript
const MAX_CONCURRENT = 4; // default
```

## 📁 Project Structure

```
downloader/
├── src/
│   ├── engine.js      # Multi-segment download logic
│   ├── probe.js       # HEAD/range probing
│   ├── state.js       # Resume state management
│   └── ws.js          # WebSocket server (RFC6455)
├── extension/
│   ├── background.js  # Service worker (MV3)
│   ├── content.js     # Content script injection
│   ├── document.js    # Main-world script
│   ├── popup.html     # Extension UI
│   ├── popup.js       # UI logic
│   ├── manifest.json  # Extension manifest
│   └── icons/         # Extension icons (create these)
├── idm-study/         # REA reverse-engineering study
│   ├── FINDINGS.md    # IDM analysis documentation
│   └── ext/           # Extracted IDM extension
├── cli.js             # Command-line interface
├── server.js          # WebSocket engine server
├── package.json       # Project metadata
└── README.md          # Main documentation
```

## 🔬 How It Works

### 1. Probing Phase
- Sends HEAD request to get file size, ETag, Content-Disposition
- Falls back to 1-byte range request if HEAD fails
- Determines if server supports range requests

### 2. Segmentation
- Splits file into N equal segments (default: 8)
- Each segment gets its own HTTP connection with Range header
- Example: 80MB file → 8 segments of 10MB each

### 3. Parallel Download
- All segments download simultaneously
- Each writes to its offset in the pre-allocated file
- Real-time progress tracking per segment

### 4. Resume Logic
- State saved to `<filename>.download` every 800ms
- Contains: URL, size, ETag, per-segment progress
- Re-running continues from last saved offsets

### 5. Browser Integration
- Extension monitors `webRequest.onResponseStarted`
- Captures response headers (Content-Length, Content-Type, etc.)
- Sends download request to engine via WebSocket
- Origin validation prevents unauthorized access

## 🧪 Testing

### Test the Engine Directly
```powershell
# Download a large file
node cli.js "https://speed.hetzner.de/100MB.bin"

# Interrupt with Ctrl+C, then resume
node cli.js "https://speed.hetzner.de/100MB.bin"
```

### Test the WebSocket Connection
```powershell
# Start the engine
node server.js

# In another terminal, test with the probe script
node idm-study/ws-handshake-probe.mjs
```

### Test the Extension
1. Load extension in Chrome
2. Start the engine: `node server.js`
3. Visit a page with large downloads: https://sample-videos.com/
4. Click any download link and choose "Download with TVD"

## 🔐 Security

### Origin Validation
The engine only accepts WebSocket connections from:
- `chrome-extension://*`
- `moz-extension://*`

Random web pages cannot control the download engine.

### Header Sanitization
Sensitive headers are stripped before forwarding to the download engine:
- `Host`, `Connection`, `Upgrade`
- `Sec-*` headers
- `Origin`, `User-Agent`

## 🎯 Roadmap

See the main `README.md` for the complete roadmap. Completed items:

✅ Multi-segment download engine  
✅ Resume capability  
✅ Browser extension (MV3)  
✅ WebSocket IPC with origin validation  
✅ Context menu integration  
✅ Real-time progress UI  

Still planned:
- [ ] Dynamic segment re-balancing
- [ ] Download queue management
- [ ] Download history
- [ ] Electron UI
- [ ] Firefox extension (minor manifest changes)

## 📚 References

- IDM reverse-engineering study: `idm-study/FINDINGS.md`
- REA (Reverse Engineer Anything): https://github.com/morluto/rea
- WebSocket RFC6455: https://tools.ietf.org/html/rfc6455
- Chrome Extension MV3: https://developer.chrome.com/docs/extensions/mv3/

## 📄 License

MIT License - see main README.md

---

Built with insights from [REA (Reverse Engineer Anything)](https://github.com/morluto/rea) study of IDM's interception mechanism.
