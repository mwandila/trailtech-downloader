# Video and MP3 downloads

The browser extension can send a YouTube page URL to the local engine. The engine runs yt-dlp directly so it can select the requested formats and merge adaptive video and audio streams.

## Install the required tools

On Windows, install yt-dlp:

```powershell
winget install yt-dlp
```

Install FFmpeg as well. yt-dlp needs it to merge separate video/audio streams and to convert audio to MP3. Then restart the engine so it can find both programs:

```powershell
node server.js
```

Check that both commands are on PATH:

```powershell
yt-dlp --version
ffmpeg -version
```

If yt-dlp is installed through Python instead, `py -m yt_dlp` is also detected by the engine.

## Download a video or audio track

1. Start the engine with `node server.js`.
2. Open a YouTube video page. A small blue control appears in the upper-right corner of the video.
3. Choose a resolution or **MP3 audio**, then click **Download**. The result is saved in your user **Downloads** folder.

To use another folder, set `DOWNLOADER_DIR` before starting the engine, for example:

```powershell
$env:DOWNLOADER_DIR = "D:\Videos"
node server.js
```

The resolution choices select the best available video at or below that height. YouTube's available formats vary by video. With FFmpeg, the engine selects a video-only stream plus an audio stream and merges them. Without FFmpeg, it chooses a pre-merged format so the saved video still includes sound, though the available resolution may be lower. The extension's ordinary URL downloader also downloads direct MP3 URLs without conversion.

TVD downloads fragmented video streams 8 fragments in parallel by default. Set `DOWNLOADER_CONCURRENT_FRAGMENTS` (1–16) to change that. The engine also runs up to 4 download jobs at once by default; `DOWNLOADER_MAX_CONCURRENT` changes that limit (1–8).

yt-dlp supports many video sites beyond YouTube. YouTube page links are routed to yt-dlp automatically; direct media/file URLs use the segmented HTTP downloader. Private, age-restricted, or otherwise inaccessible pages can still require site-specific authentication or fail at the source.
