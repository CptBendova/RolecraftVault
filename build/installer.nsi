; Rolecraft Vault — Windows installer
!define APP_NAME "Rolecraft Vault"
!define APP_EXE "Rolecraft Vault.exe"
!define COMPANY "Rolecraft"
!define VERSION "1.163"

; Modern UI rather than the classic NSIS pages. The classic ones are grey
; system dialogs with no artwork and "Nullsoft Install System" along the
; bottom, which makes a finished app look like a stray utility.
!include "MUI2.nsh"

Name "${APP_NAME}"
OutFile "..\dist\Rolecraft-Vault-Setup-${VERSION}.exe"
InstallDir "$PROGRAMFILES64\${APP_NAME}"
InstallDirRegKey HKCU "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
BrandingText "${APP_NAME} ${VERSION}"

; Without these the setup program has a blank Properties dialog and shows no
; publisher at all on the UAC prompt, which is the first thing anyone sees.
VIProductVersion "${VERSION}.0.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileDescription" "${APP_NAME} Setup"
VIAddVersionKey "CompanyName" "${COMPANY}"
VIAddVersionKey "LegalCopyright" "${COMPANY}"
VIAddVersionKey "FileVersion" "${VERSION}.0.0"
VIAddVersionKey "ProductVersion" "${VERSION}.0.0"
VIAddVersionKey "OriginalFilename" "Rolecraft-Vault-Setup-${VERSION}.exe"

; The setup program carries the app's crest with a small download badge, so it
; is telling apart from the installed app in a Downloads folder. The uninstaller
; wears the plain crest, since it is the app it belongs to.
!define MUI_ICON "setup-icon.ico"
!define MUI_UNICON "..\app\icon.ico"

!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_HEADER_TRANSPARENT_TEXT
!define MUI_WELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_ABORTWARNING
!define MUI_BGCOLOR "0A0E1C"
!define MUI_TEXTCOLOR "E8E4D8"
!define MUI_INSTFILESPAGE_COLORS "E8E4D8 0A0E1C"

!define MUI_WELCOMEPAGE_TITLE "Rolecraft Vault"
!define MUI_WELCOMEPAGE_TEXT "A private library for your characters, personas, lorebooks and prompts.$\r$\n$\r$\nEverything stays on this computer. The app cannot reach the internet, and your vault is encrypted where it sits.$\r$\n$\r$\nClick Next to continue."

!define MUI_FINISHPAGE_TITLE "Rolecraft Vault is installed"
!define MUI_FINISHPAGE_TEXT "You will find it in the Start menu and on your desktop.$\r$\n$\r$\nThe first time it opens it will ask you to set a master password. That password is what protects the vault, and it cannot be recovered, so keep it somewhere safe."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open Rolecraft Vault"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchAsUser

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; The installer runs elevated, so anything it starts directly would inherit
; that. The vault is stored per user, so launching as the administrator could
; quietly create a second empty vault under a different account. Going through
; explorer.exe hands the launch back to the person who is actually logged in.
Function LaunchAsUser
  Exec '"$WINDIR\explorer.exe" "$INSTDIR\${APP_EXE}"'
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "..\dist\Rolecraft Vault\*.*"

  WriteRegStr HKCU "Software\${APP_NAME}" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\resources\app\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\resources\app\icon.ico" 0

  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "Publisher" "${COMPANY}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayVersion" "${VERSION}"
  ; Windows shows this beside the app in Installed apps; without it the entry
  ; there is the only place the crest does not appear.
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayIcon" "$INSTDIR\${APP_EXE},0"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
  DeleteRegKey HKCU "Software\${APP_NAME}"
SectionEnd
