# 首页逗留统计精简（V3）

基于 douliuji-test-final-v2.zip 更新。仅影响学生首页的“已逗留天数”卡片：

- 移除“目标 XX 天 / 还差 XX 天”行。
- 将灰底说明框文案替换为“本程序为方便各位同学记录逗留，相关记录仅供个人参考。逗留时间以留服认证为准”。
- 其他三项统计数据、三个编号计算规则以及计划/实际出行模块全部保留。

## 测试环境部署（只使用小补丁时）

将 homepage-notice-update-patch.zip 上传到服务器，例如 `/tmp/homepage-notice-update-patch.zip`。

```bash
cd /opt/douliuji-test/douliuji-test
unzip -o /tmp/homepage-notice-update-patch.zip -d .
sudo docker compose -f docker-compose.test.yml up -d --build
sudo docker compose -f docker-compose.test.yml ps
```

如部署完整包（`douliuji-test-final-v3.zip`），请把包解压到 `/opt/douliuji-test`，而不是解压到二级项目目录。不要覆盖服务器的数据目录或现有环境配置。正式环境不需要重建。
