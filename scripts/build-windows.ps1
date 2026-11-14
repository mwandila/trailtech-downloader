$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$distRoot = Join-Path $repoRoot 'dist'
$workRoot = Join-Path $distRoot 'windows-build'
$stageRoot = Join-Path $workRoot 'iexpress'
$appRoot = Join-Path $workRoot 'app'
$version = (Get-Content (Join-Path $repoRoot 'extension\manifest.json') -Raw | ConvertFrom-Json).version
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$iexpress = Join-Path $env:WINDIR 'System32\iexpress.exe'

if (-not (Test-Path -LiteralPath $iexpress)) { throw 'Windows IExpress is required to build the setup EXE.' }
if (Test-Path -LiteralPath $workRoot) { Remove-Item -LiteralPath $workRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageRoot, $appRoot | Out-Null

Copy-Item -LiteralPath (Join-Path $repoRoot 'server.js') -Destination $appRoot
Copy-Item -LiteralPath (Join-Path $repoRoot 'package.json') -Destination $appRoot
Copy-Item -LiteralPath (Join-Path $repoRoot 'src') -Destination $appRoot -Recurse
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $stageRoot 'node.exe')
Compress-Archive -Path (Join-Path $appRoot '*') -DestinationPath (Join-Path $stageRoot 'app.zip') -CompressionLevel Optimal
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\packaging\windows\install.ps1') -Destination (Join-Path $stageRoot 'install.ps1')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\packaging\windows\start-engine.vbs') -Destination (Join-Path $stageRoot 'start-engine.vbs')

$sedPath = Join-Path $workRoot 'TVD-Setup.sed'
$setupPath = Join-Path $distRoot "TVD-Setup-$version.exe"
$setupBase = [IO.Path]::GetFileNameWithoutExtension($setupPath)
$sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=1
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$setupPath
FriendlyName=Trail Video Downloader Setup
AppLaunched=powershell.exe -NoLogo -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File install.ps1
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
FILE0="app.zip"
FILE1="node.exe"
FILE2="install.ps1"
FILE3="start-engine.vbs"
[SourceFiles]
SourceFiles0=$stageRoot\
[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
%FILE3%=
"@
Set-Content -LiteralPath $sedPath -Value $sed -Encoding ASCII
$reportPath = Join-Path $distRoot "~$($setupBase).RPT"
$temporaryPattern = '~TVD-Setup*.*'
Get-ChildItem -LiteralPath $distRoot -Filter $temporaryPattern -File -Force | Remove-Item -Force
Set-Content -LiteralPath $reportPath -Value '' -Encoding ASCII
$build = Start-Process -FilePath $iexpress -ArgumentList @('/N', $sedPath) -Wait -PassThru
if ($build.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $setupPath)) { throw "IExpress failed to create $([IO.Path]::GetFileName($setupPath)) (exit $($build.ExitCode))." }

& (Join-Path $PSScriptRoot 'package-extension.ps1')

Remove-Item -LiteralPath $workRoot -Recurse -Force
Get-ChildItem -LiteralPath $distRoot -Filter $temporaryPattern -File -Force | Remove-Item -Force
$extensionZip = Join-Path $distRoot "TVD-extension-$version.zip"

Write-Host "Created $setupPath"
Write-Host "Created $extensionZip"
