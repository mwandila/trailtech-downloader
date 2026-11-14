# Windows release packaging

Run `npm run package:windows` from the repository root on Windows. It creates:

- `dist/TVD-Setup-1.1.1.exe` (version follows the extension manifest): self-extracting per-user installer. It bundles the Node runtime and engine; if available, Winget installs `yt-dlp` and FFmpeg, which are required for extractor-based video/audio downloads and MP3 conversion.
- `dist/TVD-extension-1.1.1.zip`: Chrome extension archive with `manifest.json` at the archive root.

The installer does not install or sideload the extension. Users install the extension separately. The current extension offers YouTube downloads, which Chrome Web Store policy troubleshooting names as a common reason for rejection; do not submit this build to the Store without first resolving that policy issue.

The installer is unsigned. Windows SmartScreen may show an unknown-publisher warning until the release is signed with a code-signing certificate.
