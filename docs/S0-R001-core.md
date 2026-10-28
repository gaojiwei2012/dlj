# S0 + R001-Core：首轮开发交接与模块台账

**基线文件**：`douliuji-test (2).zip`（原始上传包仍保留、未写入）  
**需求依据**：`项目需求规格说明书_R001-R004(1).md`  
**日期**：2026-09-28  
**发布状态**：开发/测试版本，未连接正式生产服务

## 一、已完成模块

| 模块 | 代码入口 | 当前状态 | 说明 |
|---|---|---|---|
| S0 数据库迁移 | `server/migrations/index.mjs` | 已实现/测试 | 0→1 兼容原课程扩展列；1→2 新建 `date_rules`，事务迁移、幂等、拒绝未知未来版本 |
| S0/B01 历史日历 | `server/index.mjs` | 已处理/回归 | `isPresent` 表示存在实际逗留，不因选课程而伪造；学年外历史足迹正常显示 |
| R001 日期规则 | `server/services/date-rules.mjs` | 核心已实现 | 公历周末、有效周末、课程日、公共假期、强制无效；保留同时命中属性 |
| R001 逐日时长 | `server/services/daily-compliance.mjs` | 核心已实现 | 北京时间自然日分割；多段重叠合并；240 分钟阈值；未知/进行中单列 |
| R001 DB 适配 | `server/services/stay-compliance.mjs` | 核心已实现 | 查询真实记录、旧无效日期、新规则和所有有效课程日期 |
| R001 自读 API | `GET /api/compliance?yearId=` | 已实现/测试 | 服务端 Session 鉴权，仅当前用户；学年可选 |
| V1 老统计 | `server/date-utils.mjs`、`stats()` | 暂留 | Dashboard/排行榜/CSV 仍以旧日期集合统计，课程选择不作为实际逗留 |

> **重要**：这里的“核心已实现”不等于完整 R001 已完成。数据库建表并不意味着日期规则后台已实现；新增 API 不表示旧 Dashboard 已按新口径切换。

## 二、新只读接口

`GET /api/compliance`：当前学年；`GET /api/compliance?yearId=1`：指定既存学年；要求登录。返回 `compliance` 对象，包含 `academicYear`、`asOf`、`thresholdMinutes`、`compliantDays/compliantMinutes`、`partialDays/partialMinutes`、`nonCompliantDays/nonCompliantMinutes`、`timeUnknownDays`、`inProgressDays`、`actualStayDays` 及 `dailyResults[]`。

每日状态：

- `COMPLIANT`：真实已结算、日期符合、累计时长不少于 240 分钟。
- `PARTIAL`：有真实逗留但时长或周末资格不足。
- `NON_COMPLIANT`：实际有逗留但受公共假期/强制无效日排除；优先于课程和有效周末。
- `NO_STAY`：当天没有实际逗留，也无待补时长证据。
- `TIME_UNKNOWN`：有历史记录但不能证明是否达到 240 分钟；强制排除日期仍显示 `NON_COMPLIANT`。
- `IN_PROGRESS`：当前 OPEN 打卡，当日保留 `provisionalStatus` 和 `provisionalReasonCode`，不提前纳入最终完成计数。

`stayMinutes` 保留分数分钟以避免 239分59秒被错误进位为 240 分钟。汇总分钟数使用整数向下取整。实际记录跨天，前一日独立结算；当日 OPEN 只给临时结果。

## 三、数据处理

**新增表** `date_rules`：`rule_date`、`type`、`source`、`reason`、`status`、`created_by`、`created_at`、`updated_at`，约束 `(rule_date,type)` 唯一。`type` 为 `PUBLIC_HOLIDAY / MANUAL_INVALID / WEEKEND / VALID_WEEKEND`，课程日期不复制到该表。

原表 `invalid_date_ranges` **不做数据迁移或改写**，新引擎查询时将其有效区间作为旧版强制无效条件叠加，以规避 Q06 尚未正式确认的历史分类问题。日历中普通周末由日期计算得出，即使尚未做年度同步，也能正常判断；同步/撤销管理留待下一迭代。

生产数据库部署前应先执行一致性备份，切勿直接复制活动 WAL 数据库主文件覆盖或用本源码包内不存在的测试库替换生产数据。每次迁移在一个 SQLite 事务内提交，`user_version` 升级后启动不重复执行。

## 四、当前仍未完成和后续顺序

1. **R001 下一轮**：老师端日期规则写入和公历年份周末同步；手动补录及补签退的真实时间输入、对旧记录的待补正交互；新统计口径正式接入 Dashboard/日历；R001 全链路验收。
2. **R002**：计划预测复用 `evaluateDay`，不重复日期公式；逐日与实际比对和净偏差。
3. **R004**：老师端只登记 R004，复用 R001/R002 结果及 R001 日期规则配置；现有 ADMIN 权限继续查看全系统学生。
4. **R003**：自驾预约独立开展，必须有 SQLite 事务和联系人授权。

## 五、回归方式

在项目根目录运行 `npm test`。测试包含原 V1 全链路、数据库迁移、合规日期判定、时间区间、API 鉴权与新旧规则叠加。原项目前端没有改动；如首次部署，请先执行 `npm ci` 再执行 `npm run build`。
