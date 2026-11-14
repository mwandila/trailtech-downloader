# Extension Reload Instructions

## Error Fixed! 

The extension errors you saw were caused by:
1. `webRequest` API not properly configured for MV3
2. Missing error handling in context menu creation

## What Was Changed

1. **Commented out webRequest monitoring** (for now) - this requires special Chrome policies in MV3
2. **Added error handling** for context menu creation
3. **Improved service worker lifecycle** handling

## How to Reload

1. **Go to**: `chrome://extensions/`
2. **Find**: "Trail Video Downloader (TVD)" extension  
3. **Click**: The refresh/reload icon (🔄) on the extension card
4. **Check**: Errors should be gone!

## How to Use Without WebRequest

The extension still works great, just without automatic interception of large downloads. You can:

### ✅ Method 1: Context Menu (Recommended)
- Right-click any link → "Download with TVD"
- Right-click any image/video/audio → "Download with TVD"

### ✅ Method 2: Extension Popup
- Click the extension icon
- Paste any URL
- Click "Download"

### ✅ Method 3: Media Detection
- The content script still detects video/audio elements automatically
- Media URLs are captured and can be downloaded

## Enabling WebRequest (Advanced)

If you want automatic interception of large downloads, you need to:

1. **Uncomment the webRequest code** in `background.js` (lines ~74-120)
2. **Add permission** to `manifest.json`:
   ```json
   "permissions": [
     "webRequest",
     "storage",
     "contextMenus",
     "notifications"
   ]
   ```
3. **Reload the extension**

**Note**: In Chrome MV3, `webRequest` for blocking is limited. For full interception, you'd need `declarativeNetRequest` API instead, which is more complex.

## Testing

After reloading, test with:

1. **Start the engine**: `node server.js`
2. **Click extension icon** - should show "Engine Connected" (green)
3. **Paste URL**: `https://speed.hetzner.de/10MB.bin`
4. **Click Download** - should work!

Or test context menu:
1. Go to any webpage
2. Right-click a link
3. Select "Download with TVD"

## Still Having Issues?

Check the browser console:
1. Go to `chrome://extensions/`
2. Click "Inspect views: service worker" 
3. Look for `[DM]` messages
4. Check for any red errors

The extension should now load without errors! 🎉
