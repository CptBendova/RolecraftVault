; Rolecraft Vault — single-file wrapper around the HD Electron setup UI.
; This script has no wizard pages. It extracts the setup app to a temp folder
; and runs it elevated. The window the person sees is installer/index.html.
!define APP_NAME "Rolecraft Vault"
!define COMPANY "Rolecraft"
!define VERSION "1.242"

SilentInstall silent
AutoCloseWindow true
RequestExecutionLevel admin
SetCompress off
SetDatablockOptimize off

Name "${APP_NAME} Setup"
OutFile "..\dist\Rolecraft-Vault-Setup-${VERSION}.exe"
Icon "setup-icon.ico"
UninstallIcon "..\app\icon.ico"

VIProductVersion "${VERSION}.0.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileDescription" "${APP_NAME} Setup"
VIAddVersionKey "CompanyName" "${COMPANY}"
VIAddVersionKey "LegalCopyright" "${COMPANY}"
VIAddVersionKey "FileVersion" "${VERSION}.0.0"
VIAddVersionKey "ProductVersion" "${VERSION}.0.0"
VIAddVersionKey "OriginalFilename" "Rolecraft-Vault-Setup-${VERSION}.exe"

Section
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /r "..\dist\Rolecraft-Setup-runtime\*.*"
  ExecWait '"$PLUGINSDIR\Rolecraft Vault Setup.exe"'
SectionEnd
