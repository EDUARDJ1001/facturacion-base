' Inicia el agente de impresión oculto (al iniciar sesión cualquier usuario).
' Busca AgenteImpresion.exe en la misma carpeta que este archivo.
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & folder & "\AgenteImpresion.exe"" --run", 0, False
