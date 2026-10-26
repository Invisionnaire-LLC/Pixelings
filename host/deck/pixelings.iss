; The Windows installer for the GitHub release: what install-app.ps1 does,
; as a Setup .exe. Installs Pixelings for this user (no admin needed) with a
; Start menu shortcut and starts it; Apps & features can remove it. The app
; then starts at login by itself (its tray menu has the switch).
;
; Built by `npm run release` (build-app.js), which passes AppVersion,
; SourceDir (the packaged app), OutputDir and OutputName.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6F0D6C52-3B1E-4C49-9E0A-5A6C2F1D8B7E}
AppName=Pixelings
AppVersion={#AppVersion}
AppPublisher=Invisionnaire
AppPublisherURL=https://github.com/Invisionnaire-LLC/Pixelings
DefaultDirName={localappdata}\Programs\Pixelings
DefaultGroupName=Pixelings
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename={#OutputName}
SetupIconFile=build\icon.ico
UninstallDisplayIcon={app}\Pixelings.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{userprograms}\Pixelings"; Filename: "{app}\Pixelings.exe"; Comment: "Pixelings: your coding agents on your Stream Deck"

[Run]
Filename: "{app}\Pixelings.exe"; Description: "Start Pixelings"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Pixelings.exe"; Flags: runhidden; RunOnceId: "QuitPixelings"

[Code]
const
  RunKey = 'Software\Microsoft\Windows\CurrentVersion\Run';

// A running Pixelings first, so its files can be replaced.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM Pixelings.exe', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Sleep(800);
  Result := '';
end;

// The start-at-login entry the app made for itself, whatever it is named.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Names: TArrayOfString;
  Value: String;
  I: Integer;
begin
  if CurUninstallStep <> usPostUninstall then Exit;
  if not RegGetValueNames(HKCU, RunKey, Names) then Exit;
  for I := 0 to GetArrayLength(Names) - 1 do
    if RegQueryStringValue(HKCU, RunKey, Names[I], Value) and (Pos('Pixelings.exe', Value) > 0) then
      RegDeleteValue(HKCU, RunKey, Names[I]);
end;
