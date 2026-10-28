# Windows 自动化测试清理修正（R001 Phase 2）

仅修改 `test/compliance-api.test.mjs` 和 `test/r001-phase2-api.test.mjs` 中的测试资源清理顺序：
1. 关闭测试中自行打开的 `DatabaseSync` 连接；
2. 终止后端子进程，并等待 `close` 事件确认完全退出；
3. 最后删除临时 SQLite 目录，并保留针对 Windows 短时锁占用的重试。

原因：旧版在 `child.kill()` 后立即 `rmSync()`，且父进程 SQLite 连接的关闭回调晚于目录清理的注册位置。Windows 会拒绝删除仍被进程持有的文件。

本次未改动任何服务器业务逻辑、前端、数据表或迁移。已在当前 Linux 环境运行 `node --test`，31 项通过；Windows 仍需用户在自己的环境复验。
