# scripts/install-context-menu.ps1
#
# 安装 Marina Win11 新右键菜单(IExplorerCommand)。Marina 设置页面的
# "Win11 新菜单 → 启用" 触发此脚本(主进程通过 powershell.exe 调起)。
#
# 步骤:
#   1) 导入自签证书到 Cert:\CurrentUser\TrustedPeople(MSIX 包签名链
#      只有这里能信任。CurrentUser store 无需管理员;Add-AppxPackage 后
#      Windows 验证 MSIX 时会读到)。
#   2) Add-AppxPackage -Path <msix>(注册 sparse package + IExplorerCommand)。
#
# 失败信息打到 stderr,exit 非 0,Marina 主进程会展示给用户。
#
# 入参:
#   -MsixPath  <abs>   MSIX 包绝对路径(由 Marina 主进程从 extraResources 解出)
#   -CertPath  <abs>   .cer 文件绝对路径(同上)
#
# 幂等性:Import-Certificate 在 thumbprint 已存在时 Windows 自动跳过;
#         Add-AppxPackage 在同版本已注册时返回错误,我们捕获后判断是否真的成功。

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$MsixPath,

    [Parameter(Mandatory = $true)]
    [string]$CertPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $MsixPath)) {
    Write-Error "MSIX 包不存在:$MsixPath"
    exit 2
}
if (-not (Test-Path -LiteralPath $CertPath)) {
    Write-Error "证书文件不存在:$CertPath"
    exit 2
}

Write-Output "[1/2] 导入证书到 Cert:\CurrentUser\TrustedPeople"
try {
    $imported = Import-Certificate -FilePath $CertPath -CertStoreLocation Cert:\CurrentUser\TrustedPeople -ErrorAction Stop
    Write-Output "    已导入 thumbprint=$($imported.Thumbprint)"
} catch {
    Write-Error "导入证书失败:$($_.Exception.Message)"
    exit 3
}

Write-Output "[2/2] 注册 MSIX 包"
try {
    Add-AppxPackage -Path $MsixPath -ErrorAction Stop
    Write-Output "    已注册 Marina.ContextMenu"
} catch {
    # 已存在(同版本)走另一条路径
    $msg = $_.Exception.Message
    if ($msg -match 'is already installed' -or $msg -match '已安装') {
        Write-Output "    已存在,跳过"
    } else {
        Write-Error "注册 MSIX 失败:$msg"
        exit 4
    }
}

Write-Output "完成。新菜单将在数秒内对 Explorer 生效;若未生效请重启 Explorer 进程。"
exit 0
