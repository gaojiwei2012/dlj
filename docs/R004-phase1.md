# R004 · 老师端学生总览与合规管理（Phase 1）

基线：2026-09-30 用户上传的 `douliuji-test.zip`，包含 R001、R002、R002-UI-001/002 的前端修复。

## 范围与边界

- 继续沿用 ADMIN 能读取全系统 USER（学生）的权限范围；**没有** teacher_id / 班级归属，也没有新增角色。
- 老师端沿用 R001 日期规则管理入口（年度周末同步、公共假期、强制无效、有效周末和课程日），不重新实现。
- 学生综合总览列出 USER 账号（包括停用账号），不把 ADMIN 自己混入学生数量；原「全部人员」账号维护入口保留。
- 同一请求使用固定 `asOf` 和一次加载的学年日期规则；分别调用 `getUserCompliance()` 与 `getUserPlanPrediction()`。R004 **没有自己的合规公式**、缓存表或额外迁移。
- 老师详情只读。账号名称、密码、状态、撤销签退操作继续使用旧的 ADMIN 入口。
- 旧 `/api/admin/users` 与旧 CSV 的 `effectiveDays` 不被偷偷改成新 `compliantDays`；页面标记为 V1 旧口径。

## 新增文件与改动

| 位置 | 说明 |
|---|---|
| `server/services/admin-students.mjs` | 业务结果聚合：列表摘要 / 单人详情；复用 R001、R002 |
| `server/index.mjs` | 两个只读 ADMIN 路由 |
| `src/components/admin/StudentOverview.vue` | 独立学生总览、检索筛选、详情及响应式布局 |
| `src/App.vue` | 接入新组件；按学年切换及日期规则更改刷新；进入学生详情时隐藏无关后台卡片 |
| `src/styles.css` | 仅管理页扩展页面宽度，不改变学生端宽度 |
| `test/r004-admin-students.test.mjs` | 独立临时数据库的权限、数据一致性、学年、规则变更等 API 集成测试 |

## 新增 API

### GET `/api/admin/students?yearId=<id>`

- ADMIN 限定，其他用户 403，匿名请求 401。非法/不存在学年 404。
- 返回 `academicYear`、`asOf`、`students[]`。
- 每名学生：公开账号属性、最近正常签到、当前 OPEN 签到、`targetDays`、`remainingDays`、R001 `compliance` 汇总（无 `dailyResults`）、R002 `planPrediction` 汇总（`forecast`、`comparison` 等，*无日级列表*）。
- 所有学生包括 `status='DISABLED'` 的 USER，排除 ADMIN。不下发密码哈希。

### GET `/api/admin/students/:studentId?yearId=<id>`

- 与列表相同的 ADMIN 鉴权。学生不存在或目标不是 USER：404。
- 返回 `student`、`academicYear`、`asOf`、`targetDays`、`remainingDays`、完整 R001 `compliance.dailyResults`、完整 R002 `planPrediction.dailyResults` 和 `perPlanForecast`、本学年相交的有效计划与未删除签到记录。
- 原始记录显示北京时间秒级时刻；无时刻的旧数据明确标记待补正。
- 不返回密码哈希、邀请码或其他非必要敏感账号信息。

## 页面使用

1. 管理员登录，进入「我的 → 管理员后台」。顶部选择要查看的学年。
2. 顶部出现「学生综合总览（R004）」：显示总学生数、当前签到人数、净差异落后人数；支持姓名/账号检索、账号状态和净差异筛选。
3. 点击「查看详情」进入干净的学生详情视图，可查看 R001 合规/时长/规则原因、R002 全量计划预测/净差异/逐日对照，以及历史签到/计划；点击返回总览。
4. 切换学年，或在后台修改课程/日期规则后，组件会自动重新读取当前数据；无持久化汇总缓存。
5. 详情中的净差异为0不代表逐日一致；未来及今天的进行中签到不会提前计入未兑现。

## 测试

- `npm test`：基础 V1/R001/R002 回归 + R004 集成测试。
- R004 集成测试重点断言：匿名与普通 USER 拒绝访问、学生间私密数据隔离、管理员能看所有 USER、停用学生仍可见、OPEN 状态、学年切换、老师与学生 R001/R002 完整统计相同、公共假期更改后即时更新、原始记录保持不变。
- Vue/Vite 构建：`npm ci && npm run build`；推荐在现有 Linux 测试容器中 `up -d --build --no-deps --force-recreate app`。交付环境若缺离线依赖，构建需以服务器实际运行结果为准。
- 见 `docs/R004-验收清单.md` 的人工浏览器验收项。

## 已知边界

- 仍采用当前有效出行计划回算历史预测，不保存计划版本快照（R002 的 Q02）。
- 学生总览适合现有小规模系统；没有引入分页/统计缓存或多老师数据隔离。
- 原有 V1 排行榜、旧 CSV 及 `全部人员` 旧统计仍保持历史 API 口径，不要与新的完全符合天数混用。
- R003 座位预约不属于本轮。
