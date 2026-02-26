# 报价系统 客户端测试说明书（Windows / Excel）

更新时间：2026-02-24

本文用于指导同事在 Windows 电脑上连接测试环境并侧载 Excel 加载项进行功能测试。

当前测试环境（示例）：
- 测试域名：`quotation-vm.test`
- 测试地址：`https://quotation-vm.test:3001`

说明：
- 测试服务器运行在内网 Linux 虚拟机上
- 虚拟机 IP 可能变化；若变化，只需更新 `hosts` 映射（见第 2 节）

## 1. 测试前准备（你将收到这些文件/信息）

请向维护者索取以下内容：

1. `manifest.xml`（测试版）
- 必须是指向 `https://quotation-vm.test:3001` 的版本

2. 测试证书文件
- 文件名示例：`quotation-vm.test.cer`（或 `.pem`）

3. 当前测试服务器 IP
- 示例：`192.168.100.78`

## 2. 配置 hosts（必须）

由于 `quotation-vm.test` 是测试域名，通常不在公司 DNS 中，需要手动映射到测试服务器 IP。

### 2.1 打开 hosts 文件（管理员权限）

1. 在开始菜单搜索 `记事本`
2. 右键 `记事本` -> `以管理员身份运行`
3. 打开文件：
- `C:\Windows\System32\drivers\etc\hosts`

注意：
- 打开时要把文件类型切换为 `所有文件 (*.*)`，否则看不到 `hosts`

### 2.2 添加映射行

在文件末尾增加一行（示例）：

```text
192.168.100.78 quotation-vm.test
```

保存文件。

### 2.3 验证 hosts 是否生效

打开 PowerShell，执行：

```powershell
ping quotation-vm.test
```

说明：
- 看到解析到 `192.168.100.78` 即可
- 即使 ping 不通，也不一定有问题（很多电脑/网络会禁 ICMP）

更关键的验证方式见第 4 节（浏览器 / curl）

## 3. 导入测试证书（必须）

如果不导入证书，浏览器和 Excel 可能提示不安全、白屏或无法加载。

### 3.1 导入方式（推荐图形界面）

如果证书文件是 `.pem` 且双击无法打开：
- 可先改名为 `.cer`（内容不变）
- 例如：`quotation-vm.test.pem` -> `quotation-vm.test.cer`

导入步骤：

1. 双击证书文件（`.cer`）
2. 点击 `安装证书`
3. 选择：`本地计算机`（需要管理员权限）
4. 选择：`将所有的证书都放入下列存储`
5. 点击 `浏览`
6. 选择：`受信任的根证书颁发机构`
7. 完成安装

### 3.2 命令行导入（可选）

管理员 PowerShell 执行：

```powershell
certutil -addstore Root .\quotation-vm.test.cer
```

## 4. 浏览器验证（先做这个，再进 Excel）

先确认浏览器能访问测试服务器。

### 4.1 验证 API

浏览器打开：

- `https://quotation-vm.test:3001/api/test`

预期：
- 返回类似 JSON：

```json
{"success":true,"data":[{"result":2}]}
```

### 4.2 验证任务窗格页面

浏览器打开：

- `https://quotation-vm.test:3001/taskpane.html`

预期：
- 能看到“报价系统”页面 HTML（或加载出任务窗格页面）

### 4.3 如果仍提示证书错误

常见原因：
- 证书未导入到“受信任的根证书颁发机构”
- 导入到了“当前用户”而非“本地计算机”
- 浏览器未重启（缓存旧证书状态）

处理：
- 关闭浏览器后重开，再试

## 5. Excel 侧载加载项（Windows 桌面版 Excel）

### 5.1 准备

确保：
1. `hosts` 已配置
2. 证书已导入并信任
3. 浏览器已能打开第 4 节中的地址

### 5.2 侧载步骤（通用）

1. 打开 Excel（桌面版）
2. 打开任意工作簿
3. 进入 `插入` -> `我的加载项`（或“获取加载项”）
4. 选择组织/共享文件夹侧载方式，或上传本地 `manifest.xml`
5. 选择维护者提供的测试版 `manifest.xml`

说明：
- 必须使用测试版 `manifest.xml`（指向 `quotation-vm.test:3001`）
- 不要使用本地开发版（`localhost`）manifest

### 5.3 打开任务窗格

成功后在 Excel 功能区（Ribbon）中应看到：
- 按钮名称：`报价系统`

点击后应打开任务窗格。

## 6. 功能测试建议顺序

建议按以下顺序测试，便于定位问题：

1. 打开任务窗格
2. 登录
3. 生成模板
4. 添加设备
5. 查询价格
6. 生成报表
7. 导出 PDF

## 7. 测试结果反馈建议（发给维护者）

为提高排查效率，反馈时请包含：

1. 测试电脑名称（或用户名）
2. 测试时间
3. 是否已配置 hosts
4. 是否已导入证书
5. 出错步骤（例如“侧载后点报价系统按钮”）
6. 错误截图（完整窗口）
7. 浏览器访问以下地址的结果：
- `https://quotation-vm.test:3001/api/test`
- `https://quotation-vm.test:3001/taskpane.html`

## 8. 常见问题排查（同事自助版）

### 8.1 浏览器打不开 `https://quotation-vm.test:3001/api/test`

检查：
1. `hosts` 是否有这一行：

```text
<测试服务器IP> quotation-vm.test
```

2. 测试服务器 IP 是否变更（向维护者确认最新 IP）
3. 当前电脑是否在同一内网/可访问测试网络

### 8.2 提示“你的连接不是专用连接”或证书错误

检查：
1. 是否已导入测试证书
2. 是否导入到 `受信任的根证书颁发机构`
3. 浏览器是否重启

### 8.3 Excel 中加载项白屏 / 打不开

常见原因：
1. 证书未信任（最常见）
2. `manifest.xml` 不是测试版（仍指向 `localhost`）
3. 测试服务器未启动或地址不可达

先用浏览器验证第 4 节中的两个地址，再回到 Excel 测试。

### 8.4 ping 不通但浏览器/curl 能访问

这是允许的，不一定是问题。

原因：
- 很多网络环境会禁用 ICMP（ping）
- 只要 `https://quotation-vm.test:3001/...` 能访问即可继续测试

## 9. 注意事项

1. 测试环境地址和证书可能会更新，请以维护者通知为准
2. 若虚拟机 IP 变更，维护者会通知新的 IP；需要更新 `hosts`
3. 不要将测试证书或 `manifest.xml` 用于生产环境

## 10. 维护者快速打包（给同事分发）

仓库已提供两个 Windows 批处理脚本：

1. `scripts/client-test/setup-client-test.bat`
- 同事侧执行（管理员运行）
- 自动配置 `hosts` + 导入证书 + 打开验证页面

2. `scripts/build-client-test-package.bat`
- 维护者侧执行
- 自动将客户端测试包压缩为 zip（便于发给同事）

### 10.1 打包前准备（维护者）

将以下文件复制到目录：

- `scripts/client-test/`

需要放入：
- `manifest.xml`（测试版，指向 `quotation-vm.test:3001`）
- `quotation-vm.test.cer`（或 `quotation-vm.test.pem`）

### 10.2 生成 zip 包

双击或在 PowerShell 中运行：

```powershell
.\scripts\build-client-test-package.bat
```

生成位置：
- `summary/client-test-package.zip`
