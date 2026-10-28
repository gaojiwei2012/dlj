# 逗留记模块 / Requirement 开发台账

更新时间：2026-09-30；R003 Phase 1 已集成，当前基线包含 R001 + R002 + R003 + R004。

状态说明：`EXISTING`（V1已有）、`CORE_DONE`（共享核心已完成，需求未整体验收）、`PENDING`（尚待开发）、`PARTIAL`（V1已有底层，交互未闭环）。

| 编号 | 模块 / Requirement | 开发状态 | 核心文件/接口 | 后续主要任务 |
|---|---|---|---|---|
| M01 | 账号、Session 与权限 | EXISTING | `server/index.mjs`, `server/db.mjs` | 原有功能保留 |
| M02 | 签到/签退/补录 | EXISTING + PHASE2_DONE | `/api/stays*`, `stay-input.mjs` | 历史日期-only 可编辑补正；正式浏览器验收 |
| M03 | 日级统计/日期规则（R001） | PHASE2_DONE / 待最终验收 | `date-rules.mjs`, `date-rule-management.mjs`, `daily-compliance.mjs`, `stay-compliance.mjs`, `/api/compliance` | 前端完整构建、浏览器交互、回归发布验收 |
| M04 | 学年与课程 | EXISTING | `academic_years`, `course_dates` | R001/R004 复用课程日，不伪造停留 |
| M05 | 出行计划（R002） | CODE_DONE / 待 Linux 前端验收 | `plan-prediction.mjs`、`year-rule-data.mjs`、`/api/travel-plans/prediction`、Dashboard | 全计划预测、去重、实际偏差、历史/计划学年筛选已实现；浏览器 UAT 与 Q02 历史计划快照决策待确认 |
| M06 | 寻搭子（R003） | CODE_DONE / 待 Linux 前端验收 | `seat-reservations.mjs`、`travel_seat_reservations`、`/api/travel-plans/:id/reservations*` | 预约/取消、事务扣座、联系方式授权已实现；浏览器 UAT |
| M07 | 老师端（唯一需求 R004） | CODE_DONE / 待 Linux 前端与浏览器验收 | `admin-students.mjs`、`StudentOverview.vue`、`/api/admin/students*`、原 R001 日期规则管理 | ADMIN 全体 USER 总览、单人详情；复用 R001/R002；无新表 |
| M08 | 审计/运维 | EXISTING/PARTIAL | `audit_logs`, Docker/Caddy, backups | 新规则管理操作已写入审计日志 |
| S0 | 数据库版本化迁移 | CORE_DONE | `server/migrations/index.mjs` | 当前 schema v3；后续按版本追加迁移，不直接破坏旧表 |
| L01 | 排行榜页面入口 | PARTIAL（V1 遗留） | V1 模板/接口 | 独立排期，不计入 R001–R004 |
| L02 | 课程 attendance 前端入口 | PARTIAL（V1 遗留） | `/api/course-entry` | 独立排期 |

## R003 本轮验收范围

- 新增 `travel_seat_reservations` 与 `travel_plans` 联系方式/总座位字段，schema v3；原计划原样保留并回填总座位。
- 预约、取消、最后座位事务保护、重复预约/取消保护、本人不可预约自己、联系方式权限下发、有预约时计划变更保护。
- 原 39 项回归 + 1 项 R003 全链路集成测试 = 40 项通过；用户上传测试数据库副本可从 v2 升至 v3。
- Vue/Vite 完整构建和浏览器/移动端交互仍需 Linux Docker 环境验收。详见 `docs/R003-phase1.md` 和 `docs/R003-验收清单.md`。

## R004 本轮验收范围

- 老师端完整学生总览/详情 + 筛选 + 学年切换 + 实时日期规则联动，保留旧账号管理；只读 ADMIN 路由。
- 38 项 V1/R001/R002 原测试 + 1 项 R004 集成测试，合计 39 项（该集成测试覆盖多个权限、同口径、学年和变更断言）。
- 不新增表，不更改 schema v2；自动化通过不代表完成浏览器验收。详见 `docs/R004-phase1.md` 和 `docs/R004-验收清单.md`。

## R002 本轮验收范围

- 31 项 V1/R001 回归 + 7 项新增 R002 测试，共 38 项自动化测试通过（Node.js 22 本地验证；正式 Linux Node.js 24 Docker/前端构建待复验）。
- 不新建表，schema v2 不变。见 `docs/R002-phase1.md`。R001 原 50 项 UAT 的待人工项不因新增 R002 自动视为通过。

## 上一轮 R001 验收范围

- 已实现：R001 日期管理、幂等周末同步、管理员审计、精确手工时刻/补签退、旧日期记录待补正、学生 Dashboard/日历接入新合规状态；S0 原成果保留。
- 测试：31/31（2026-09-29；包含新的 API 全链路和时间转换单测）。未更改 schema v2。
- 未验收：Vue 前端完整 Vite build、浏览器点击检查及正式 staging；R002 已进入代码测试交付阶段；R003、R004 尚未开始。老排行榜/ADMIN 用户统计/旧 CSV 的 `effectiveDays` 未切换新合规口径，必须与新增 `compliantDays` 区分。
- 此环境 npm 离线缓存缺少 `yargs-parser-22.0.0.tgz`，需有依赖下载能力的开发/部署环境执行 `npm ci && npm run build`，再进入正式部署前验证。
