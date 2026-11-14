# 🔧 Fix "Connecting..." Issue

## The Problem
The extension popup shows "Connecting..." because it can't connect to the download engine via WebSocket.

## Solution: Start the Engine First!

### Step 1: Open PowerShell
Navigate to your project folder:
```powershell
cd E:\projects\tickettrails\downloader
```

### Step 2: Start the Engine
```powershell
node server.js
```

You should see:
```
engine ipc: ws://127.0.0.1:4991/
Downloader engine running — Ctrl+C to stop.
```

✅ **Keep this terminal open!** The engine must be running for the extension to work.

### Step 3: Reload the Extension Popup
1. Close the popup (if open)
2. Click the extension icon again
3. Should now show: **"Engine Connected"** (green text)

### Step 4: Test Download
Now paste a URL like:
```
https://speed.hetzner.de/10MB.bin
```

Click "Download" - it should work! 🎉

---

## Still Shows "Connecting..."?

### Check 1: Is the Engine Running?
Look for the PowerShell window with `node server.js`. You should see:
```
engine ipc: ws://127.0.0.1:4991/
Downloader engine running — Ctrl+C to stop.
```

### Check 2: Port 4991 Available?
Check if something else is using the port:
```powershell
netstat -ano | findstr 4991
```

If you see output, another app is using that port. Kill it or change the port:

**To change port:**
1. Edit `server.js` - change line with `PORT = 4991`
2. Edit `extension/background.js` - change `ENGINE_WS_URL` to match
3. Restart engine and reload extension

### Check 3: Firewall Blocking?
Windows Firewall might be blocking Node.js:
1. Search "Windows Defender Firewall"
2. Click "Allow an app through firewall"
3. Find "Node.js" and enable for Private networks
4. Restart the engine

### Check 4: Extension Error?
1. Go to `chrome://extensions/`
2. Click "Inspect views: service worker" under Trail Video Downloader (TVD)
3. Check Console for errors
4. Look for lines starting with `[DM]`

### Check 5: WebSocket URL Correct?
In browser console (when popup is open):
```javascript
// Press F12 in popup, then run:
console.log(ENGINE_WS_URL);
// Should show: ws://127.0.0.1:4991/
```

---

## Quick Test Script

Save this as `test-connection.js`:
```javascript
const ws = new WebSocket('ws://127.0.0.1:4991/');
ws.onopen = () => console.log('✅ Connected!');
ws.onerror = (e) => console.log('❌ Connection failed:', e);
```

Run in browser console to test connection.

---

## Common Mistakes

❌ **Forgot to start the engine** - Most common!  
❌ **Wrong directory** - Must run `node server.js` from project root  
❌ **Port conflict** - Another app using port 4991  
❌ **Firewall blocking** - Windows Firewall blocks Node.js  

## Correct Setup

**Terminal 1 (PowerShell):**
```powershell
cd E:\projects\tickettrails\downloader
node server.js
# Leave running!
```

**Browser:**
1. Click extension icon
2. Should show "Engine Connected" (green)
3. Paste URL
4. Click Download
5. Check Terminal 1 for progress

---

## Need More Help?

Show me:
1. Output from `node server.js`
2. Browser console errors (F12 → Console)
3. Extension service worker console errors

I'll help debug! 🔧
