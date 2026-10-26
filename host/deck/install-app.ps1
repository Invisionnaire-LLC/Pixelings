# Builds Pixelings.exe from this folder and installs it for this Windows
# user (no admin needed), with a Start menu shortcut. The app then starts
# at login by itself (its tray menu has the switch).
#
#   powershell -ExecutionPolicy Bypass -File host\deck\install-app.ps1              build, install, start
#   powershell -ExecutionPolicy Bypass -File host\deck\install-app.ps1 -Uninstall   quit and remove it
#
# Needs Node.js 20 or newer to build. Elgato's Stream Deck app must not be
# running: it holds the deck.
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $env:LOCALAPPDATA 'Programs\Pixelings'
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Pixelings.lnk'
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'

# A running Pixelings first, so its files can be replaced.
Get-Process -Name Pixelings -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800

if ($Uninstall) {
  Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
  Remove-Item -Force $shortcut -ErrorAction SilentlyContinue
  # The start-at-login entry the app made for itself.
  (Get-Item $run).Property | Where-Object { "$(Get-ItemPropertyValue $run $_)" -like '*Pixelings.exe*' } |
    ForEach-Object { Remove-ItemProperty -Path $run -Name $_ }
  Write-Host 'Pixelings removed'
  exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'Building Pixelings needs Node.js 20 or newer: https://nodejs.org'
}

Push-Location $here
try {
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
  npm run dist
  if ($LASTEXITCODE -ne 0) { throw 'building the app failed' }
} finally {
  Pop-Location
}

$built = Get-ChildItem (Join-Path $here 'dist') -Directory -Filter 'Pixelings-win32-*' | Select-Object -First 1
if (-not $built) { throw 'the build left no Pixelings-win32-* folder in dist' }

Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
Copy-Item -Recurse $built.FullName $dest

$exe = Join-Path $dest 'Pixelings.exe'
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut)
$lnk.TargetPath = $exe
$lnk.WorkingDirectory = $dest
$lnk.Description = 'Pixelings: your coding agents on your Stream Deck'
$lnk.Save()

Start-Process $exe
Write-Host "Pixelings installed in $dest and running (system tray, by the clock)"
