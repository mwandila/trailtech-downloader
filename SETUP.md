# Complete Setup Guide

This guide walks you through setting up the complete IDM-style download manager with browser extension integration.

## Prerequisites

- **Node.js** 18+ (check with `node --version`)
- **Chrome** or **Chromium-based browser** (Edge, Brave, Opera)
- **Windows** (PowerShell) - tested on Windows 10/11

## Step 1: Verify Installation

```powershell
# Navigate to the project directory
cd E:\projects\tickettrails\downloader

# Verify Node.js version
node --version  # Should be 18.0.0 or higher

# Check that all files are present
dir
```

## Step 2: Test the CLI (Optional)

Before setting up the browser extension, test the download engine directly:

```powershell
# Download a test file (100MB)
node cli.js "https://speed.hetzner.de/100MB.bin"

# You should see a progress bar
# Press Ctrl+C to interrupt, then run the same command to resume
```

## Step 3: Start the Download Engine

Open a PowerShell terminal and start the engine server:

```powershell
node server.js
```

You should see:
```
engine ipc: ws://127.0.0.1:4991/
Downloader engine running — Ctrl+C to stop.
```

**Keep this terminal open** - the engine must be running for the extension to work.

## Step 4: Load the Browser Extension

1. Open Chrome and navigate to: `chrome://extensions/`

2. Enable **Developer mode** (toggle in the top-right corner)

3. Click **"Load unpacked"**

4. Browse to and select:
   ```
   E:\projects\tickettrails\downloader\extension
   ```

5. The extension should load successfully. You'll see:
   - Name: "Trail Video Downloader (TVD)"
   - Version: 1.0.0
   - Icon: Download arrow

6. **Pin the extension** (click the puzzle icon and pin "Trail Video Downloader (TVD)")

## Step 5: Verify Connection

1. Click the extension icon in your browser toolbar

2. The popup should show:
   - **Status**: "Engine Connected" (green)
   - Active downloads list
   - YouTube video pages show a yellow resolution control over the video

3. If it shows "Engine Offline" (red):
   - Make sure `node server.js` is running
   - Check that no firewall is blocking port 4991
   - Restart the browser and try again

## Step 6: Test Download Interception

### Method A: Automatic Interception

1. Visit a page with downloadable content:
   - https://sample-videos.com/
   - https://file-examples.com/

2. Click any large file (>1MB)

3. You should see a prompt overlay:
   ```
   Download with Multi-Segment Manager?
   [Download] [Browser]
   ```

4. Click **"Download"** to use the engine

5. Check the terminal running `node server.js` - you'll see:
   ```
   [DM] Intercepting: https://...
   [DM] Sent to engine: https://...
   ```

### Method B: Context Menu

1. Right-click any link, image, video, or audio on a webpage

2. Select **"Download with TVD"**

3. The download will be sent to the engine

### Method C: Extension Popup

1. Click the extension icon

2. Paste a URL into the input field:
   ```
   https://speed.hetzner.de/100MB.bin
   ```

3. Click **"Download"** or press Enter

4. Monitor progress in the popup or terminal

## Step 7: Monitor Downloads

### In the Browser

- Click the extension icon to see active downloads
- Progress bars show completion percentage
- Real-time speed display (KB/s or MB/s)

### In the Terminal

The engine terminal shows:
```
[DM] Download queued: https://...
segment 0: downloading from offset 0
segment 1: downloading from offset 12500000
...
```

### On Disk

Downloaded files appear in the same directory where you run `node server.js`:

```powershell
dir *.bin
dir *.download  # State files for resume
```

## Troubleshooting

### "Engine Offline" Status

**Problem**: Extension shows red "Engine Offline" status

**Solutions**:
1. Verify the engine is running: `node server.js`
2. Check port availability:
   ```powershell
   netstat -ano | findstr 4991
   ```
3. Firewall: Allow Node.js through Windows Firewall
4. Try a different port:
   ```powershell
   $env:DOWNLOADER_PORT=5000
   node server.js
   ```
   Then update `ENGINE_WS_URL` in `extension/background.js`

