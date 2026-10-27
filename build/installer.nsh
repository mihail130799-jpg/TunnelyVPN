; Дополнительные шаги установщика Tunnely VPN

!macro customInit
  ; Закрываем запущенные процессы приложения и ядра перед установкой/обновлением
  nsExec::Exec 'taskkill /F /IM "Tunnely.exe" /T'
  nsExec::Exec 'taskkill /F /IM "mihomo.exe" /T'
!macroend

!macro customUnInstall
  ; Останавливаем ядро и гарантированно выключаем системный прокси,
  ; чтобы после удаления интернет в Windows работал как раньше
  nsExec::Exec 'taskkill /F /IM "Tunnely.exe" /T'
  nsExec::Exec 'taskkill /F /IM "mihomo.exe" /T'
  nsExec::Exec '"$INSTDIR\resources\app-resources\core\tunnely-helper.exe" proxy off'
  ; Убираем задачу автозапуска с правами администратора (если создавалась)
  nsExec::Exec 'schtasks /Delete /TN "Tunnely VPN Autostart" /F'
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "app.tunnely.vpn"
!macroend
