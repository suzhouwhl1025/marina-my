// Sparse Package 的 Executable 占位 stub。永远不会被启动 —— Windows 通过
// IExplorerCommand COM 接口进我们的代码,不走这个 exe。它存在仅是为了让
// MakeAppx pack 通过 manifest 校验(Executable 字段必须指向一个真实存在的
// .exe 文件,即使 RuntimeBehavior=windowsApp / EntryPoint=FullTrustApplication
// 的 Sparse 模式下不会启动它)。

fn main() {
    // 万一被启动了(不应该),立即退出,避免在用户机器上留死进程。
    std::process::exit(0);
}
