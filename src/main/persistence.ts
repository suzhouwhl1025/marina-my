/**
 * @file src/main/persistence.ts
 * @purpose JSON 文件持久化,负责原子写、损坏恢复、版本迁移。
 *
 * @关键设计:
 * - 原子写策略: 写临时文件 → fsync → rename (软件定义书 11.3)
 * - 备份: 每次成功写入后,前一份保留为 .bak
 * - 加载: 主文件 JSON 解析失败 → 尝试 .bak → 都失败用默认值
 * - 数据目录: app.getPath('userData') (跨平台,Win 下是 %APPDATA%\EasyTerm)
 * - 持久化的文件清单: settings.json / bookmarks.json / recent.json /
 *   templates.json (软件定义书 11.1)
 *
 * @对应文档章节: 软件定义书.md 11.1、11.3;AGENTS.md 5.3 (必测) 持久化类
 *
 * @安全约束 (AGENTS.md 9):
 * - 测试不许碰真实数据目录,必须用 os.tmpdir() 隔离
 * - 写入失败要有详细错误日志,不能静默吞错
 *
 * @CP-1 阶段:
 * 占位 stub,实际 I/O 实现在 CP-2 阶段加入。
 */

/**
 * STUB: 在 CP-2 阶段实现。
 */
export class PersistenceManager {
  // CP-2 实现 readJson / writeJson (atomic) / readWithFallback / migrateIfNeeded
}
