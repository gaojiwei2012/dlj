# 变更记录

## 2026-10-15 · 出行计划自动辨识集中课程并按连续日期分段

- 「新增／修改出行计划」取消手动切换「自行安排／课程安排」；选择日期后，根据管理员已发布且仍有效的集中课程日自动识别并显示分段预览。
- 「我的出行计划」按连续日期展示多段分类：全为课程时只显示「课程安排」，全无课程时只显示「自行安排」，混合时按日期先后依次列出；仍只保存一条计划及原始 ID，不拆分预约、座位或统计数据。
- `GET /api/travel-plans` 增加 `segments` 字段；来源为全部有效集中课程的课程日期。管理员新增、调整、停用课程后，重新查看即可动态刷新。历史 `plan_type` 字段保留为旧接口兼容，但不作为界面分类依据；无需数据库迁移。
- 出行计划日期选择器右上角增加与逗留日历一致的紫色「课」标记及图例；黄色「澳门公共假期」标记继续保留。同日两种标记可同时显示，预测仍沿用原有的日期规则优先级。
- 原有日期风险确认、计划公开、寻搭子、座位预约、预测统计及学年编辑等功能保持不变。
- 新增纯函数与 API 集成回归测试，验证纯课程／纯自行／混合跨年区间，以及课程新增、缩短与停用后的分类同步。


## 2026-10-15 · 学年管理卡片布局优化

- 教师后台将「编辑所选学年」与「启用与新建学年」并排放在同一「学年管理」区域，消除编辑表单孤立占用半栏导致的空白。
- 学生概览及首页公告保留原位置；当前启用学年、选中学年的启用入口和新学年创建表单集中在右侧卡片。
- 窄屏改为上下排列，手机按钮纵向铺满；不涉及业务 API、数据迁移或日期判定修改。
- 自动化测试 60 项通过；源码语法检查通过。当前环境缺少完整 Vite 依赖，浏览器构建仍需部署环境验收。

## 2026-10-15 · 学年创建后可修正起止日期

- 「学年和目标」改为编辑顶部所选学年，支持修改名称、起止日期和目标天数；历史学年不用先重新启用，编辑也不会触发启用。
- 提供未修改时禁用保存、取消修改、提交前确认；成功后刷新学年下拉列表、学生统计和管理员学生总览。
- 新增 `PATCH /api/admin/academic-years/:id` 管理员接口，按 ID 编辑并记入审计日志；旧 `PUT /api/admin/academic-year` 接口保持兼容，仅修改当前启用学年。
- 拒绝学年重叠以及造成现有有效课程、无效日期越界的操作，附带具体冲突日期；不删除逗留或出行记录，统计按新学年范围动态重算。无需数据库迁移。
- API 与前端源代码联动测试加入回归集。

## 2026-10-15 · 公共假期与无效逗留日期共用一个入口（二次调整）

- 移除单独「无效逗留日期」管理卡片，在原公共假期设置卡片提供一个日期类型下拉框；公共假期、强制无效日及无效逗留日期在同一页面新增、修改和停用。
- 日期管理 `GET /api/admin/date-rules?year=` 新增 `exceptionRecords` 统一列表字段，覆盖原单日与区间记录，并保留原始记录 ID／存储表／接口，无需迁移。
- 公共假期仍按单日设置；无效逗留日期支持单日及区间、按当前学年限定；历史其他学年的无效日期只读。周末/集中课程逐日明细改为折叠，减少页面干扰。
- 回归测试扩充为 57 项，覆盖统一列表、编辑停用公共假期、旧单日／区间保留及管理页面不重复出现入口。

## 2026-10-15 · 无效日期统一管理与周末课程规则调整

