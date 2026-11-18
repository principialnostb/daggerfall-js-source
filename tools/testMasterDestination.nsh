!macro customInit
  ReadEnvStr $0 "DFO_TEST_MASTER_DESTINATION"
  ${If} $0 != ""
    StrCpy $INSTDIR $0
  ${EndIf}
!macroend

!macro customInstall
  System::Call 'shell32::SHChangeNotify(i 0x2000, i 0x5, w "$appExe", p 0)'
  ${If} ${FileExists} "$newDesktopLink"
    System::Call 'shell32::SHChangeNotify(i 0x2000, i 0x5, w "$newDesktopLink", p 0)'
  ${EndIf}
  ${If} ${FileExists} "$newStartMenuLink"
    System::Call 'shell32::SHChangeNotify(i 0x2000, i 0x5, w "$newStartMenuLink", p 0)'
  ${EndIf}
!macroend
