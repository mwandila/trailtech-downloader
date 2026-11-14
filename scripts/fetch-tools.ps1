$ErrorActionPreference = 'Stop'
# Downloads yt-dlp.exe and FFmpeg (Gyan essentials) at BUILD time so the
# installer itself never needs to download anything on your friend's PC.
# Results are cached in dist\tools\ and reused across builds.

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$toolsDir = Join-Path $repoRoot 'dist\tools'
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

$ytDlp = Join-Path $toolsDir 'yt-dlp.exe'
if (-not (Test-Path -LiteralPath $ytDlp)) {
    Write-Host 'Downloading yt-dlp.exe (latest release)...'
    Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile $ytDlp
} else { Write-Host 'yt-dlp.exe cached.' }

$ffmpegExe = Join-Path $toolsDir 'ffmpeg.exe'
$ffprobeExe = Join-Path $toolsDir 'ffprobe.exe'
if (-not (Test-Path -LiteralPath $ffmpegExe) -or -not (Test-Path -LiteralPath $ffprobeExe)) {
    $zip = Join-Path $toolsDir 'ffmpeg-essentials.zip'
    Write-Host 'Downloading FFmpeg essentials (~90 MB, one time)...'
    Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile $zip
    Write-Host 'Extracting ffmpeg.exe / ffprobe.exe...'
    $extractDir = Join-Path $toolsDir 'ffmpeg-unpack'
    if (Test-Path -LiteralPath $extractDir) { Remove-Item -LiteralPath $extractDir -Recurse -Force }
    Expand-Archive -LiteralPath $zip -DestinationPath $extractDir -Force
    $found = Get-ChildItem -Path $extractDir -Recurse -Include 'ffmpeg.exe', 'ffprobe.exe' -File
    foreach ($exe in $found) { Copy-Item -LiteralPath $exe.FullName -Destination (Join-Path $toolsDir $exe.Name) -Force }
    Remove-Item -LiteralPath $extractDir -Recurse -Force
    Remove-Item -LiteralPath $zip -Force
} else { Write-Host 'ffmpeg.exe / ffprobe.exe cached.' }

Get-ChildItem $toolsDir -File | ForEach-Object { '{0,10:N1} MB  {1}' -f ($_.Length / 1MB), $_.Name }
