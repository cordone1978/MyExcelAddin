# 报价系统 Linux 发布与维护文档

更新时间：2026-02-24

本文用于将当前 Excel 加载项项目发布到公司内网 Linux 服务器（已知服务器地址：`192.168.1.79`），并作为后续维护手册使用。

## 1. 发布目标与架构

当前项目包含两部分：

1. 前端静态页面（`dist/`）
   - `taskpane.html`
   - `commands.html`
   - `quoteSummaryPreview.html`
   - 对应 js/css/assets
2. Node.js 后端（`server.js`）
   - 提供 API（`/api/*`）
   - 提供静态资源（`dist/`）
   - 提供 PDF 导出接口（`/api/export-quote-pdf`，依赖 `puppeteer`）

推荐部署方式（当前项目默认）：
- 直接运行 `server.js`（HTTPS）
- 端口：`3001`
- `manifest.xml` 指向 `https://192.168.1.79:3001`

## 2. 发布前准备

### 2.1 服务器环境要求

- Linux（建议 Ubuntu 20.04+/Debian 11+/CentOS 7+）
- Node.js 18+（建议 20 LTS）
- npm 9+
- git（可选）
- 能访问数据库（`quotation`）

### 2.2 PDF 导出依赖（Puppeteer）

项目已使用 `puppeteer` 生成 PDF。Linux 常见需要安装系统依赖（不同发行版包名略有差异）。

Ubuntu/Debian 常用依赖示例：

```bash
sudo apt-get update
sudo apt-get install -y \
  ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
  libc6 libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 libfontconfig1 \
  libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
  libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
  libxshmfence1 libxss1 libxtst6 wget xdg-utils
```

### 2.3 HTTPS 证书（必须）

Office 加载项要求 HTTPS。你需要：

1. 为 `192.168.1.79` 或内网域名签发证书（推荐内网域名）
2. 将证书文件放到项目上级目录（默认逻辑）
3. 修改 `serverConstants.js` 中证书文件名（如有需要）
4. 在所有客户端电脑上信任证书（或信任公司 CA）

注意：
- 开发证书 `localhost+2.pem` 不适合生产地址 `192.168.1.79`
- 证书名称不匹配会导致加载项无法正常打开

## 3. 一次性发布流程（手工）

### 3.1 上传/拉取代码到服务器

建议目录：

```bash
/opt/quotationaddin
```

### 3.2 安装依赖并构建

```bash
cd /opt/quotationaddin
npm install
npm run build
```

### 3.3 修改生产配置（必须）

至少确认以下配置已指向服务器：

1. `src/shared/appConstants.ts`
- `SERVER_CONFIG.host = "192.168.1.79"`
- `SERVER_CONFIG.port = 3001`

2. `serverConstants.js`
- `SERVER_CONFIG.host = "192.168.1.79"`
- `SERVER_CONFIG.port = 3001`
- `ACTIVE_DB = "company"`（若上线使用公司库）

3. `manifest.xml`
- 所有 `https://localhost:3000/...` 改成 `https://192.168.1.79:3001/...`
- `AppDomain` 增加/改成 `https://192.168.1.79:3001`

你也可以使用本文第 6 节提供的 `scripts/deploy-linux.sh` 自动完成这些替换。

### 3.4 启动服务

```bash
node server.js
```

或后台运行（不推荐长期使用）：

```bash
nohup node server.js > logs/server.out 2>&1 &
```

## 4. 推荐维护方式（脚本 + systemd / PM2）

推荐流程：

1. 使用 `scripts/deploy-linux.sh deploy` 完成配置替换、安装、构建
2. 使用 `scripts/deploy-linux.sh restart` 启动/重启服务
3. 用 `systemd` 或 `pm2` 托管进程（脚本支持 PM2，不存在时回退 nohup）

## 5. Excel 客户端发布（加载项）

### 5.1 手工侧载（快速测试）

将修改后的 `manifest.xml` 发给客户端用户，在 Excel 中加载：

- 插入 -> 我的加载项 -> 管理加载项（或组织加载项）
- 选择 `manifest.xml`

### 5.2 内网统一部署（推荐）

