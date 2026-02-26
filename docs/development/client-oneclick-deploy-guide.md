# 客户端一键部署方案（v1.3）
更新日期：2026-02-25

本文说明“客户端真正一键部署（接近无感）”的落地方案与当前 v1 安装包的使用方法。

## 1. 目标
客户端执行一次安装脚本后，自动完成：
1. `hosts` 配置（DNS 未就绪时）
2. 根证书导入（信任 `quotation.company` 证书链）
3. HTTPS 连通性验证
4. 共享目录可达性验证（`\\quotation.company\office-addins`）
5. 打开 Excel 与验证页面

说明：
- Excel “共享加载目录”配置因 Office 版本差异较大，v1.1 已增加注册表自动配置共享加载目录（Trusted Add-in Catalog）尝试；因 Office 版本差异，仍保留最后一步人工确认（1-2 次点击）
- 这已经能覆盖 80%~95% 的客户端部署工作量

## 2. 安装包结构（v1.3）
目录：`scripts/client-install/`（v1.3 新增 `config.json`）

文件：`config.json` 用于配置域名/端口/默认IP/共享目录/SMB凭据，后续换环境无需修改脚本。`r`n`r`n文件：
- `install-client.bat`：管理员入口（双击运行）
- `install-client.ps1`：PowerShell 主脚本（核心逻辑）
- `README.txt`：给同事的简版说明
- `quotation-company-root.cer`（或 `rootCA.cer`/`rootCA.pem`）：根证书
- `manifest.xml`：Excel 手工侧载兜底文件（共享目录方案失败时使用）

## 3. 打包给同事
维护者将文件放入 `scripts/client-install/` 后执行：

```powershell
.\scripts\build-client-install-package.bat
```

生成：
- `summary/client-install-package.zip`

## 4. 同事执行步骤（管理员运行）
1. 解压 `client-install-package.zip`
2. 右键 `install-client.bat` -> `以管理员身份运行`
3. 脚本默认读取 `config.json` 中的服务器 IP（无需手动输入）
4. 脚本自动完成：
   - 更新 `hosts`
   - 导入根证书
   - 刷新 DNS 缓存
   - 验证 HTTPS URL 与共享目录
   - 打开浏览器、共享目录、Excel
5. 在 Excel 中配置共享加载目录（若尚未配置）并打开 `报价系统`

## 5. 默认配置（可按需改脚本）
`install-client.ps1` 默认值：
- 域名：`quotation.company`
- 端口：`3001`
- 共享目录：`\\quotation.company\office-addins`
- 默认 IP：`192.168.1.79`

若服务器 IP 变化：
- 同事重新执行 `install-client.bat` 即可（维护者先更新 `config.json` 中的 IP）
- 无需更换证书（域名不变）

## 6. v1 仍保留的人工步骤
1. Excel 中添加/确认共享加载目录路径（首次）
2. 在“我的加载项”里打开 `报价系统`

## 7. 后续可升级方向（v2/v3）
1. 尝试脚本化写入 Office 共享加载目录配置（按 Office 版本区分）
2. 增加日志输出文件，便于远程排障
3. 与组策略结合：统一下发根证书与 hosts（或改为公司 DNS）
4. 与公司 M365 管理中心集成，彻底取消 manifest 兜底侧载路径
