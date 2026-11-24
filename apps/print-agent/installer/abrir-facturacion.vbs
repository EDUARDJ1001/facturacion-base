' Abre Facturación como programa de escritorio, sin mostrar ventanas de consola.
' Busca Facturacion.exe en la misma carpeta que este archivo.
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & folder & "\Facturacion.exe"" --escritorio", 0, False
