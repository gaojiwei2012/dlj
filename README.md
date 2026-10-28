# 逗留记

第三阶段真实版本，包含邀请码注册、账号密码登录、北京时间统计、签到签退、补录、课程快捷录入、全员排行、计划出行、寻搭子、用户管理、数据导出和管理员后台。

## 本地运行

```bash
npm install
npm run dev
```

前端访问 `http://localhost:5173`。默认开发管理员为 `admin / admin123456`，默认邀请码为 `DOULIUJI2026`。仅用于本地开发；正式部署前必须通过 `.env` 修改。

## 测试和构建

```bash
npm test
npm run build
npm start
```

生产服务默认监听 `3000`，数据库默认保存在 `data/douliuji.db`。

## 正式部署

1. 将 `.env.example` 复制为 `.env`，填写正式域名、强管理员密码和新邀请码。Compose 会把 `DOMAIN` 提供给 Caddy，用于域名与 HTTPS 证书。
2. 执行 `npm run check:production`，必须通过后才能部署。
3. 执行 `docker compose up -d --build`。
4. 访问 `https://你的域名/health`，应返回 `status: ok`。

Docker Compose 会启动应用、HTTPS 入口和每日备份服务。数据库保存在 `data`，备份保存在 `backups`，默认保留最近7份。首次启动按北京时间自动设置当前学年（每年9月1日至次年8月31日，目标90天）；管理员可在后台调整。初始邀请码限使用一次，此后由管理员生成并复制邀请码。

## 备份和恢复

手动备份：`npm run backup`。

Docker 部署时先停止应用和备份任务，然后执行：

```bash
docker compose stop backup app
docker compose run --rm --no-deps backup node server/backup.mjs --restore /backups/具体备份文件.db
docker compose up -d
```

恢复后重新启动应用并检查 `/health`、登录和首页统计。不要在应用仍写入数据库时直接覆盖数据库文件。

## 2026-10-15 日期规则更新

详见 [`docs/date-rules-unified-20261015.md`](docs/date-rules-unified-20261015.md)。后台「公共假期与无效逗留日期」已成为唯一新增与管理入口，支持按类型添加单日公共假期、单日或区间无效日；有效周末已弃用，周末必须由集中课程决定是否可完全符合。

## R002 Phase 1（2026-09-29）

- 学生首页 / 计划出行加入按学年计划预测、截止当前的实际对比、正负净差异、计划未兑现、计划外多完成、逐日原因；所有计划重叠日期去重，预测调用 R001 同一个日期规则引擎。
- `GET /api/travel-plans/prediction?yearId=<ID>`；Dashboard 新增 `planPrediction`；`/api/travel-plans`、`/api/stays` 可选 `yearId` 保持旧无参数兼容。
- 当前按最新有效计划回算，未保存修改前的历史计划快照。详见 [`docs/R002-phase1.md`](docs/R002-phase1.md)。
- 这一轮不新增 SQLite 表，不修改 schema v2；正式前请先在并行 Linux 测试站通过 `npm test`、Docker Vite 构建及浏览器交互验收。附有 `docker-compose.r002.yml`，只运行 app，不含 Caddy/备份，默认本机 3200。

## R001-Phase2 功能（2026-09-29，测试交付）

- 教师（ADMIN）后台将公共假期、“强制无效日”和“无效逗留日期”合并为同一个管理卡片，支持公共假期单日及无效日期单日/区间；历史单日规则自动展示，无需迁移。已移除“有效周末”的新增入口，旧记录仍保留但不参与判定；周六日仅在存在有效集中课程且非假期/无效逗留日时，停留满4小时方能完全符合。
- 新增 `/api/admin/date-rules`（GET/POST）、`/api/admin/date-rules/:id`（PATCH/DELETE）、`/api/admin/date-rules/sync-weekends`（POST `{ "year": 2026 }`），全部要求 ADMIN；记录审计日志。GET 查询参数 `year` 为公历年，范围1900–2099。
- 手工补录 POST/PATCH 请求支持 `{ "startAt": "2026-09-25T09:00", "endAt": "2026-09-25T13:00" }`，均表示北京时间，服务端保存 UTC ISO 时间。补签退支持 `{ "endAt": "2026-09-25T13:00" }`。没有准确时间的旧版日期-only 请求依然接受，但回显 `timeUnknown:true`，并在新合规计算中标记待补正。OPEN 记录不能用普通修改接口直接关闭。
- `/api/dashboard` 增加 `compliance`（新的主合规口径），保持原 `stats` 字段不变以兼容旧客户端；`/api/calendar` 追加逐日合规属性。学生页面主天数切为 `compliantDays`，同时显示部分、不符合、未知、进行中与每日规则原因。排行榜/老师全员旧统计/旧 CSV 尚未切换新口径（R004 前需要进行兼容规划）。
- 本阶段不新增表：复用 schema v2 的 `date_rules` 及既有五张相关表。部署前仍要执行 SQLite 一致性备份。因本环境 npm 缓存不完整，前端 Vite 打包未完成，需在可联网的构建环境运行 `npm ci && npm run build` 并进行浏览器验收。

## S0 / R001-Core 开发预览（2026-09-28）

新后端包含独立日期规则与逐日合规计算模块，**暂未将首页旧统计切换为新口径**。
登录后可请求 `GET /api/compliance` 或 `GET /api/compliance?yearId=<学年ID>`，查看本人当前学年完全符合、部分符合、不符合、历史时长未知、进行中及每日解释。该接口只读，不能查询其他用户。未登录返回 401，不存在的学年返回 404。

新日级统计对已知的精确时间戳按北京时间跨天拆分、同日区间去重；旧手工补录/缺失签退时刻等会标记 `TIME_UNKNOWN`，不强制算四小时；OPEN 当日标记 `IN_PROGRESS`（附临时结果）。`date_rules` 新表与旧 `invalid_date_ranges` 并存，课程日仍从 `course_dates` 读取。本阶段尚无日期规则写入 UI/API，后续在 R004 中增加管理员入口。

数据库首次启动自动执行按版本的事务迁移（当前 `PRAGMA user_version = 2`），**部署前请先做 SQLite 一致性备份**。源码包刻意不包含 `.env`、生产数据与数据库备份；运行前按 `.env.example` 配置。单元测试与 API 集成测试执行 `npm test`；前端依赖需要根据 lockfile 执行 `npm ci` 再构建。

详细进度见 `docs/S0-R001-core.md` 和 `CHANGELOG.md`。

## 当前范围

管理员可配置学年、目标天数、无效日期、集中课程和邀请码，管理用户姓名、状态和密码，并导出人员统计及逗留明细。在后台顶部先选择要编辑的学年，再于「学年和目标 · 编辑所选学年」修改名称、开始/结束日期与目标天数，确认后保存。编辑历史学年不会自动启用；若日期与其他学年重叠，或将已设置的课程/无效日期排除在学年外，系统会阻止保存。修改不删除逗留记录，但会影响相关统计和预测。用户可以逐次选择集中课程日期、查看全员排行、保存私密出行计划或主动公开寻搭子。

课程日期可以提前选择，但“已完成天数”只统计至北京时间当天；未来课程在日历显示为课程安排，不显示为实际在澳。手动补录只能填写今天及以前的日期。出行计划始终不计入已完成天数。
