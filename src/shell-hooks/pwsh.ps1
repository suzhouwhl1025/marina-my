# EasyTerm PowerShell hook
#
# 注入此 hook 后,每个 prompt 输出前会发送 OSC 1337 序列报告当前 cwd,
# 让 Main 进程实时跟踪 session 的工作目录变化 (软件定义书 5.1.8、ADR-003)。
#
# 关键设计:
# - 加载用户原本的 PowerShell profile,不污染用户配置 (软件定义书 12.5)
# - 包装 prompt 函数,在原 prompt 输出前/后追加 OSC 1337
# - OSC 1337 序列格式: ESC ] 1337 ; CurrentDir=<path> BEL
#
# 对应文档:软件定义书.md 5.1.8、12.5;AGENTS.md CP-3 完成标志
#
# CP-3 阶段实现真正的 hook 注入,目前仅占位文件。

Write-Host "[EasyTerm] PowerShell hook stub — full implementation in CP-3" -ForegroundColor DarkGray

# 加载用户原本的 profile (如果存在)
if (Test-Path $PROFILE) {
    . $PROFILE
}

# TODO(CP-3): 包装 prompt 函数,注入 OSC 1337 cwd 报告
# 参考:
#   $script:_easytermOriginalPrompt = $function:prompt
#   function prompt {
#       $cwd = (Get-Location).Path
#       Write-Host -NoNewline "`e]1337;CurrentDir=$cwd`a"
#       & $script:_easytermOriginalPrompt
#   }
