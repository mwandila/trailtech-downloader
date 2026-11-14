#!/usr/bin/env node
/**
 * Test script to verify setup is correct
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

console.log("🔍 Testing Trail Video Downloader (TVD) Setup...\n");

let passed = 0;
let failed = 0;

function test(name, check) {
  try {
    if (check()) {
      console.log(`✓ ${name}`);
      passed++;
    } else {
      console.log(`✗ ${name}`);
      failed++;
    }
  } catch (e) {
    console.log(`✗ ${name} (${e.message})`);
    failed++;
  }
}

// Node.js version
test("Node.js version >= 18", () => {
  const version = process.versions.node.split(".")[0];
  return parseInt(version) >= 18;
});

// Required files exist
const requiredFiles = [
  "cli.js",
  "server.js",
  "src/engine.js",
  "src/probe.js",
  "src/state.js",
  "src/ws.js",
  "extension/manifest.json",
  "extension/background.js",
  "extension/content.js",
  "extension/document.js",
  "extension/popup.html",
  "extension/popup.js"
];

for (const file of requiredFiles) {
  test(`File exists: ${file}`, () => {
    return fs.existsSync(path.join(projectRoot, file));
  });
}

// Extension icons exist
const iconSizes = [16, 32, 48, 128];
for (const size of iconSizes) {
  test(`Extension icon ${size}x${size} exists`, () => {
    return fs.existsSync(path.join(projectRoot, "extension", "icons", `icon${size}.png`));
  });
}

// Verify manifest.json is valid JSON
test("Extension manifest.json is valid", () => {
  const manifestPath = path.join(projectRoot, "extension", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return manifest.manifest_version === 3 && manifest.name === "Trail Video Downloader (TVD)";
});

// Verify WebSocket port configuration
test("WebSocket port configured", () => {
  const serverPath = path.join(projectRoot, "server.js");
  const backgroundPath = path.join(projectRoot, "extension", "background.js");
  const serverContent = fs.readFileSync(serverPath, "utf8");
  const backgroundContent = fs.readFileSync(backgroundPath, "utf8");
  
  const serverMatch = serverContent.match(/PORT = Number\(.*\) \|\| (\d+)/);
  const backgroundMatch = backgroundContent.match(/ENGINE_WS_URL = "ws:\/\/127\.0\.0\.1:(\d+)\//);
  
  if (!serverMatch || !backgroundMatch) return false;
  
  const serverPort = serverMatch[1];
  const backgroundPort = backgroundMatch[1];
  
  return serverPort === backgroundPort;
});

// Summary
console.log(`\n${"=".repeat(50)}`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`${"=".repeat(50)}\n`);

if (failed === 0) {
  console.log("✅ All tests passed! Setup is complete.");
  console.log("\nNext steps:");
  console.log("1. Start the engine:  node server.js");
  console.log("2. Load extension in Chrome from ./extension folder");
  console.log("3. See SETUP.md for detailed instructions");
} else {
  console.log("❌ Some tests failed. Please review the errors above.");
  console.log("\nCommon fixes:");
  console.log("- Regenerate icons: npm run icons");
  console.log("- Check file permissions");
  console.log("- Ensure all files are present");
  process.exit(1);
}
