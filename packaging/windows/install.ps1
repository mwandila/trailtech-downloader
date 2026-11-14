$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$defaultInstallRoot = Join-Path $env:LOCALAPPDATA 'Programs\Trail Video Downloader'
$script:installRoot = $defaultInstallRoot
$script:installing = $false
$script:engineWasRunning = $false
$script:toolWarnings = [System.Collections.Generic.List[string]]::new()

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Trail Video Downloader Setup'
$form.ClientSize = New-Object System.Drawing.Size(560, 390)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.StartPosition = 'CenterScreen'
$form.BackColor = [System.Drawing.Color]::White

$header = New-Object System.Windows.Forms.Panel
$header.Dock = 'Top'
$header.Height = 72
$header.BackColor = [System.Drawing.Color]::FromArgb(24, 112, 220)
$form.Controls.Add($header)
$headerTitle = New-Object System.Windows.Forms.Label
$headerTitle.Text = 'Trail Video Downloader'
$headerTitle.ForeColor = [System.Drawing.Color]::White
$headerTitle.Font = New-Object System.Drawing.Font('Segoe UI', 17, [System.Drawing.FontStyle]::Bold)
$headerTitle.AutoSize = $true
$headerTitle.Location = New-Object System.Drawing.Point(22, 10)
$header.Controls.Add($headerTitle)
$headerSubtitle = New-Object System.Windows.Forms.Label
$headerSubtitle.Text = 'TVD setup'
$headerSubtitle.ForeColor = [System.Drawing.Color]::FromArgb(225, 240, 255)
$headerSubtitle.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$headerSubtitle.AutoSize = $true
$headerSubtitle.Location = New-Object System.Drawing.Point(25, 45)
$header.Controls.Add($headerSubtitle)

$content = New-Object System.Windows.Forms.Panel
$content.Location = New-Object System.Drawing.Point(24, 91)
$content.Size = New-Object System.Drawing.Size(512, 232)
$content.Anchor = 'Top,Left,Right,Bottom'
$form.Controls.Add($content)

$footer = New-Object System.Windows.Forms.Panel
$footer.Dock = 'Bottom'
$footer.Height = 54
$footer.BackColor = [System.Drawing.Color]::FromArgb(247, 249, 252)
$form.Controls.Add($footer)

$backButton = New-Object System.Windows.Forms.Button
$backButton.Text = '< Back'
$backButton.Size = New-Object System.Drawing.Size(86, 31)
$backButton.Location = New-Object System.Drawing.Point(290, 11)
$backButton.FlatStyle = 'System'
$footer.Controls.Add($backButton)

$nextButton = New-Object System.Windows.Forms.Button
$nextButton.Text = 'Next >'
$nextButton.Size = New-Object System.Drawing.Size(95, 31)
$nextButton.Location = New-Object System.Drawing.Point(382, 11)
$nextButton.FlatStyle = 'System'
$nextButton.BackColor = [System.Drawing.Color]::FromArgb(24, 112, 220)
$footer.Controls.Add($nextButton)

$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Text = 'Cancel'
$cancelButton.Size = New-Object System.Drawing.Size(75, 31)
$cancelButton.Location = New-Object System.Drawing.Point(484, 11)
$cancelButton.FlatStyle = 'System'
$footer.Controls.Add($cancelButton)

function Add-BodyLabel([string]$Text, [int]$Top, [int]$Height = 48) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Text
    $label.Location = New-Object System.Drawing.Point(4, $Top)
    $label.Size = New-Object System.Drawing.Size(498, $Height)
    $label.Font = New-Object System.Drawing.Font('Segoe UI', 10)
    $label.ForeColor = [System.Drawing.Color]::FromArgb(38, 47, 60)
    $content.Controls.Add($label)
    return $label
}

function Add-CheckBox([string]$Text, [int]$Top, [bool]$Checked) {
    $check = New-Object System.Windows.Forms.CheckBox
    $check.Text = $Text
    $check.Location = New-Object System.Drawing.Point(5, $Top)
    $check.Size = New-Object System.Drawing.Size(490, 25)
    $check.Checked = $Checked
    $check.Font = New-Object System.Drawing.Font('Segoe UI', 9)
    $content.Controls.Add($check)
    return $check
}