可选方式：
- Microsoft 365 管理中心集中部署（如果公司有对应管理能力）
- 共享文件夹目录部署（内部 IT 管理）

## 6. Linux 上线脚本使用说明

脚本路径：

- `scripts/deploy-linux.sh`

### 6.1 首次使用

```bash
cd /opt/quotationaddin
chmod +x scripts/deploy-linux.sh
```

### 6.2 常用命令

```bash
# 配置替换 + 安装依赖 + 构建（并自动重启）
./scripts/deploy-linux.sh deploy

# 仅启动
./scripts/deploy-linux.sh start

# 停止
./scripts/deploy-linux.sh stop

# 重启
./scripts/deploy-linux.sh restart

# 查看状态
./scripts/deploy-linux.sh status
```

### 6.3 常用环境变量（可选）

```bash
APP_HOST=192.168.1.79 \
APP_PORT=3001 \
APP_BASE_URL=https://192.168.1.79:3001 \
DB_PROFILE=company \
APP_NAME=quotationaddin \
./scripts/deploy-linux.sh deploy
```

说明：
- `APP_HOST`：服务地址（默认 `192.168.1.79`）
- `APP_PORT`：服务端口（默认 `3001`）
- `APP_BASE_URL`：对外访问地址（默认 `https://APP_HOST:APP_PORT`）
- `DB_PROFILE`：`serverConstants.js` 的 `ACTIVE_DB`（默认 `company`）
- `APP_NAME`：进程名（PM2/日志目录使用）

## 7. 发布后检查清单

### 7.1 服务器侧

1. API 测试

```bash
curl -k https://192.168.1.79:3001/api/test
```

2. 静态页测试

```bash
curl -k https://192.168.1.79:3001/taskpane.html
curl -k https://192.168.1.79:3001/quoteSummaryPreview.html
```

3. PDF 导出接口（仅检查接口返回，不必真的导出）

```bash
curl -k -X POST https://192.168.1.79:3001/api/export-quote-pdf \
  -H 'Content-Type: application/json' \
  -d '{"fileName":"test","html":"<!DOCTYPE html><html><body>test</body></html>"}' \
  -o /tmp/test.pdf
```

### 7.2 Excel 客户端侧

1. 加载项能显示任务窗格
2. 登录可用
3. 生成模板可用
4. 添加设备可用
5. 生成报表可用
6. 导出 PDF 可用

## 8. 常见问题排查

### 8.1 加载项打不开 / 白屏

常见原因：
- 证书未信任
- `manifest.xml` 仍指向 `localhost:3000`
- 服务器未启动
- 防火墙未放行 `3001`

排查：
- 浏览器先直接访问 `https://192.168.1.79:3001/taskpane.html`

### 8.2 生成报表可以打开，但导出 PDF 失败

常见原因：
- `puppeteer` 未安装
- Linux 缺少 Chromium 运行依赖
- 服务端无权限写临时文件（少见）

排查：
- 看服务日志中的 `Export quote PDF failed`

### 8.3 前端正常，接口报数据库错误

检查：
- `serverConstants.js` 的 `ACTIVE_DB`
- 数据库网络可达性（`192.168.1.79` 到 DB）
- 用户名密码是否正确

## 9. 建议的后续改进（维护性）

1. 将 `serverConstants.js` 与 `src/shared/appConstants.ts` 改为读取环境变量（避免发布脚本做文本替换）
2. 使用 `systemd` 托管服务（比 nohup 稳定）
3. 增加 `/api/health` 健康检查接口
4. 将 `manifest.xml` 维护为 `manifest.dev.xml` / `manifest.prod.xml`


## 10. 本次 CentOS7 + VMware 实操补充（2026-02-24）

本节基于本次实际演练过程补充，适合当前项目维护者按步骤复现。

### 10.1 VMware 网络与连通性（新手版）

1. VMware 中虚拟机网络建议选 `Bridged`（桥接）
2. Linux 中先检查网卡是否拿到 IPv4：

```bash
ip a
ip route
```

3. 只要虚拟机可以访问公司服务器 `192.168.1.79`，就可以进行服务器演练
- 虚拟机 IP 不一定必须是 `192.168.1.x`
- 本次演练示例：虚拟机 IP 为 `192.168.100.16`，但可正常 `ping 192.168.1.79`

