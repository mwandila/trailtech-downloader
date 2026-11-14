' TVD setup launcher: runs install.ps1 with a fully hidden console window.
' IExpress launches this (wscript.exe = GUI process), so no PowerShell
' console flashes or lingers behind the wizard.
Option Explicit
Dim shell, scriptDir, cmd
Set shell = CreateObject("WScript.Shell")
scriptDir = shell.GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell.exe -NoLogo -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & _
      scriptDir & "\install.ps1"""
' window style 0 = hidden; True = wait for install to finish so IExpress
' keeps its temp folder alive until the wizard has completed.
shell.Run cmd, 0, True