function Set-Page([int]$Page) {
    $content.Controls.Clear()
    $backButton.Visible = $Page -in @(2, 3)
    $cancelButton.Visible = $Page -lt 4
    $backButton.Enabled = $Page -in @(2, 3)
    $nextButton.Enabled = $true

    switch ($Page) {
        0 {
            Add-BodyLabel 'This wizard installs the TVD download engine for your Windows account.' 8 54 | Out-Null
            Add-BodyLabel 'The Chrome extension is a separate install. You will load it from the TVD extension ZIP after this setup finishes.' 72 72 | Out-Null
            Add-BodyLabel 'Click Next to choose where TVD is installed.' 166 32 | Out-Null
            $nextButton.Text = 'Next >'
        }
        1 {
            Add-BodyLabel 'Choose the folder where the TVD engine will be installed:' 6 30 | Out-Null
            $pathBox = New-Object System.Windows.Forms.TextBox
            $pathBox.Name = 'InstallPath'
            $pathBox.Text = $script:installRoot
            $pathBox.Location = New-Object System.Drawing.Point(5, 43)
            $pathBox.Size = New-Object System.Drawing.Size(390, 25)
            $pathBox.Font = New-Object System.Drawing.Font('Segoe UI', 9)
            $content.Controls.Add($pathBox)
            $browseButton = New-Object System.Windows.Forms.Button
            $browseButton.Text = 'Browse...'
            $browseButton.Location = New-Object System.Drawing.Point(405, 41)
            $browseButton.Size = New-Object System.Drawing.Size(88, 27)
            $browseButton.Add_Click({
                $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
                $dialog.SelectedPath = $pathBox.Text
                if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) { $pathBox.Text = $dialog.SelectedPath }
                $dialog.Dispose()
            })
            $content.Controls.Add($browseButton)
            $script:dependencyCheck = Add-CheckBox 'Install yt-dlp and FFmpeg with Winget if they are missing (recommended)' 92 $true
            $script:startupCheck = Add-CheckBox 'Start the TVD engine automatically when I sign in' 126 $true
            Add-BodyLabel 'yt-dlp and FFmpeg enable extractor-based video downloads, audio merging, and MP3 conversion.' 166 50 | Out-Null
            $nextButton.Text = 'Next >'
        }
        2 {
            Add-BodyLabel 'Ready to install Trail Video Downloader.' 8 30 | Out-Null
            Add-BodyLabel "Install folder:`r`n$script:installRoot" 48 55 | Out-Null
            $autoTools = if ($script:dependencyCheck.Checked) { 'Missing media tools will be installed through Winget.' } else { 'Media tools will not be installed automatically.' }
            $autoStart = if ($script:startupCheck.Checked) { 'The engine will start when you sign in.' } else { 'The engine will only start when you launch it manually.' }
            Add-BodyLabel "$autoTools`r`n$autoStart`r`nIf TVD is running, setup will stop it briefly before updating. Active downloads will be interrupted." 116 90 | Out-Null
            $nextButton.Text = 'Install'
        }
        3 {
            Add-BodyLabel 'Installing TVD. This can take a few minutes if media tools need to be downloaded.' 8 48 | Out-Null
            $progress = New-Object System.Windows.Forms.ProgressBar
            $progress.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
            $progress.MarqueeAnimationSpeed = 24
            $progress.Location = New-Object System.Drawing.Point(5, 68)
            $progress.Size = New-Object System.Drawing.Size(490, 20)
            $content.Controls.Add($progress)
            $script:statusLabel = Add-BodyLabel 'Copying application files...' 105 54
            $nextButton.Enabled = $false
            $backButton.Enabled = $false
            $cancelButton.Enabled = $false
        }
        4 {
            if ($script:installSucceeded) {
                Add-BodyLabel 'TVD was installed successfully.' 8 35 | Out-Null
                Add-BodyLabel "Install folder:`r`n$script:installRoot" 52 55 | Out-Null
                Add-BodyLabel 'The engine has started and will start automatically at sign-in if selected. Load the Chrome extension separately.' 119 65 | Out-Null
                if ($script:toolWarnings.Count -gt 0) {
                    Add-BodyLabel ($script:toolWarnings -join "`r`n") 181 48 | Out-Null
                }
            } else {
                Add-BodyLabel 'TVD could not finish installing.' 8 35 | Out-Null
                Add-BodyLabel $script:installError 52 135 | Out-Null
            }
            $nextButton.Text = 'Finish'
            $cancelButton.Visible = $false
            $backButton.Visible = $false
        }
    }
}

function Wait-ProcessWithUi($Process) {
    while (-not $Process.HasExited) {
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 150
    }
    return $Process.ExitCode
}

