# scripts/uninstall-context-menu.ps1
#
# Uninstall the Marina Win11 right-click menu. Removes the MSIX package
# only; the cert is kept (avoids a UAC prompt on next install).
#
# Triggered by Settings -> "Win11 new menu -> Disable" and by the Marina
# uninstaller (installer.nsh calls powershell + Get-AppxPackage|Remove).
#
# Package-not-installed is treated as success (idempotent). Failures go
# to stderr with non-zero exit.
#
# IMPORTANT: keep this file ASCII-only. See install-context-menu.ps1 for
# the rationale (Windows PowerShell 5.1 + GBK locale mis-decodes UTF-8
# without BOM, breaking the parser).

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$pkg = Get-AppxPackage -Name 'Marina.ContextMenu' -ErrorAction SilentlyContinue
if ($null -eq $pkg) {
    Write-Output "Marina.ContextMenu is not installed, skipping."
    exit 0
}

Write-Output "Removing $($pkg.Name) $($pkg.Version)"
try {
    Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction Stop
    Write-Output "Done."
    exit 0
} catch {
    Write-Error "Remove-AppxPackage failed: $($_.Exception.Message)"
    exit 4
}
