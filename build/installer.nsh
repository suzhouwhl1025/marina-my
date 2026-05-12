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
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Marina"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Marina"
  ; 顺便清掉 v1.5 改名前的 EasyTerm 残留(应用启动期也会清,这里是兜底)
  DeleteRegKey HKCU "Software\Classes\Directory\shell\EasyTerm"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\EasyTerm"
!macroend