验证命令：

```bash
ping -c 4 192.168.1.79
```

4. 如果 `ens33` 没有 IPv4（只有 IPv6）
- 优先检查 VMware 桥接是否选到了正确物理网卡
- 再检查 `/etc/sysconfig/network-scripts/ifcfg-ens33` 是否包含：
  - `BOOTPROTO=dhcp`
  - `ONBOOT=yes`

5. VMware 提示 `ide1:0` 无法连接时
- 常见原因是虚拟光驱没找到 ISO/物理光驱
- 对已安装好的系统通常无影响，可选 `No`

### 10.2 CentOS 7（7.9.2009）仓库问题与处理

CentOS 7 已 EOL，默认 `mirrorlist.centos.org` 可能不可用，需切换到 `vault.centos.org`。

处理步骤（root）：

```bash
mkdir -p /etc/yum.repos.d/backup
cp -a /etc/yum.repos.d/CentOS-*.repo /etc/yum.repos.d/backup/
sed -i 's/^mirrorlist=/#mirrorlist=/g' /etc/yum.repos.d/CentOS-*.repo
sed -i 's|^#baseurl=http://mirror.centos.org|baseurl=http://vault.centos.org|g' /etc/yum.repos.d/CentOS-*.repo
yum clean all
yum makecache
yum -y update
```

### 10.3 Node.js 版本与 CentOS 7 兼容性（重要）

本次已验证：
- CentOS 7 的 `glibc` 为 `2.17`
- `Node.js 20` 安装失败（需要 `glibc >= 2.28`）

典型报错特征：
- `Requires: glibc >= 2.28`
- `Requires: libc.so.6(GLIBC_2.28)`

结论：
- 在 CentOS 7 上演练本项目，使用 `Node.js 16`（临时方案）
- 正式生产长期建议迁移到新系统（Rocky/Alma/Stream 9）后使用 Node 20 LTS

本次成功版本：
- `node v16.20.2`
- `npm 8.19.4`

安装步骤（root）：

```bash
rm -f /etc/yum.repos.d/nodesource*.repo
curl -fsSL https://rpm.nodesource.com/setup_16.x | bash -
yum clean all
rm -rf /var/cache/yum
yum makecache
yum info nodejs | head -20   # 确认显示 16.x
yum -y install nodejs
node -v
npm -v
```

说明：
- 即使执行了 `setup_16.x`，`yum` 也可能因缓存残留仍尝试安装 `20.x`
- 必须执行 `yum clean all` 和清理 `/var/cache/yum`

### 10.4 `APP_HOST` 的正确填写方式（演练 vs 正式）

脚本命令中的 `APP_HOST` 必须填写“当前部署目标机器自身的可访问地址”。

1. VMware 虚拟机演练时（本次场景）
- 虚拟机 IP：`192.168.100.16`

```bash
APP_HOST=192.168.100.16 APP_PORT=3001 DB_PROFILE=company ./scripts/deploy-linux.sh patch
```

2. 正式部署到公司服务器时
- 服务器 IP：`192.168.1.79`

```bash
APP_HOST=192.168.1.79 APP_PORT=3001 DB_PROFILE=company ./scripts/deploy-linux.sh deploy
```

补充：
- `DB_PROFILE=company` 切换的是 `serverConstants.js` 中的数据库连接配置项（profile）
- 它不是数据库名；数据库名可以仍为 `quotation`

### 10.5 代码传输建议（Windows -> Linux VM）

不建议直接执行：

```powershell
scp -r E:\OfficeAddinProjects\quotationaddin\* user@vm:/opt/quotationaddin/
```

原因：
- 会很慢（大量小文件）
- 容易把 `node_modules` 一起传过去（没必要）
- 可能漏掉隐藏文件

推荐做法：先打包，再传输，再解压。

Windows PowerShell（宿主机）：

```powershell
cd E:\OfficeAddinProjects\quotationaddin
tar -czf quotationaddin-deploy.tgz `
  --exclude=node_modules `
  --exclude=dist `
  --exclude=.git `
  .
scp .\quotationaddin-deploy.tgz zhuhuihua@192.168.1.79:/home/zhuhuihua/
```

