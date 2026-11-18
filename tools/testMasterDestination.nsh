!macro customInit
  ReadEnvStr $0 "DFO_TEST_MASTER_DESTINATION"
  ${If} $0 != ""
    StrCpy $INSTDIR $0
  ${EndIf}
!macroend