- 管理端统一在「无效逗留日期」管理旧区间和此前的 `MANUAL_INVALID` 单日数据；保留两种数据库存储、原始记录与操作日志，避免破坏已有资料。支持统一查看、修改、停用；新设置默认写入区间表。
- `GET /api/admin/config` 的 `invalidRanges` 增加 `source_type` 用于区分 `RANGE` 与 `MANUAL_RULE`；新旧管理 API 继续兼容，跨来源重复配置受到阻止。
- 取消有效周末新增入口。历史 `VALID_WEEKEND` 数据保留供审计但不再参与规则解析、逗留合规、出行预测或日期说明，相关新增 API 返回 400。
- 周末唯有当前学年有效集中课程安排才能在满 4 小时后成为完全符合；澳门公共假期与无效逗留日期优先排除，停用课程后即回到普通周末规则。
- 学生日历的无效日标识改为复用统一日期规则读取（同时覆盖旧区间和单日），老师端与旧版统计同步识别两种无效配置。
- 验证：`node --test` 56 项通过；Vue `<script setup>` 语法通过 `node --check`。当前隔离环境缺少 Vite 依赖，浏览器构建仍需部署环境执行 `npm ci && npm run build`。


## 2026-09-30 · R003 Phase 1

- 自驾公开计划新增座位预约/取消闭环，无需发布者审批；仅当前有效预约用户与发布者本人可读取发布者联系方式。
- 新增 schema v3：`travel_plans.contact_type/contact_value/seat_capacity` 与 `travel_seat_reservations`；`seat_count` 表示剩余座位。
- 预约/取消使用 SQLite `BEGIN IMMEDIATE` 事务；重复预约、重复取消、自约、已满、最后座位并发均有保护。
- 有有效预约时阻止静默取消公开、关闭座位、删除计划或把总座位降到预约人数以下。
- 寻搭子与计划编辑前端接入预约状态、剩余座位、受控联系方式及移动端布局。
- 原回归与新增 R003 测试合计 40 项通过；上传测试数据库副本成功迁移至 schema v3。
- 完整 Vite build 与浏览器 UAT 仍需 Linux Docker 环境确认。

## 2026-09-30 · R004 Phase 1（用户上传 R002 完整测试版继续开发）

- 新增只读 ADMIN 学生总览与详情：复用 R001 实际合规、R002 计划预测，固定同一学年/时间截点/日期规则。
- 老师端增加学生搜索、账号状态/计划净差异筛选、当前签到状态、完整日级详情与历史，移动端卡片布局。
- 学生详情独立呈现，原公告、学年、课程、规则、邀请码与 V1 账号管理不删除；旧统计另行标注为旧口径。
- `GET /api/admin/students`、`GET /api/admin/students/:id`；ADMIN 鉴权；按学年实时计算，不缓存。
- 新增 R004 API 集成测试；无表结构变更。
- 交付包过滤上传的 `.env.test`、SQLite 测试库及 WAL/SHM，不分发任何运行凭据。

# 更新记录 / Changelog

## R002-Phase1 — 2026-09-29 (code integration; browser UAT pending)

- Reuse the exact R001 `evaluateDay`/rule resolver for all active per-year private/public travel plan predictions; union overlapping natural dates and assume 240 minutes per plan day. Provide per-plan projections without double-counting the overall union.
- Add `GET /api/travel-plans/prediction?yearId=` and `planPrediction` to Dashboard, with full-year forecasts plus settled planned/actual, signed net difference, missed, extra and per-date mismatches. Today OPEN/uncompleted and future planned dates are excluded from deficits. One rule-source snapshot and `asOf` are shared for dashboard actual/forecast results.
- Student Dashboard and plans UI show forecasts, net difference and daily comparison; optional year filtering for plans and stay history keeps unfiltered API compatibility. Include earlier R001 date-rule CSS alignment fix.
- No migration/table/version change; CURRENT_ACTIVE_PLANS is provisional Q02 history baseline, not historical plan snapshots. Existing R001 UAT still needs human sign-off.
- Test: original 31 plus 6 pure forecast tests and 1 R002 API test = 38 passing. Vue script syntax/template nesting checked, full Vite build must be verified in Linux (offline npm cache incomplete here).

