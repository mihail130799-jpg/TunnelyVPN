; Дополнительные шаги установщика Tunnely VPN

!macro customInit
  ; Останавливаем только ядро из папки этой программы (другие VPN-клиенты не трогаем).
  ; Само приложение закрывает стандартный механизм установщика.
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -Command "Get-Process mihomo -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '$INSTDIR\*' } | Stop-Process -Force"`
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; Полное удаление (не обновление): останавливаем ядро и выключаем системный прокси,
    ; чтобы после удаления интернет в Windows работал как раньше
    nsExec::Exec `powershell.exe -NoProfile -NonInteractive -Command "Get-Process mihomo -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like '$INSTDIR\*' } | Stop-Process -Force"`
    nsExec::Exec '"$INSTDIR\resources\app-resources\core\tunnely-helper.exe" proxy off'
    ; Убираем задачу автозапуска с правами администратора (если создавалась)
    nsExec::Exec 'schtasks /Delete /TN "Tunnely VPN Autostart" /F'
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "app.tunnely.vpn"
  ${endIf}
!macroend
