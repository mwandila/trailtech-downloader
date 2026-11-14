#!/usr/bin/env node
/**
 * Generate simple PNG icons for the extension
 * Uses Canvas API (available in Node.js 18+ with node-canvas or via data URLs)
 * For simplicity, creates SVG-based icons that browsers can display
 */

import fs from "node:fs";
import path from "node:path";

const sizes = [16, 32, 48, 128];
const iconDir = path.join(process.cwd(), "extension", "icons");

// SVG template with download arrow
function createSVG(size) {
  const arrowSize = size * 0.5;
  const centerX = size / 2;
  const centerY = size / 2;
  const strokeWidth = Math.max(2, size / 16);
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#grad)" rx="${size * 0.1}"/>
  <g stroke="white" fill="white" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
    <line x1="${centerX}" y1="${centerY - arrowSize/3}" x2="${centerX}" y2="${centerY + arrowSize/3}" />
    <polyline points="${centerX - arrowSize/4},${centerY + arrowSize/6} ${centerX},${centerY + arrowSize/3} ${centerX + arrowSize/4},${centerY + arrowSize/6}" fill="none"/>
    <line x1="${centerX - arrowSize/3}" y1="${centerY + arrowSize/2}" x2="${centerX + arrowSize/3}" y2="${centerY + arrowSize/2}" />
  </g>
</svg>`;
}

// Ensure directory exists
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

console.log("Generating SVG-based icons...");

for (const size of sizes) {
  const svg = createSVG(size);
  const filename = path.join(iconDir, `icon${size}.svg`);
  fs.writeFileSync(filename, svg);
  console.log(`✓ Created ${filename}`);
}

// Create a simple conversion note
const note = `# Icon Files Generated

SVG files have been created. Chrome extensions can use SVG icons.

If you need PNG files:
1. Open extension/icons/generate-simple-icons.html in a browser
2. Click "Generate All Icons" to download PNG versions
3. Place the downloaded PNG files in this directory

Alternatively, use an online converter:
- https://cloudconvert.com/svg-to-png
- https://convertio.co/svg-png/

Just upload the SVG files and convert to the respective sizes.
`;

fs.writeFileSync(path.join(iconDir, "GENERATED.md"), note);

console.log("\n✅ All icons generated successfully!");
console.log("📝 Note: SVG icons created. Chrome supports SVG in extensions.");
console.log("   If you need PNG, see extension/icons/GENERATED.md");