## R001-Phase2 — 2026-09-29 (test delivery)

- Date rule management: ADMIN-only listing, create/update/disable public holiday, manual invalid day, valid weekend, reactivation of inactive manual rules; yearly weekend sync with `BEGIN IMMEDIATE` and `(rule_date,type)` idempotency; course-day and legacy invalid ranges visible as separate overlapping attributes; rule change audit through existing `audit_logs`.
- Accurate timestamps: `POST /api/stays`, `PATCH /api/stays/:id`, and `/api/stays/check-out/backfill` now accept Beijing `YYYY-MM-DDTHH:mm` as `startAt`/`endAt` and persist UTC instants. Reject invalid/future/negative times. Existing date-only clients remain compatible but their records are explicitly `TIME_UNKNOWN` until edited with accurate timestamps. Editing an OPEN record via ordinary PATCH now returns 409; use check-out or backfill instead.
- Dashboard now includes `compliance` and the student home main value is `compliantDays`; the original `stats` response is retained under its former contract for backward compatibility. Calendar days additionally include `complianceStatus`, `stayMinutes`, `reasonCode`, `ruleDetails` for settled days in the selected academic year, with visible categories and reasons.
- Admin interface provides year selector, weekend sync, rule form/edit/disable, direct valid-weekend grant and rule effect/source display. Old invalid-date and course interfaces remain functional.
- No new table or SQLite schema-version bump is needed in this phase: reuses V2 `date_rules`, historical `invalid_date_ranges`, `course_dates`, `stay_records`, `audit_logs`. No persistent daily compliance cache.
- Automated tests: original 29 plus 2 new phase2 tests = 31 passed. Vue script syntax checked; full Vite build pending because offline npm cache lacks `yargs-parser-22.0.0.tgz`.

**Scope**: R001 implementation is integrated for student self-view and date administration; full frontend build/browser UI acceptance and production staging/backup remain to be verified. Existing rankings, administrator users' stats and CSV retain old V1 statistics until their contractual migration is planned alongside R004; do not interpret their `effectiveDays` as the new `compliantDays`.

## S0 + R001-Core — 2026-09-28

- S0: 新增 `server/migrations/`，使用 `PRAGMA user_version` 进行逐版本事务迁移；将旧有课程列增补纳入 v1；v2 建立类型化 `date_rules` 表。
- S0: 原有 `invalid_date_ranges` 原样保留，由新计算层兼容读取为强制无效日，不擅自对历史数据做不可逆分类迁移。
- S0/B01: 月历中的 `isPresent` 仅来自实际逗留记录（选课不伪造签到），并包含所选学年之外的历史足迹；`inAcademicYear` 仍单独标记是否属于所选学年。旧版 Dashboard 仍按日期集合计算，但课程选择不再伪造实际逗留日期。
- R001-Core: 新增 `date-rules.mjs`、`daily-compliance.mjs` 和数据库读取适配器 `stay-compliance.mjs`。
- R001-Core: 新增鉴权只读 `/api/compliance?yearId=<ID>`；`/api/dashboard`、`/api/calendar` 原有响应统计字段及 CSV 仍按 V1 旧口径，**尚未切换到新统计**。
- R001-Core: 真实 UTC 时间区间按北京时间逐日拆分，重叠区间取并集；4 小时阈值；公共假期和强制无效优先；普通周末/有效周末/课程周末；OPEN 进行中；时间未知历史记录单列。
- 安全：交付源码包排除 `.env`、`.env.save`、实际 SQLite 数据、备份和 WAL/SHM 文件。

**在 2026-09-28 当时尚未完成**：老师端日期规则增删改/年度周末同步、精确补录 UI/API、旧历史记录补正策略、主页/日历新口径切换、R002–R004；2026-09-29 后续进度见上方 R001-Phase2。

**部署提醒**：生产环境必须先做一致性 SQLite 备份，再启动会自动升级数据库版本的应用；切勿直接以此测试包覆盖生产数据目录。
