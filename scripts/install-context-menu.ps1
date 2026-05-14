# scripts/install-context-menu.ps1
#
# Install the Marina Win11 new right-click menu (IExplorerCommand).
# Triggered by Settings -> "Win11 new menu -> Enable" via the main
# process invoking powershell.exe.
#
# Steps:
#   1) Import the self-signed cert into Cert:\CurrentUser\TrustedPeople
#      (MSIX signature chain only trusts certs here; CurrentUser store
#      requires no admin; Windows reads it when validating the MSIX).
#   2) Add-AppxPackage -Path <msix> (registers sparse package + IExplorerCommand).
#
# Failures go to stderr with non-zero exit; the main process surfaces
# them to the user.
#
# Parameters:
#   -MsixPath  <abs>   Absolute MSIX path (resolved from extraResources by main)
#   -CertPath  <abs>   Absolute .cer path (same)
#
# Idempotency: Import-Certificate is a no-op when the thumbprint already
# exists; we explicitly skip Add-AppxPackage when Get-AppxPackage already
# reports the package, which is locale-independent (the previous version
# matched error-message text, which broke on non-English Windows).
#
# IMPORTANT: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1
# using the system ANSI code page when no BOM is present; on a Chinese
# locale that is GBK/CP936, which mis-decodes UTF-8 and can produce stray
# structural tokens, breaking the parser. ASCII-only avoids the issue
# without forcing a BOM.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$MsixPath,

    [Parameter(Mandatory = $true)]
    [string]$CertPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $MsixPath)) {
    Write-Error "MSIX package not found: $MsixPath"
    exit 2
}
if (-not (Test-Path -LiteralPath $CertPath)) {
    Write-Error "Certificate file not found: $CertPath"
    exit 2
}

Write-Output "[1/2] Importing certificate to Cert:\CurrentUser\TrustedPeople"
try {
    $imported = Import-Certificate -FilePath $CertPath -CertStoreLocation Cert:\CurrentUser\TrustedPeople -ErrorAction Stop
    Write-Output "    Imported thumbprint=$($imported.Thumbprint)"
} catch {
    Write-Error "Import-Certificate failed: $($_.Exception.Message)"
    exit 3
}

Write-Output "[2/2] Registering MSIX package"
$existing = Get-AppxPackage -Name 'Marina.ContextMenu' -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    Write-Output "    Already installed ($($existing.Version)), skipping Add-AppxPackage"
} else {
    try {
        Add-AppxPackage -Path $MsixPath -ErrorAction Stop
        Write-Output "    Registered Marina.ContextMenu"
    } catch {
        Write-Error "Add-AppxPackage failed: $($_.Exception.Message)"
        exit 4
    }
}

Write-Output "Done. The new menu should appear in Explorer within seconds; restart Explorer if it does not."
exit 0
