Option Explicit
Dim shell, fso, appDir, nodePath, serverPath, linksPath, processEnv
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
nodePath = fso.BuildPath(fso.BuildPath(appDir, "runtime"), "node.exe")
serverPath = fso.BuildPath(appDir, "server.js")
linksPath = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Microsoft\WinGet\Links")
Set processEnv = shell.Environment("PROCESS")
processEnv("PATH") = fso.BuildPath(appDir, "bin") & ";" & linksPath & ";" & processEnv("PATH")
shell.CurrentDirectory = appDir
shell.Run Chr(34) & nodePath & Chr(34) & " " & Chr(34) & serverPath & Chr(34), 0, False
