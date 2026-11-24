; Instalador de caja de Facturación (Inno Setup 6).
; Instala el sistema completo en C:\Facturacion para todos los usuarios de la PC, como
; programa de escritorio conectado directo a la base de datos. La conexión a la base se
; configura al abrir el programa por primera vez (pantalla "Conectar base de datos").
;
; Se compila con: npm run build:caja-installer   (scripts/build-caja-installer.mjs pasa
; la versión y las rutas de lo compilado; con valores por defecto también se puede abrir
; y compilar directo en Inno Setup).

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef SourceApp
  #define SourceApp "..\..\backend\dist-exe\Facturacion"
#endif
#ifndef AgentExe
  #define AgentExe "..\dist-exe\AgenteImpresion.exe"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\..\instaladores"
#endif
#define IconFile "..\..\backend\installer\facturacion.ico"

[Setup]
; Identificador fijo: Windows reconoce las actualizaciones y la desinstalación por él. No cambiarlo.
AppId={{AEE80931-C1F9-41F5-A730-9CB00EBF8C4F}
AppName=Facturación
AppVersion={#AppVersion}
AppVerName=Facturación {#AppVersion} (caja)
AppPublisher=Facturación
UninstallDisplayName=Facturación (caja)
UninstallDisplayIcon={app}\facturacion.ico
DefaultDirName=C:\Facturacion
DisableDirPage=yes
DefaultGroupName=Facturación
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir={#OutputDir}
OutputBaseFilename=InstalarCaja-{#AppVersion}
SetupIconFile={#IconFile}
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
; Los procesos se cierran en PrepareToInstall (corren ocultos, sin ventana).
CloseApplications=no

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un ícono en el escritorio"; GroupDescription: "Accesos directos:"

[Dirs]
; Versiones del programa: el sistema instala ahí las actualizaciones con el usuario de
; Windows (sin administrador). Cada versión va firmada y Facturacion.exe la comprueba al abrir.
Name: "{app}\versiones"; Permissions: users-modify

[Files]
Source: "{#SourceApp}\*"; DestDir: "{app}"; Excludes: "config.env,facturacion.log,facturacion.log.anterior"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#AgentExe}"; DestDir: "{app}\agente"; Flags: ignoreversion
Source: "iniciar-agente.vbs"; DestDir: "{app}\agente"; Flags: ignoreversion
Source: "abrir-facturacion.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#IconFile}"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; La versión que trae este instalador se copia completa y limpia: si ya estaba (otra
; compilación del mismo número), sus archivos viejos no deben quedar mezclados.
Type: filesandordirs; Name: "{app}\versiones\{#AppVersion}"
; Estructura anterior a las versiones (todo junto al .exe): ahora vive en versiones\<versión>.
Type: filesandordirs; Name: "{app}\pantallas"
Type: filesandordirs; Name: "{app}\migrations"
Type: filesandordirs; Name: "{app}\migrations-mssql"
Type: filesandordirs; Name: "{app}\assets"
Type: filesandordirs; Name: "{app}\data"
; Restos del instalador anterior (IExpress).
Type: files; Name: "{app}\instalar-caja.ps1"
Type: files; Name: "{app}\desinstalar-caja.ps1"
Type: files; Name: "{app}\Desinstalar.cmd"
Type: files; Name: "{app}\version.txt"
Type: files; Name: "{app}\agente\iniciar-agente.vbs"
Type: files; Name: "{group}\Asistente de conexión de Facturación.lnk"
Type: files; Name: "{group}\Desinstalar Facturación (caja).lnk"

[Icons]
Name: "{group}\Facturación"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\abrir-facturacion.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\facturacion.ico"; Comment: "Abrir Facturación"
Name: "{commondesktop}\Facturación"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\abrir-facturacion.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\facturacion.ico"; Comment: "Abrir Facturación"; Tasks: desktopicon
Name: "{group}\Editar configuración de Facturación"; Filename: "{sys}\notepad.exe"; Parameters: """{app}\config.env"""; WorkingDir: "{app}"; IconFilename: "{app}\facturacion.ico"; Comment: "Configuración avanzada (config.env)"
Name: "{group}\Desinstalar Facturación"; Filename: "{uninstallexe}"; IconFilename: "{app}\facturacion.ico"
; El agente de impresión arranca oculto al iniciar sesión cualquier usuario.
Name: "{commonstartup}\Facturación - Agente de impresión"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\agente\iniciar-agente.vbs"""; WorkingDir: "{app}\agente"

[Run]
; config.env con claves de sesión propias (solo si no existe: al actualizar se conserva).
Filename: "{app}\Facturacion.exe"; Parameters: "--crear-config"; WorkingDir: "{app}"; StatusMsg: "Preparando la configuración..."; Flags: runhidden waituntilterminated
; El programa guarda ahí la conexión que se configura desde la pantalla inicial.
Filename: "{sys}\icacls.exe"; Parameters: """{app}\config.env"" /grant *S-1-5-32-545:M /Q"; StatusMsg: "Preparando la configuración..."; Flags: runhidden waituntilterminated
; Al terminar: abrir el programa como el usuario (no como administrador).
Filename: "{sys}\wscript.exe"; Parameters: """{app}\abrir-facturacion.vbs"""; WorkingDir: "{app}"; Description: "Abrir Facturación ahora"; Flags: postinstall nowait skipifsilent runasoriginaluser

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Facturacion.exe"; Flags: runhidden; RunOnceId: "CerrarFacturacion"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM AgenteImpresion.exe"; Flags: runhidden; RunOnceId: "CerrarAgente"

[UninstallDelete]
; Incluye las versiones descargadas desde el sistema (no las copió el instalador).
Type: filesandordirs; Name: "{app}\versiones"
Type: files; Name: "{app}\facturacion.log"
Type: files; Name: "{app}\facturacion.log.anterior"

[Code]
const
  OLD_UNINSTALL_KEY = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\FacturacionCaja';
  SERVER_UNINSTALL_KEY = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\Facturacion';

procedure RunHidden(const FileName, Params: String);
var
  ResultCode: Integer;
begin
  Exec(FileName, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

{ No mezclar con el modo servidor instalado en la misma carpeta. }
function InitializeSetup(): Boolean;
var
  Location: String;
begin
  Result := True;
  if RegQueryStringValue(HKLM64, SERVER_UNINSTALL_KEY, 'InstallLocation', Location) and
     (CompareText(RemoveBackslashUnlessRoot(Location), 'C:\Facturacion') = 0) then
  begin
    MsgBox('Esta PC tiene Facturación instalado como servidor en C:\Facturacion.' + #13#10 +
      'Desinstálalo primero (Configuración > Aplicaciones > Facturación) para instalar la caja.', mbError, MB_OK);
    Result := False;
  end;
end;

{ Antes de copiar: cerrar el sistema y el agente, reparar permisos de versiones anteriores
  y quitar la entrada del instalador anterior en Aplicaciones. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  RunHidden(ExpandConstant('{sys}\taskkill.exe'), '/F /IM Facturacion.exe');
  RunHidden(ExpandConstant('{sys}\taskkill.exe'), '/F /IM AgenteImpresion.exe');
  { Ventanas del sistema (Edge/Chrome con el perfil propio de Facturación, de cualquier
    usuario). Las demás ventanas del navegador no se tocan. }
  RunHidden(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter ''Name=''''msedge.exe'''' OR Name=''''chrome.exe'''''' | ' +
    'Where-Object { $_.CommandLine -like ''*\Facturacion\ventana*'' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"');
  if DirExists('C:\Facturacion') then
    RunHidden(ExpandConstant('{sys}\icacls.exe'), '"C:\Facturacion" /reset /T /Q');
  if RegKeyExists(HKLM64, OLD_UNINSTALL_KEY) then
    RegDeleteKeyIncludingSubkeys(HKLM64, OLD_UNINSTALL_KEY);
  Sleep(1000);
end;

{ Al desinstalar: preguntar si se conserva la conexión a la base. }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ConfigFile: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    ConfigFile := ExpandConstant('{app}\config.env');
    if FileExists(ConfigFile) then
    begin
      if (not UninstallSilent) and (MsgBox('¿Conservar la configuración (conexión a la base de datos) para reinstalar después?',
        mbConfirmation, MB_YESNO) = IDNO) then
        DeleteFile(ConfigFile);
    end;
    RemoveDir(ExpandConstant('{app}\agente'));
    RemoveDir(ExpandConstant('{app}'));
  end;
end;
