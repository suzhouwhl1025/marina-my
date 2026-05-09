@echo off
REM EasyTerm cmd.exe hook
REM
REM 占位实现 — CP-3 阶段加入真正的 OSC 1337 cwd 报告。
REM cmd.exe 没有原生 prompt 函数 hook,需通过 PROMPT 环境变量与
REM 注册自定义命令 (DOSKEY) 配合实现。
REM
REM 对应文档: 软件定义书.md 5.1.8、12.5; AGENTS.md CP-3 完成标志
echo [EasyTerm] cmd.exe hook stub - full implementation in CP-3 1>&2
