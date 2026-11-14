$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$distRoot = Join-Path $repoRoot 'dist'
$manifest = Get-Content (Join-Path $repoRoot 'extension\manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version
$installer = Join-Path $distRoot "TVD-Setup-$version.exe"
$extension = Join-Path $distRoot "TVD-extension-$version.zip"
$bundleDir = Join-Path $distRoot 'friends-bundle'
$bundleZip = Join-Path $distRoot "TVD-For-Friends-$version.zip"

foreach ($artifact in @($installer, $extension)) {
    if (-not (Test-Path -LiteralPath $artifact)) { throw "Missing release artifact: $artifact. Run npm run package:windows first." }
}
if (Test-Path -LiteralPath $bundleDir) { Remove-Item -LiteralPath $bundleDir -Recurse -Force }
if (Test-Path -LiteralPath $bundleZip) { Remove-Item -LiteralPath $bundleZip -Force }
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null
Copy-Item -LiteralPath $installer -Destination $bundleDir
Copy-Item -LiteralPath $extension -Destination $bundleDir
$instructions = Get-Content (Join-Path $PSScriptRoot '..\packaging\windows\FRIENDS-INSTALL.txt') -Raw
$instructions.Replace('@VERSION@', $version) | Set-Content -LiteralPath (Join-Path $bundleDir 'INSTALL.txt') -Encoding utf8
Compress-Archive -Path (Join-Path $bundleDir '*') -DestinationPath $bundleZip -CompressionLevel Optimal
Remove-Item -LiteralPath $bundleDir -Recurse -Force
Write-Host "Created $bundleZip"