### Extension Not Detecting Downloads

**Problem**: Large files download normally without interception

**Solutions**:
1. Check the browser console:
   - Open DevTools (F12)
   - Go to Console tab
   - Look for `[DM]` messages
2. Verify permissions:
   - Go to `chrome://extensions/`
   - Click "Details" on Trail Video Downloader (TVD)
   - Ensure "Site access" is "On all sites"
3. Reload the extension:
   - Click the refresh icon on the extension card

### Downloads Fail with "HTTP 403" or "HTTP 401"

**Problem**: Downloads fail with authorization errors

**Cause**: Some sites require authentication cookies that aren't being forwarded

**Solution**: This is expected for authenticated content. The engine currently strips most headers for security. To download authenticated content, use the CLI directly from a logged-in terminal session.

### Resume Not Working

**Problem**: Interrupted downloads restart from beginning

**Solutions**:
1. Check for `.download` state file:
   ```powershell
   dir *.download
   ```
2. Verify the URL hasn't changed (same domain, same file)
3. If the server changed the file, resume won't work (by design)

### High CPU Usage

**Problem**: Engine uses significant CPU

**Cause**: Too many parallel segments for your connection speed

**Solution**: Reduce segment count in `server.js`:
```javascript
const file = await download(task.url, {
  segments: 4,  // Reduce from 8 to 4
  ...
});
```

## Advanced Configuration

### Change Engine Port

```powershell
# In terminal running the engine
$env:DOWNLOADER_PORT=5000
node server.js
```

In `extension/background.js`, line 13:
```javascript
const ENGINE_WS_URL = "ws://127.0.0.1:5000/";
```

### Adjust Interception Threshold

In `extension/background.js`, line 14:
```javascript
const MIN_SIZE_INTERCEPT = 5 * 1024 * 1024; // 5MB instead of 1MB
```

### Modify Max Concurrent Downloads

In `server.js`, line 11:
```javascript
const MAX_CONCURRENT = 8; // Allow 8 simultaneous downloads
```

### Change Download Directory

The engine downloads files to the directory where it runs. To change:

```powershell
# Create and navigate to download directory
mkdir D:\Downloads\DM
cd D:\Downloads\DM
node E:\projects\tickettrails\downloader\server.js
```

## Running as a Windows Service

To keep the engine running in the background:

### Option A: PM2 (Recommended)

```powershell
# Install PM2 globally
npm install -g pm2

# Start the engine
pm2 start server.js --name dm-engine

# View logs
pm2 logs dm-engine

# Stop
pm2 stop dm-engine

# Auto-start on boot
pm2 startup
pm2 save
```

### Option B: Windows Scheduled Task

1. Open Task Scheduler
2. Create Basic Task
3. Trigger: "When I log on"
4. Action: "Start a program"
5. Program: `C:\Program Files\nodejs\node.exe`
6. Arguments: `E:\projects\tickettrails\downloader\server.js`
7. Start in: `E:\projects\tickettrails\downloader`

## Next Steps

- **Firefox Extension**: The manifest can be adapted for Firefox (minor changes)
- **Electron UI**: Build a standalone desktop app
- **Download Queue**: Implement priority queue and scheduling
- **Speed Limiting**: Add bandwidth throttling options
- **History**: Persist download history to database

## Getting Help

If you encounter issues:

1. Check the terminal output for error messages
2. Check browser console (F12 → Console) for `[DM]` logs
3. Review the `idm-study/FINDINGS.md` for architecture details
4. Open an issue with:
   - Error messages
   - Steps to reproduce
   - Node.js version
   - Browser version

## Uninstall

1. Remove the browser extension:
   - Go to `chrome://extensions/`
   - Click "Remove" on Trail Video Downloader (TVD)

2. Stop the engine:
   - Press `Ctrl+C` in the terminal

3. (Optional) Delete the project folder:
   ```powershell
   Remove-Item -Recurse -Force E:\projects\tickettrails\downloader
   ```

---

**Congratulations!** You now have a fully functional IDM-style download manager with browser integration.
