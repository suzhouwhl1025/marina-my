; Marina NSIS 安装器自定义脚本
;
; electron-builder 提供 5 个 hook macro:
;   customHeader / preInit / customInit / customInstall / customUnInstall
;
; 我们只需 customUnInstall — 卸载时清掉 Explorer 右键集成的 HKCU 注册表项,
; 否则旧 install 残留的 command 会指向已卸载的 exe,用户在 Explorer 右键时
; 会看到 "Error launching app: unable to find electron app at ..."(prelease
; 前勘误 #16)。
;
; HKCU\Software\Classes\Directory\shell\Marina             (含 command 子 key)
; HKCU\Software\Classes\Directory\Background\shell\Marina  (含 command 子 key)
;
; DeleteRegKey /ifempty 会递归删除子 key。这里直接全删,卸载时本来就不需要
; 它们了。

!macro customUnInstall
  ; 经典右键菜单 HKCU 项
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Marina"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Marina"
  ; v1.5 改名前的 EasyTerm 残留兜底
  DeleteRegKey HKCU "Software\Classes\Directory\shell\EasyTerm"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\EasyTerm"
  ; Win11 新菜单 MSIX 包(用户可能没启用过,Get-AppxPackage 不存在直接跳过;
  ;   证书保留不动,下次安装免 UAC)。-NonInteractive 防 PS 弹任何交互;
  ;   不阻塞卸载 — 失败也只是残留,reg 项已经清完了。
  ExecWait 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-AppxPackage -Name Marina.ContextMenu -ErrorAction SilentlyContinue | Remove-AppxPackage -ErrorAction SilentlyContinue"'
!macroend
