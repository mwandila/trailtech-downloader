$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content (Join-Path $repoRoot 'extension\manifest.json') -Raw | ConvertFrom-Json
$distRoot = Join-Path $repoRoot 'dist'
$archive = Join-Path $distRoot "TVD-extension-$($manifest.version).zip"
$packageRoot = Join-Path $distRoot 'extension-package'
New-Item -ItemType Directory -Force -Path $distRoot | Out-Null
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
if (Test-Path -LiteralPath $packageRoot) { Remove-Item -LiteralPath $packageRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot 'icons') | Out-Null
foreach ($name in @('manifest.json', 'background.js', 'content.js', 'document.js', 'popup.html', 'popup.js')) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "extension\$name") -Destination $packageRoot
}
foreach ($size in @(16, 32, 48, 128)) {
    $name = "icon$size.png"
    Copy-Item -LiteralPath (Join-Path $repoRoot "extension\icons\$name") -Destination (Join-Path $packageRoot 'icons')
}
Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $archive -CompressionLevel Optimal
Remove-Item -LiteralPath $packageRoot -Recurse -Force
Write-Host "Created $archive"
