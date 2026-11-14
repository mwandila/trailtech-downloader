#!/usr/bin/env powershell
# Simple yt-dlp installer

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Installing yt-dlp for YouTube Downloads " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$installed = $false

# Try Method 1: winget
Write-Host "[1/3] Trying winget..." -ForegroundColor Yellow
if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "  Running: winget install yt-dlp" -ForegroundColor Gray
    winget install yt-dlp --accept-source-agreements --accept-package-agreements 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  SUCCESS via winget!" -ForegroundColor Green
        $installed = $true
    }
} else {
    Write-Host "  winget not found, skipping..." -ForegroundColor Gray
}

Write-Host ""

# Try Method 2: pip
if (-not $installed) {
    Write-Host "[2/3] Trying pip (Python)..." -ForegroundColor Yellow
    if (Get-Command pip -ErrorAction SilentlyContinue) {
        Write-Host "  Running: pip install yt-dlp" -ForegroundColor Gray
        pip install -U yt-dlp 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  SUCCESS via pip!" -ForegroundColor Green
            $installed = $true
        }
    } else {
        Write-Host "  pip not found, skipping..." -ForegroundColor Gray
    }
}

Write-Host ""

# Try Method 3: Direct download
if (-not $installed) {
    Write-Host "[3/3] Trying direct download..." -ForegroundColor Yellow
    try {
        $downloadUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
        $installPath = "$env:USERPROFILE\AppData\Local\Microsoft\WindowsApps\yt-dlp.exe"
        
        Write-Host "  Downloading from GitHub..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $downloadUrl -OutFile $installPath -UseBasicParsing
        
        Write-Host "  SUCCESS via direct download!" -ForegroundColor Green
        $installed = $true
    }
    catch {
        Write-Host "  Download failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan

# Verify
if ($installed) {
    Write-Host " Verifying installation..." -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    
    Start-Sleep -Seconds 2
    
    try {
        $version = & yt-dlp --version 2>&1
        Write-Host "SUCCESS! yt-dlp version: $version" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "1. Restart your engine: node server.js" -ForegroundColor White
        Write-Host "2. Reload browser extension" -ForegroundColor White
        Write-Host "3. Try a YouTube URL!" -ForegroundColor White
    }
    catch {
        Write-Host "Installed but not in PATH yet." -ForegroundColor Yellow
        Write-Host "Close and reopen PowerShell, then run: yt-dlp --version" -ForegroundColor White
    }
} else {
    Write-Host " All methods failed!" -ForegroundColor Red
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Manual installation:" -ForegroundColor Yellow
    Write-Host "1. Visit: https://github.com/yt-dlp/yt-dlp/releases" -ForegroundColor White
    Write-Host "2. Download: yt-dlp.exe" -ForegroundColor White
    Write-Host "3. Move to: C:\Windows\System32\" -ForegroundColor White
}

Write-Host ""
