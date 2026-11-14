# Quick Start Guide

Get up and running in 5 minutes!

## 1. Start the Engine (30 seconds)

Open PowerShell in the project directory:

```powershell
node server.js
```

You should see:
```
engine ipc: ws://127.0.0.1:4991/
Downloader engine running — Ctrl+C to stop.
```

✅ **Keep this terminal open!**

## 2. Load the Extension (2 minutes)

1. Open Chrome → `chrome://extensions/`
2. Toggle **Developer mode** ON (top-right)
3. Click **Load unpacked**
4. Select folder: `extension`
5. Click the **reload icon (🔄)** on the extension card if you see errors
6. ✅ Extension loaded!

## 3. Test Auto-Detection (1 minute)

The extension will automatically detect downloads!

### Try it:
1. Visit https://speed.hetzner.de/
2. Click any large file (10MB, 100MB)
3. TVD shows its compact download controls for detected media.
4. Click **Download** → Watch progress in the player control and queue!

Or just click any video/archive link - it will be intercepted automatically! 🎉

---

## That's it! 🎉

Trail Video Downloader (TVD) is running.

### What Next?

**Use the context menu** (Recommended):
- Go to any webpage
- Right-click any link, image, or video
- Select **"Download with TVD"**

**Download a video:**
- Open a YouTube video page
- Choose a resolution in the small yellow control at the video's upper-right corner
- Click **Download**

**See progress:**
- Click the extension icon to see engine status and active downloads
- Check the terminal for detailed logs

### Troubleshooting

**"Engine Offline" error?**
- Make sure `node server.js` is running
- Check firewall isn't blocking port 4991

**Extension errors on load?**
- Click the reload/refresh icon (🔄) on the extension card
- Check `extension/RELOAD_INSTRUCTIONS.md` for details

**Context menu not showing?**
- Refresh the webpage after loading the extension
- Right-click on a link (not empty space)

### Need More Help?

See **[SETUP.md](SETUP.md)** for:
- Detailed troubleshooting
- Configuration options
- Advanced features
- Uninstall instructions

### Architecture

Based on reverse-engineering IDM's interception mechanism. See:
- `idm-study/FINDINGS.md` - REA analysis of IDM
- `EXTENSION_README.md` - Complete architecture guide

---

**Built with [REA](https://github.com/morluto/rea)** - Reverse Engineer Anything
