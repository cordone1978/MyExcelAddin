# 共享文件夹目录发布说明（Excel 加载项 / 报价系统）
更新日期：2026-02-24

本文用于说明如何在测试环境中通过“共享文件夹目录（Shared Folder Catalog）”让同事在 Excel 中打开 `报价系统`，避免逐人手动侧载 `manifest.xml`。

## 1. 适用场景
- 服务器已可访问：`https://quotation-vm.test:3001`
- 客户端可接受执行 `setup-client-test.bat`（配置 hosts + 导入证书）
- 暂不使用 Microsoft 365 管理中心集中部署

## 2. 准备内容（维护者）
1. 测试版 `manifest.xml`
- 必须指向：`https://quotation-vm.test:3001`
2. 共享目录（Windows 文件共享或 Linux Samba 共享）
- 示例（Windows）：`\\fileserver\office-addins\`
- 示例（Linux Samba）：`\\quotation-vm.test\office-addins\`
3. 客户端配置包（给同事）
- `client-test-package.zip`（用于 hosts + 证书）

## 3. 创建共享目录（Windows 共享版，IT/维护者）
1. 在一台 Windows 机器创建目录（示例）
- `D:\office-addins`
2. 右键目录 -> 属性 -> 共享 -> 高级共享
3. 勾选“共享此文件夹”
4. 共享名建议：`office-addins`
5. 权限至少给测试同事“读取”权限
6. 将测试版 `manifest.xml` 复制到该目录

最终同事访问路径示例：
- `\\fileserver\office-addins\manifest.xml`

## 4. 创建共享目录（Linux Samba 版，接近真实环境）
适用于你当前演练方案：Linux 虚拟机同时提供应用服务和共享目录。

### 4.1 安装 Samba（CentOS 7）
```bash
yum -y install samba samba-client samba-common
```

### 4.2 创建共享目录并放入 manifest
```bash
mkdir -p /srv/office-addins
cp /opt/quotationaddin/manifest.xml /srv/office-addins/manifest.xml
chmod -R 755 /srv/office-addins
```

### 4.3 配置 Samba 共享
编辑 `/etc/samba/smb.conf`，增加共享段：

```ini
[office-addins]
   path = /srv/office-addins
   browseable = yes
   read only = yes
   guest ok = no
   valid users = addinread
```

说明：
- 推荐使用专用只读账号（如 `addinread`），比 guest 匿名访问更稳定
- 若使用 `guest ok = yes`，部分 Windows 客户端策略会限制匿名 SMB 访问

### 4.4 创建 Samba 只读账号（示例）
```bash
useradd -M -s /sbin/nologin addinread
passwd addinread
smbpasswd -a addinread
```

### 4.5 启动服务并放行防火墙
```bash
systemctl enable smb nmb
systemctl start smb nmb
firewall-cmd --permanent --add-service=samba
firewall-cmd --reload
```

### 4.6 Linux 本机验证共享
```bash
smbclient -L //localhost -N
```

预期能看到共享名：
- `office-addins`

### 4.7 Windows 客户端访问路径
- `\\quotation-vm.test\office-addins`

首次访问可能提示输入账号密码：
- 用户名：`addinread`
- 密码：`smbpasswd -a addinread` 设置的 Samba 密码

## 5. Linux Samba + SELinux 注意事项（重要）
在 CentOS 7 且 `SELinux = Enforcing` 时，常见现象是：
- Windows 能打开 `\\quotation-vm.test\office-addins`
- 但目录显示为空（看不到 `manifest.xml`）

根因通常是共享目录 SELinux 上下文错误（例如 `var_t`），Samba 无法读取。

### 5.1 检查 SELinux 状态与上下文
```bash
getenforce
ls -Zd /srv/office-addins /srv/office-addins/manifest.xml
```

如果看到类型是 `var_t`，需要改成 `samba_share_t`。

### 5.2 修复共享目录上下文
```bash
yum -y install policycoreutils-python
semanage fcontext -a -t samba_share_t "/srv/office-addins(/.*)?"
restorecon -Rv /srv/office-addins
```

复查：
```bash
ls -Zd /srv/office-addins /srv/office-addins/manifest.xml
```

预期类型为：
- `samba_share_t`

修复后如有需要重启 Samba：
```bash
systemctl restart smb nmb
```

## 6. 客户端前置（同事）
先运行你提供的：`setup-client-test.bat`
- 写入 `hosts`（`quotation-vm.test`）
- 导入测试证书
- 打开浏览器验证页

确认以下地址可打开后，再进行 Excel 配置：
- `https://quotation-vm.test:3001/api/test`
- `https://quotation-vm.test:3001/taskpane.html`

## 7. 在 Excel 中添加共享文件夹目录（一次性）
注意：不同 Office 版本界面略有差异，核心是把共享目录加入“受信任加载目录/共享文件夹目录”。

常见路径（择一）：
1. `插入` -> `我的加载项` -> `共享文件夹`
2. `文件` -> `选项` -> `信任中心` -> `信任中心设置` -> `受信任的加载项目录`
3. `我的加载项` 弹窗中的“管理/目录”入口

需要填写/选择：
- 目录路径（按你的部署方式）：
  - Windows 共享：`\\fileserver\office-addins\`
  - Linux Samba：`\\quotation-vm.test\office-addins`
- 勾选信任该目录（若有选项）

配置完成后，重新打开 Excel。

## 8. 同事实际使用方式（不侧载）
1. 打开 Excel
2. `插入` -> `我的加载项`
3. 在共享目录/组织目录中找到 `报价系统`
4. 点击添加/打开
5. 在 Ribbon 中点击 `报价系统`

## 9. 维护者更新 manifest 的注意事项
1. 更新 `manifest.xml` 后建议递增版本号（防止 Office 缓存旧版本）
2. 同事端可能需要重启 Excel 才能看到更新
3. 若服务器地址变化（域名/端口变化），需同步更新共享目录中的 `manifest.xml`

## 10. 常见问题
### 10.1 同事看不到共享目录中的加载项
检查：
1. 共享目录路径是否正确（使用 UNC 路径，不要盘符映射）
2. 同事是否有该共享目录读取权限
3. Excel 是否已重启
4. `manifest.xml` 是否可直接从资源管理器打开

### 10.2 浏览器能打开，但 Excel 加载项打不开
检查：
1. 客户端证书是否已导入到“本地计算机 -> 受信任的根证书颁发机构”
2. `hosts` 是否仍指向当前测试服务器 IP
3. `manifest.xml` 是否指向 `quotation-vm.test:3001`

### 10.3 虚拟机 IP 变化
处理：
1. 通知同事新的 IP
2. 同事重新运行 `setup-client-test.bat` 并输入新 IP
3. 无需更换证书（仍使用 `quotation-vm.test`）

### 10.4 Windows 能打开共享但目录是空的（Linux Samba 场景）
优先检查：
1. `/srv/office-addins` 是否真的有 `manifest.xml`
```bash
ls -l /srv/office-addins
```
2. `smb.conf` 中 `[office-addins]` 的 `path` 是否正确
3. `SELinux` 上下文是否为 `samba_share_t`（见第 5 节）
