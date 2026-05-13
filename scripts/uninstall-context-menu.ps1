# scripts/uninstall-context-menu.ps1
#
# 卸载 Marina Win11 新右键菜单。仅移除 MSIX 包,证书保留(下次重启用免 UAC)。
#
# Marina 设置页面 "Win11 新菜单 → 关闭" 触发此脚本。
# Marina 卸载流程也走这个(installer.nsh 直接 powershell 调 Get-AppxPackage|Remove)。
#
# 包不存在视为成功(幂等)。失败打 stderr + 非 0 退出。

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$pkg = Get-AppxPackage -Name 'Marina.ContextMenu' -ErrorAction SilentlyContinue
if ($null -eq $pkg) {
    Write-Output "Marina.ContextMenu 未安装,跳过。"
    exit 0
}

Write-Output "移除 $($pkg.Name) $($pkg.Version)"
try {
    Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction Stop
    Write-Output "完成。"
    exit 0
} catch {
    Write-Error "Remove-AppxPackage 失败:$($_.Exception.Message)"
    exit 4
}