function Get-TvdEngineProcesses {
    $expectedNode = [System.IO.Path]::GetFullPath((Join-Path $script:installRoot 'runtime\node.exe'))
    $expectedServer = [System.IO.Path]::GetFullPath((Join-Path $script:installRoot 'server.js'))
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object {
        $_.ExecutablePath -and $_.CommandLine -and
        [string]::Equals([System.IO.Path]::GetFullPath($_.ExecutablePath), $expectedNode, [System.StringComparison]::OrdinalIgnoreCase) -and
        $_.CommandLine.IndexOf($expectedServer, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    }
}

function Stop-TvdEngine {
    $processes = @(Get-TvdEngineProcesses)
    if ($processes.Count -eq 0) { return }
    $script:engineWasRunning = $true
    $script:statusLabel.Text = 'Stopping the existing TVD engine...'
    [System.Windows.Forms.Application]::DoEvents()
    foreach ($engineProcess in $processes) {
        Stop-Process -Id $engineProcess.ProcessId -Force -ErrorAction Stop
    }
    foreach ($engineProcess in $processes) {
        Wait-Process -Id $engineProcess.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
    }
    if (@(Get-TvdEngineProcesses).Count -gt 0) {
        throw 'The existing TVD engine did not stop. Close it from Task Manager, then run setup again.'
    }
}

function Install-Tvd {
    $script:installing = $true
    Set-Page 3
    [System.Windows.Forms.Application]::DoEvents()
    try {
        New-Item -ItemType Directory -Force -Path $script:installRoot, (Join-Path $script:installRoot 'runtime') | Out-Null
        Stop-TvdEngine
        $script:statusLabel.Text = 'Copying application files...'
        [System.Windows.Forms.Application]::DoEvents()
        Copy-Item -LiteralPath (Join-Path $sourceRoot 'node.exe') -Destination (Join-Path $script:installRoot 'runtime\node.exe') -Force
        Expand-Archive -LiteralPath (Join-Path $sourceRoot 'app.zip') -DestinationPath $script:installRoot -Force
        Copy-Item -LiteralPath (Join-Path $sourceRoot 'start-engine.vbs') -Destination (Join-Path $script:installRoot 'start-engine.vbs') -Force

        if ($script:dependencyCheck.Checked) {
            $env:PATH = "$(Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links');$env:PATH"
            $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
            $tools = @()
            if (-not (Get-Command yt-dlp.exe -ErrorAction SilentlyContinue)) { $tools += @{ Name = 'yt-dlp'; Id = 'yt-dlp.yt-dlp' } }
            if (-not (Get-Command ffmpeg.exe -ErrorAction SilentlyContinue)) { $tools += @{ Name = 'FFmpeg'; Id = 'Gyan.FFmpeg.Essentials' } }
            foreach ($tool in $tools) {
                if (-not $winget) {
                    $script:toolWarnings.Add("Winget is unavailable. Install $($tool.Name) later with: winget install --id $($tool.Id) --exact")
                    continue
                }
                $script:statusLabel.Text = "Installing $($tool.Name) through Winget..."
                [System.Windows.Forms.Application]::DoEvents()
                $args = @('install', '--id', $tool.Id, '--exact', '--scope', 'user', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity')
                $proc = Start-Process -FilePath $winget.Source -ArgumentList $args -WindowStyle Hidden -PassThru
                $code = Wait-ProcessWithUi $proc
                if ($code -ne 0) { $script:toolWarnings.Add("$($tool.Name) did not install. You can install it later with: winget install --id $($tool.Id) --exact") }
            }
        }

        $script:statusLabel.Text = 'Creating shortcuts and starting the engine...'
        [System.Windows.Forms.Application]::DoEvents()
        $shell = New-Object -ComObject WScript.Shell
        $startupFolder = [Environment]::GetFolderPath('Startup')
        $startupShortcut = Join-Path $startupFolder 'Trail Video Downloader Engine.lnk'
        if ($script:startupCheck.Checked) {
            $shortcut = $shell.CreateShortcut($startupShortcut)
            $shortcut.TargetPath = "$env:WINDIR\System32\wscript.exe"
            $shortcut.Arguments = "`"$(Join-Path $script:installRoot 'start-engine.vbs')`""
            $shortcut.WorkingDirectory = $script:installRoot
            $shortcut.Description = 'Start the Trail Video Downloader local engine'
            $shortcut.Save()
        } elseif (Test-Path -LiteralPath $startupShortcut) {
            Remove-Item -LiteralPath $startupShortcut -Force
        }
        Start-Process -FilePath "$env:WINDIR\System32\wscript.exe" -ArgumentList @("`"$(Join-Path $script:installRoot 'start-engine.vbs')`"") -WindowStyle Hidden
        $script:installSucceeded = $true
    } catch {
        $script:installSucceeded = $false
        $script:installError = $_.Exception.Message
        if ($script:engineWasRunning -and (Test-Path -LiteralPath (Join-Path $script:installRoot 'start-engine.vbs'))) {
            try {
                Start-Process -FilePath "$env:WINDIR\System32\wscript.exe" -ArgumentList @("`"$(Join-Path $script:installRoot 'start-engine.vbs')`"") -WindowStyle Hidden
            } catch { }
        }
    } finally {
        $script:installing = $false
    }
    Set-Page 4
}

$nextButton.Add_Click({
    if ($script:page -eq 0) {
        $script:page = 1
        Set-Page 1
    } elseif ($script:page -eq 1) {
        $pathControl = $content.Controls['InstallPath']
        if ([string]::IsNullOrWhiteSpace($pathControl.Text)) {
            [System.Windows.Forms.MessageBox]::Show($form, 'Choose an install folder first.', 'TVD Setup', 'OK', 'Warning') | Out-Null
            return
        }
        $script:installRoot = [System.IO.Path]::GetFullPath($pathControl.Text.Trim())
        $script:page = 2
        Set-Page 2
    } elseif ($script:page -eq 2) {
        $script:page = 3
        Install-Tvd
        $script:page = 4
    } else {
        $form.Close()
    }
})
$backButton.Add_Click({
    if ($script:page -eq 2) { $script:page = 1; Set-Page 1 }
})
$cancelButton.Add_Click({ if (-not $script:installing) { $form.Close() } })
$form.Add_FormClosing({ if ($script:installing) { $_.Cancel = $true } })
$script:page = 0
Set-Page 0
[void]$form.ShowDialog()
