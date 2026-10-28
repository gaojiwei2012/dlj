# R001 Phase2 — 日期管理、补录精确时刻与学生端合规展示

> 2026-09-29；测试交付，未部署生产。基线为 `douliuji_S0_R001_Core_20260928.zip`。

## 模块与数据库

| 职责 | 实现 | 备注 |
|---|---|---|
| 规则/月份计算 | `server/services/date-rules.mjs`, `daily-compliance.mjs`, `stay-compliance.mjs` | 复用上轮共享计算，不复制规则公式 |
| 日期规则 CRUD/周末同步 | `server/services/date-rule-management.mjs` | ADMIN 授权仍由 `server/index.mjs` 入口处理；同步事务化、幂等；原 `audit_logs` 追踪变更 |
| 补录时间校验 | `server/services/stay-input.mjs` | 强制解释为北京时间，写入 UTC ISO；日期-only 历史兼容但新合规结果为 TIME_UNKNOWN |
| 管理、学生端页面 | `src/App.vue`, `src/styles.css` | 按需扩展，未创建新路由、未更换前端技术 |

本轮 **不增加数据库表、不升级 schema 版本**。沿用 `date_rules` (v2)、`invalid_date_ranges` (legacy)、`course_dates`、`stay_records`、`audit_logs`。公共假期和强制无效可与自动周末、课程日重叠；最高优先级规则决定实际结果。旧版无效日期仍通过旧管理入口编辑，不自动批量转换类型。

## 后端接口

| method | endpoint | params/body | 权限/作用 |
|---|---|---|---|
| GET | `/api/admin/date-rules?year=2026` | 公历年份1900–2099 | ADMIN；按日期查看周末、人工规则、课程、legacy 无效日及最终规则资格 |
| POST | `/api/admin/date-rules/sync-weekends` | `{ "year": 2026 }` | ADMIN；同年重复调用新增数量为0；已设有效周末不被覆盖 |
| POST | `/api/admin/date-rules` | `{ "date":"2026-09-26", "type":"VALID_WEEKEND", "reason":"补课" }` | ADMIN；支持 PUBLIC_HOLIDAY / MANUAL_INVALID / VALID_WEEKEND，不得创建人工 WEEKEND；已停用同类规则可重新启用 |
| PATCH | `/api/admin/date-rules/:id` | 同 POST，可传 status=ACTIVE 重新启用 | ADMIN；仅人工规则；同日期同类型唯一 |
| DELETE | `/api/admin/date-rules/:id` | - | ADMIN；软停用，重复停用返回409 |
| POST | `/api/stays` | `{ "startAt":"2026-09-25T09:00", "endAt":"2026-09-25T13:00" }` | USER；实时时间验证+UTC入库 |
| PATCH | `/api/stays/:id` | 同上 | 记录所有者；可将旧 date-only 记录补正为可信时间；进行中 OPEN 禁止普通修改 |
| POST | `/api/stays/check-out/backfill` | `{ "endAt":"2026-09-25T13:00" }` | USER；真实离澳时间，必须晚于原签到时刻且不可未来 |
| GET | `/api/dashboard?yearId=...` | - | 原 `stats` 向后兼容，新增 `compliance` 且前端主值为 `compliantDays` |
| GET | `/api/calendar?month=...&yearId=...` | - | 原字段保留；增加 `complianceStatus/stayMinutes/reasonCode/ruleDetails/provisionalStatus` |

日期-only 的旧 V1 API 客户端仍可 POST/PATCH/补签退，但时间未知，不会凭日期默认为满4小时。这是兼容接口，不是新 UI 的推荐输入方式。学生 UI 强制提交带分钟精度的准确时刻。时间信息由服务端校验，`datetime-local` 一律按 Asia/Shanghai 时区解释，不按服务器时区解释。

## 最小验收覆盖

- 31 项自动化测试全部通过：旧29项 + 新2项（其中一个涵盖 ADMIN鉴权/年同步二次调用/重复校验/重叠假期优先/编辑停用恢复/审计/学生统计立即刷新/完整补录、旧数据补正、补签退时间保存）。
- 新日期管理列表上最多展示公历周末、课程日期、已创建规则及 legacy 区间涉及的日期，不需要预生成每个工作日记录。
- 旧的排行榜、老师全员 `stats.effectiveDays`、旧 CSV 仍保留 V1 历史语义。新 R001 统计只看 `compliance.compliantDays`，下轮 R004 应只消费统一后端结果，不混用。
- 静态 Vue script `node --check` 已过；当前离线缓存无法完成 `npm ci`（缺失 `yargs-parser-22.0.0.tgz`），因此**不能宣称前端已完整构建通过**。

## 发布前的操作

1. 保存原始 V1 源码、执行 SQLite 一致性备份（不要复制活动 WAL 主文件覆盖线上数据库）。
2. 在可获取 npm 依赖的构建环境运行 `npm ci && npm test && npm run build`。
3. 启动独立测试服务器，在浏览器测试新管理员日期表单、年度同步、多规则同日显示、学生手动补录/补签退、首页和日历；用不同 USER/ADMIN 账户校验权限。
4. 核对旧 CSV 与 `compliance` 口径的说明后，再考虑部署正式环境。

下一步先完成 R001 的浏览器构建/人工验收和统计兼容性决策，再进行 R002 计划预测。R004 仍只有一个独立 Requirement，其日期规则入口只是复用 R001 配置能力。
