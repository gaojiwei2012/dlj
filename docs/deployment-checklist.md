# 逗留记上线检查清单

## 上线前

- 域名已经解析到服务器公网 IP。
- `.env` 已设置正式域名、强管理员密码和非默认邀请码。
- `npm run check:production` 检查通过。
- 服务器开放 80 和 443 端口。
- `data` 与 `backups` 目录有足够磁盘空间。
- 构建上下文由 `.dockerignore` 排除 `.env`、数据库与备份；检查镜像中没有这些文件。

## 首次启动

- 执行 `docker compose up -d --build`。
- `/health` 返回 `status: ok`。
- 执行 `npm run smoke:production -- https://你的域名`，检查 HTTPS 首页、健康接口及 PWA 配置。
- 使用管理员账号登录并立即确认学年、目标天数和无效日期。
- 创建仅供试运行人员使用的邀请码。
- 创建一条测试签到和签退记录并核对统计。

## 试运行

- 先邀请 5 至 10 人使用一周。
- 检查跨零点、忘记签退补录、课程日期和无效日期计算。
- 检查普通用户无法进入管理员接口或查看他人明细。
- 检查私密计划不会出现在寻搭子列表。
- 下载人员统计和逗留明细，核对中文与日期。

## 备份恢复

- 确认 `backups` 每日生成新文件并只保留设定数量。
- 先执行 `docker compose stop backup app`，确保没有进程仍在访问数据库。
- 恢复命令：`docker compose run --rm --no-deps backup node server/backup.mjs --restore /backups/备份文件名.db`，然后执行 `docker compose up -d`。恢复会先检查 SQLite 文件完整性并清理旧 WAL/SHM 文件。
- 恢复后重新检查登录、首页统计、课程和排行榜。

## 正式开放

- 所有影响日期计算、权限或数据完整性的问题已经关闭。
- 保存服务器账号、域名、管理员账号和恢复步骤。
- 记录首个正式版本发布时间。