Linux（虚拟机）：

```bash
mkdir -p /opt/quotationaddin
chown -R zhh:zhh /opt/quotationaddin
su - zhh
cd /opt
tar -xzf quotationaddin-deploy.tgz -C quotationaddin
cd /opt/quotationaddin
ls
```

### 10.6 当前演练阶段的下一步（建议）

在代码已传到虚拟机后，按顺序执行：

```bash
cd /opt/quotationaddin
chmod +x scripts/deploy-linux.sh
APP_HOST=192.168.1.79 APP_PORT=3001 DB_PROFILE=company ./scripts/deploy-linux.sh patch
./scripts/deploy-linux.sh build
APP_HOST=192.168.1.79 APP_PORT=3001 DB_PROFILE=company ./scripts/deploy-linux.sh start
./scripts/deploy-linux.sh status
```

然后验证：

```bash
curl -k https://192.168.100.16:3001/api/test
curl -k https://192.168.100.16:3001/taskpane.html
curl -k https://192.168.100.16:3001/quoteSummaryPreview.html
```

### 10.7 本次演练结果（已验证通过/已发现问题）

#### 已验证通过

1. VMware 中的 CentOS 7 演练机可访问公司服务器 `192.168.1.79`
2. `serverConstants.js` 切换到 `ACTIVE_DB = "company"` 后，数据库连接测试成功（`quotation`）
3. `scripts/deploy-linux.sh patch` 在 CentOS 7 上可运行（修复脚本正则替换 bug 后）
4. `patch` 能正确替换以下内容：
   - `src/shared/appConstants.ts` 的 `host/port`
   - `serverConstants.js` 的 `ACTIVE_DB`
   - `manifest.xml` 中全部 `localhost:3000` URL
5. 服务启动后已成功访问（演练机地址示例 `192.168.100.78`）：

```bash
curl -k https://192.168.100.78:3001/api/test
curl -k https://192.168.100.78:3001/taskpane.html
```

#### 已发现并确认的问题（真实上线风险）

1. `CentOS 7` 无法安装 `Node 20`
- 根因：`glibc 2.17`，而 `Node 20` 需要 `glibc >= 2.28`

2. 当前项目 `puppeteer`（24.x）与 `Node 16` 存在版本代差
- 在 CentOS 7 上即使通过 `Node 16` 进行部分演练，PDF 导出链路仍是风险点
- 这意味着 `CentOS 7` 不适合作为当前版本项目的长期生产环境（尤其涉及 PDF 导出）

3. `deploy-linux.sh build` 默认使用 `npm ci`
- 当 `package.json` / `package-lock.json` 不一致时会失败
- 本次演练中因新增依赖（如 `puppeteer`）但 lock 未同步触发该问题
- 解决方式（演练期）：手工 `npm install`

4. Windows 到 Linux VM 的 `scp/ssh` 可能因 VMware 网络波动出现 `Connection reset`
- 本次通过修复 SSH 配置（`UseDNS no`）与重新获取 IP 后恢复连接

### 10.8 SSH / SCP 实操坑位（本次已踩坑）

1. Linux 虚拟机 IP 会变化（DHCP）
- 本次演练 IP 从 `192.168.100.16` 变为 `192.168.100.78`
- 重新连接前先执行：

```bash
ip a
```

2. `sshd` 握手阶段被 reset 时的处理
- 检查：`/var/log/secure`
- 优化 SSH 配置：

```bash
UseDNS no
MaxStartups 100:30:200
```

- 重启服务：

```bash
systemctl restart sshd
```

3. `scp` 上传到 `/opt/` 报 `Permission denied`
- 原因：普通用户（如 `zhh`）默认无 `/opt` 写权限
- 正确做法：先传到家目录 `~`，再在 Linux 中解压到 `/opt/quotationaddin`

Windows：

```powershell
scp .\quotationaddin-deploy.tgz zhh@<vm_ip>:~
```

Linux（root）：

```bash
mkdir -p /opt/quotationaddin
tar -xzf /home/zhh/quotationaddin-deploy.tgz -C /opt/quotationaddin
chown -R zhh:zhh /opt/quotationaddin
```

