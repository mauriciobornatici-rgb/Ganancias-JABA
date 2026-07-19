' Lanzador oculto del runner de backup (evita que se abra una ventana cada hora).
' Lo usa la tarea programada "JABA Backup Automatico".
Set shell = CreateObject("WScript.Shell")
projectDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = projectDir
shell.Run "node """ & projectDir & "\scripts\backup-runner.mjs""", 0, False
