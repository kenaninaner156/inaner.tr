Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
serverFile = scriptDir & "\server.mjs"

nodeExe = "node.exe"
If objFSO.FileExists("C:\Program Files\nodejs\node.exe") Then
    nodeExe = """C:\Program Files\nodejs\node.exe"""
End If

objShell.CurrentDirectory = scriptDir
' Arka planda yerel donanim sunucusunu sessizce baslat
objShell.Run nodeExe & " """ & serverFile & """", 0, False

' Sunucunun dinleme portuna gecmesi icin kisa bekleme
WScript.Sleep 500

' Kullanicinin aktif masaustunde varsayilan tarayiciyi ac
objShell.Run "http://localhost:3456", 1, False
