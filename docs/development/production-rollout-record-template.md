# 报价系统上线记录（模板）
更新日期：2026-02-25

用于记录真实服务器上线后的关键信息，便于后续维护、排障、交接。

## 1. 基本信息
- 系统名称：报价系统（Excel Office Add-in）
- 部署环境：生产 / 准生产（圈选）
- 上线日期：____-__-__
- 维护人：__________
- 服务器系统：CentOS 7.9
- 部署账号：zhuhuihua
- 部署目录：/home/zhuhuihua/quotationaddin

## 2. 对外访问信息
- 正式域名：quotation.company
- 服务端口：3001
- Base URL：https://quotation.company:3001
- DNS 方式：内网 DNS / hosts（圈选）
- 若为 hosts：映射 IP = __________________

## 3. 证书信息
- 证书方案：公司 CA / mkcert（圈选）
- 服务证书文件：__________________
- 服务私钥文件：__________________
- 证书所属域名（SAN）：quotation.company（确认）
- 客户端信任方式：手工导入 / 组策略下发（圈选）
- 根证书文件（若使用 mkcert）：__________________
- 证书到期日期：____-__-__

## 4. 应用部署信息
- `server.js` 启动方式：deploy-linux.sh nohup / PM2 / systemd（圈选）
- 当前运行状态确认：已确认 / 未确认
- 启动命令（最终）：
```bash
cd /home/zhuhuihua/quotationaddin
./scripts/deploy-linux.sh start
```
- 重启命令（最终）：
```bash
cd /home/zhuhuihua/quotationaddin
./scripts/deploy-linux.sh restart
```
- 状态查看命令：
```bash
cd /home/zhuhuihua/quotationaddin
./scripts/deploy-linux.sh status
```

## 5. 配置确认（上线时）
- `src/shared/appConstants.ts` 指向 `quotation.company:3001`：是 / 否
- `manifest.xml` 指向 `quotation.company:3001`：是 / 否
- `serverConstants.js` `ACTIVE_DB=company`：是 / 否
- 构建完成（`npm run build`）：是 / 否
- 最新 `manifest.xml` 已复制到共享目录：是 / 否

## 6. 数据库连接信息（当前实际）
- DB Host：192.168.1.79
- DB Name：quotation
- 配置 profile：company
- 当前使用账号：__________________
- 账号授权来源（host）：__________________
- 备注（如临时 root 授权）：__________________

## 7. 共享目录（加载项分发）
- 分发方式：Samba 共享目录（不侧载）
- 共享名：office-addins
- Linux 目录：/srv/office-addins
- Windows UNC 路径：\\quotation.company\office-addins（或实际主机名路径）
- `manifest.xml` 路径：/srv/office-addins/manifest.xml
- Samba 只读账号：__________________
- SELinux 上下文（应为 `samba_share_t`）：已确认 / 未确认

## 8. 防火墙与网络
- `3001/tcp` 放行：已确认 / 未确认
- Samba 服务放行（445/139）：已确认 / 未确认
- 客户端可访问 `https://quotation.company:3001/api/test`：已确认 / 未确认
- 客户端可访问共享目录：已确认 / 未确认

## 9. 上线验收结果（建议勾选）
- [ ] 浏览器打开 `https://quotation.company:3001/api/test`
- [ ] 浏览器打开 `https://quotation.company:3001/taskpane.html`
- [ ] Excel 从共享目录打开“报价系统”
- [ ] 任务窗格正常显示
- [ ] 登录成功
- [ ] 生成模板成功
- [ ] 添加设备成功
- [ ] 查询价格成功
- [ ] 生成报表成功
- [ ] 导出 PDF 成功（若失败，记录原因）

## 10. 已知风险 / 待办
- 服务器系统为 CentOS 7.9（Node / Puppeteer 兼容性风险）
- 当前数据库是否使用 root 临时授权：是 / 否
- 是否计划切换应用专用数据库账号：是 / 否
- 是否计划切换公司 CA / 正式证书体系：是 / 否
- 是否计划使用 systemd 托管服务：是 / 否
- 其他：________________________________________

## 11. 本次上线关键命令记录（可选）
```bash
# patch
APP_HOST=quotation.company APP_PORT=3001 DB_PROFILE=company ./scripts/deploy-linux.sh patch

# build
./scripts/deploy-linux.sh build

# start
./scripts/deploy-linux.sh start

# health check
curl -k https://127.0.0.1:3001/api/test
```