4. `~` 路径在 root 与普通用户下含义不同
- `root` 下执行 `~/file` 会展开为 `/root/file`
- 本次压缩包实际在 `/home/zhh/quotationaddin-deploy.tgz`

### 10.9 对正式发布的建议（基于本次演练）

1. 若正式服务器为 CentOS 7：
- 可进行基础服务/API/静态页发布
- 但 PDF 导出与较新 Node 版本存在长期维护风险

2. 若条件允许（推荐）：
- 将正式发布环境迁移到 `Rocky Linux 9` / `AlmaLinux 9` / `CentOS Stream 9`
- 使用 `Node 20 LTS`
- 可显著降低 `puppeteer` 与系统库兼容问题

3. 在正式上线前，建议补做：
- `deploy-linux.sh` 的容错增强（`npm ci` 失败自动回退 `npm install`）
- `systemd` 服务化部署
- 正式证书与客户端信任链验证

### 10.11 `deploy-linux.sh` 已补充的增强（2026-02-24）

为适配本次演练过程中遇到的问题，脚本已增强：

1. `patch` 支持二次切换地址
- 不再只支持 `localhost -> 新地址`
- 现支持从“任意旧地址（localhost / IP / 域名）”切换到新的 `APP_HOST:APP_PORT`
- 适用于本次场景：`192.168.100.78 -> quotation-vm.test`

2. `manifest.xml` 替换更稳
- 会按功能页面/图标 URL 和 `AppDomain` 进行正则替换
- 不依赖 `contoso` 或 `localhost` 初始值

3. `build` 容错增强
- 若 `npm ci` 因 lock 文件不一致失败，会自动回退到 `npm install`
- 更适合演练环境/临时环境

4. `patch` 前会检查 `python3`
- 若缺失会给出明确提示（CentOS 7 演练中已遇到）

### 10.10 客户端访问 `api/test` 失败的排查（本次已定位）

本次演练中，客户端无法访问：

```text
https://192.168.100.78:3001/api/test
```

最终定位为两类问题：

1. Linux 防火墙未放行 `3001/tcp`
2. HTTPS 证书名称与访问地址不匹配（`ERR_CERT_COMMON_NAME_INVALID`）

#### 10.10.1 防火墙放行 `3001/tcp`

现象：
- 服务器本机 `curl -k https://<vm_ip>:3001/api/test` 可访问
- 客户端浏览器访问失败/超时

检查：

```bash
systemctl status firewalld
firewall-cmd --list-ports
```

若 `3001/tcp` 未出现在列表中，执行（root）：

```bash
firewall-cmd --permanent --add-port=3001/tcp
firewall-cmd --reload
firewall-cmd --list-ports
```

#### 10.10.2 浏览器提示“你的连接不是专用连接” / `ERR_CERT_COMMON_NAME_INVALID`

本次现象：
- 浏览器已能访问服务器
- 但提示证书错误：
  - `你的连接不是专用连接`
  - `net::ERR_CERT_COMMON_NAME_INVALID`

根因：
- 当前服务器使用的证书文件仍是开发证书（如 `localhost+2.pem`）
- 证书签发给 `localhost`
- 实际访问地址为 `192.168.100.78`
- 证书 CN/SAN 与访问地址不匹配，浏览器/Office 拒绝或警告

结论：
- `localhost` 证书不能用于 `https://192.168.100.78:3001`
- 客户端测试（尤其 Excel 加载项）前，必须使用匹配 `IP/域名` 的证书

#### 10.10.3 演练环境证书策略（建议）

1. 快速演练（临时）
- 为演练机 IP（如 `192.168.100.78`）生成自签名证书
- 在测试客户端导入并信任该证书

2. 正式/准正式演练（推荐）
- 使用内网域名（如 `quotation-test.company.local`）
- 为域名签发证书（公司 CA 或内网证书体系）
- 客户端统一信任 CA

说明：
- Office 加载项对证书校验通常比浏览器更严格
- 即使浏览器允许“继续访问”，Excel 中也可能白屏或打不开

## 11. 上线记录模板
- 建议每次上线后填写：`docs/development/production-rollout-record-template.md`
