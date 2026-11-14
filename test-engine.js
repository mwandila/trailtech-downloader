#!/usr/bin/env node
/**
 * Quick test to verify the download engine is working
 */

console.log("🔍 Testing Download Engine Setup...\n");

// Test 1: Can we import the modules?
try {
  const { download } = await import("./src/engine.js");
  console.log("✓ Engine module loaded");
} catch (e) {
  console.log("✗ Engine module failed:", e.message);
  process.exit(1);
}

// Test 2: Can we start the WebSocket server?
try {
  const { WsServer } = await import("./src/ws.js");
  const testServer = new WsServer({
    port: 4991,
    host: "127.0.0.1",
    path: "/",
    onMessage: () => {},
    log: (msg) => console.log("   ", msg)
  });
  
  console.log("✓ WebSocket server started on port 4991");
  
  // Test 3: Try to connect to it
  setTimeout(async () => {
    try {
      const ws = new (await import("ws")).default("ws://127.0.0.1:4991/", {
        headers: {
          Origin: "chrome-extension://test"
        }
      });
      
      ws.on("open", () => {
        console.log("✓ WebSocket connection successful!");
        console.log("\n✅ Engine is working correctly!");
        console.log("\nYou can now:");
        console.log("1. Start the engine: node server.js");
        console.log("2. Reload the extension in Chrome");
        console.log("3. The popup should show 'Engine Connected'\n");
        
        ws.close();
        testServer.close();
        process.exit(0);
      });
      
      ws.on("error", (err) => {
        console.log("✗ WebSocket connection failed:", err.message);
        testServer.close();
        process.exit(1);
      });
    } catch (e) {
      console.log("✗ WebSocket test failed:", e.message);
      testServer.close();
      process.exit(1);
    }
  }, 500);
  
} catch (e) {
  console.log("✗ Failed to start server:", e.message);
  console.log("\nPossible issues:");
  console.log("- Port 4991 already in use (check with: netstat -ano | findstr 4991)");
  console.log("- Firewall blocking the connection");
  console.log("- Node.js version too old (need 18+)");
  process.exit(1);
}
