# 安装 MSIX + 重启 Explorer 让新菜单缓存失效。
#
# 关键: Add-AppxPackage -ExternalLocation 告诉 Windows DLL 实际在哪个 Win32
# 路径下,不要按沙箱方式处理 (Sparse Package 模式)。这里指向 build\staging\,
# 该目录在 build.ps1 执行后包含 DLL 和 manifest。
#
# 重启 explorer 是因为 Explorer 启动时缓存 AppX manifest 解析结果,
# 不重启的话 manifest 变更要等下次开机才生效。

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot | Split-Path -Parent

$msix = Join-Path $root 'build\MarinaContextMenu.msix'
$externalLoc = Join-Path $root 'build\staging'

if (-not (Test-Path $msix)) {
    throw "MSIX missing at $msix. Run .\scripts\build.ps1 first."
}
if (-not (Test-Path $externalLoc)) {
    throw "Staging dir missing at $externalLoc. Run .\scripts\build.ps1 first."
}

Write-Host "[1/3] Uninstalling old version (if any)" -ForegroundColor Cyan
$existing = Get-AppxPackage -Name 'Marina.ContextMenu' -ErrorAction SilentlyContinue
if ($existing) {
    $existing | Remove-AppxPackage
    Write-Host "    Removed: $($existing.PackageFullName)"
} else {
    Write-Host "    None present."
}

Write-Host "[2/3] Add-AppxPackage with ExternalLocation=$externalLoc" -ForegroundColor Cyan
Add-AppxPackage -Path $msix -ExternalLocation $externalLoc -ForceApplicationShutdown
$pkg = Get-AppxPackage -Name 'Marina.ContextMenu'
if (-not $pkg) {
    throw "Package not registered after Add-AppxPackage"
}
Write-Host "    Installed: $($pkg.PackageFullName)"
Write-Host "    InstallLocation: $($pkg.InstallLocation)"

Write-Host "[3/3] Restarting Explorer to flush context-menu cache" -ForegroundColor Cyan
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
# explorer.exe auto-restarts via Windows shell. If not, start it manually:
if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) {
    Start-Process explorer
}

Write-Host ""
Write-Host "Done. Right-click any folder in Explorer." -ForegroundColor Green
Write-Host "Expect '在 Marina 终端中打开' in the MODERN (rounded) menu — not in 'Show more options'."
Write-Host ""
Write-Host "If menu does NOT appear:" -ForegroundColor Yellow
Write-Host "  1. Get-AppxPackage Marina.ContextMenu          # confirm installed"
Write-Host "  2. Event Viewer -> AppXDeployment-Server log   # check deploy errors"
Write-Host "  3. Check `$env:MARINA_EXE` is set (needed for Invoke to find Marina.exe)"
