# R002：计划预测及实际偏差 — 2026-09-29 测试交付

状态：**功能代码已集成；后端/纯计算自动测试通过；前端 Vite 构建与浏览器 UAT 待在 Linux Docker 验证。** 本轮在 R001 Phase 2 Windows 测试兼容版的基础上合入此前日期规则对齐 CSS 补丁。

## 实现口径

- 仍使用原 `travel_plans` 表，一个用户多条私密/公开 ACTIVE 计划均参与所选学年预测；与该学年日期无交集的计划被剔除。
- 每个计划包含出发日及返回日；展开日期并按自然日合并。每个计划日默认模拟实际逗留 **240 分钟**；调用 **R001 的同一个 `evaluateDay` 和 `makeDateRuleResolver`**，不另写日期/假期/周末/课程合规公式。两个计划重叠日最终汇总只计一次。单计划卡片的预测是它自己覆盖日期的分项，**多个单计划分项不能直接相加**。
- `forecast` 是所选学年的全部计划预测，含未来日期；COMPLIANT / PARTIAL / NON_COMPLIANT 分开计数。没有实际出行的计划假日仍属于计划 NON_COMPLIANT，但实际是 NO_STAY，二者不混用。
- 逐日对比：已结束的历史日期正式结算；今天有 OPEN 签到时不进行最终对比；今天没有实际签到时也不提前算作未兑现；今天已经签退且无 OPEN 时可即时比较；未来仅预测、不累计落后。
- `netDifferenceDays = actualCompliantDaysToDate - plannedCompliantDaysToDate`，可以为正、零、负。`missedPlannedDays` 和 `extraCompliantDays` 单独统计；净值为零也保留 `mismatchDays`、逐日原因。计划外实际 COMPLETED 合规日计入 `extraCompliantDays`。
- 学生 Dashboard、预测接口使用同一时点/同一批 R001 日期规则数据。后台改日期规则后，下次请求实时重新计算，不保存第二份统计缓存；老师综合总览将由 R004 复用，不在 R002 中重复实现。
- **未决业务 Q02：第一版按 CURRENT_ACTIVE_PLANS（目前有效计划）回算**；修改、删除旧计划会改变历史的计划基准；目前没有计划版本快照，请勿把这版当作“历史承诺原始计划”统计。

## 新增 / 扩展 API（需要现有 Session）

| 方法和路径 | 返回 / 兼容性 |
|---|---|
| `GET /api/travel-plans/prediction?yearId=<ID>` | `{prediction}`，查询本人、按选中学年。无参数则当前学年；未知学年 404，未登录 401。 |
| `GET /api/dashboard?yearId=<ID>` | 增加 `planPrediction`；保留旧 `stats`、R001 `compliance`、`openStay`。 |
| `GET /api/travel-plans?yearId=<ID>` | 可选筛选与学年日期范围相交的计划；不带参数时旧行为保留（全部未删除计划）。 |
| `GET /api/stays?yearId=<ID>` | 可选筛选与学年日期范围相交的历史记录；不带参数时旧行为保留（全部历史记录）。 |

`prediction` 主要字段：

```text
forecast: { compliantDays, partialDays, nonCompliantDays, totalPlannedDays }
perPlanForecast[]: { planId, totalDays, compliantDays, partialDays, nonCompliantDays }
comparison: {
  plannedCompliantDaysToDate, actualCompliantDaysToDate,
  missedPlannedDays, extraCompliantDays, mismatchDays, netDifferenceDays, settledDays
}
dailyResults[]: {
  date, isPlanned, planStatus, actualStatus, stayMinutes, settlement,
  settled, mismatch, difference, plannedReasonCode, actualReasonCode, matchedRules
}
```

`settlement` 为 `FUTURE`、`TODAY_PENDING`、`IN_PROGRESS`、`SETTLED`。`difference` 为 `NOT_SETTLED`、`MISSED`、`EXTRA`、`STATUS_MISMATCH`、`MATCH`。

## 代码和数据影响

- 新增：`server/services/year-rule-data.mjs`（R001/R002 共用 DB 日期规则来源读取）、`server/services/plan-prediction.mjs`（纯计算 + DB 适配器）。
- 轻微调整：`server/services/stay-compliance.mjs` 支持使用同一批预读规则；`server/index.mjs` 增加 API，保持 V1 计划 CRUD 和原 Session 鉴权；`src/App.vue` / `src/styles.css` 展示预测、净差异、偏差、按学年计划和记录筛选。
- 不新建表、不修改 `server/db.mjs` 或 schema version（仍为 2），不触碰 R003 座位和 R004 老师综合视图。旧排行榜 / ADMIN 人员统计 / CSV 继续保留旧 V1 口径，不能与 R001 `compliantDays` 混用。
- 自动测试：已有 R001/V1 31 个，加 R002 纯计算 6 个、API 端到端 1 个，共 38 个。用临时 SQLite 库，不写运行中的测试数据库。

## 建议的 R002 手动验收

1. 学生新建一条周五至下周一计划，查看预测；再新建重叠计划，去重总天数不能增加重叠日。
2. 将普通周末设为有效周末，再设为公共假期，学生端预测必须实时按 R001 规则更改。
3. 在已经结束的工作日计划下无真实签到时，看到“计划未兑现”；在另一个无计划的工作日补录 4 小时，看到“额外完成”，净值可能为零但偏差明细仍保留。
4. 新增未来计划，预计完全符合增加，但“截至当前应完成”以及“计划未兑现”不能因未来未签到而变化。
5. 今天 OPEN 签到时不提前记为缺失；完成签退后重新统计。切换学年和“查看全部历史计划”，验证界面边界。
6. 在浏览器窄屏检查计划指标卡、日期明细列表不溢出。

## Linux 并行验收（保留 R001 3100 测试站）

推荐将此 ZIP 解压到 `/opt/douliuji-test/douliuji-r002/`，并使用仓库根目录 `docker-compose.r002.yml`。它只声明 `app`，使用 **127.0.0.1:3200**、专用 `r002-test-data`、独立 `.env.r002`；不会启动第二套 Caddy，也不会访问 R001 的 `r001-test-data` 或正式版数据库。

```bash
cd /opt/douliuji-test/douliuji-r002
mkdir -p r002-test-data && chmod 700 r002-test-data
umask 077
TEST_PASS="$(openssl rand -hex 16)"
TEST_INVITE="$(openssl rand -hex 12)"
printf 'INIT_ADMIN_USER=r002admin\nINIT_ADMIN_PASSWORD=%s\nINIT_INVITE_CODE=%s\n' "$TEST_PASS" "$TEST_INVITE" > .env.r002
unset TEST_PASS TEST_INVITE
sudo ss -ltnp | grep ':3200 ' || echo '3200 未占用'
sudo docker compose -f docker-compose.r002.yml -p douliuji-r002-test config --services  # 应仅有 app
sudo docker compose -f docker-compose.r002.yml -p douliuji-r002-test up -d --build
sudo docker compose -f docker-compose.r002.yml -p douliuji-r002-test ps
curl http://127.0.0.1:3200/health
sudo docker compose -f docker-compose.r002.yml -p douliuji-r002-test exec -T app npm test
```

Windows 使用 `ssh -N -L 3200:127.0.0.1:3200 ubuntu@服务器IP` 后访问 `http://localhost:3200`。切勿把 `.env.r002`、用户数据上传到仓库或反馈截图中。

备注：当前产物构建环境缺少 npm 网络下载能力（`npm ci` 缺依赖），故 **未声称 Vite build 已通过**；上述 Docker 构建会在你的服务器进行 Vue 构建，请以实际日志和浏览器检验为准。
