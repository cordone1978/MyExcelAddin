# Claude Code 工作准则

> 本文件定义 Claude Code 在本项目中的工作职能、核心规则和沟通准则，将持续完善。

---

## 1. 工作职能

Claude Code 是一个帮助完成软件工程任务的 CLI 工具，具体协助：

- 编写和修改代码
- 修复 bug
- 重构代码
- 解释代码逻辑
- 添加新功能
- 运行测试和命令
- 探索代码库

---

## 2. 核心规则

### 2.1 安全与规范
- 只支持**授权的安全测试**（渗透测试、CTF、防御性安全研究）
- 拒绝恶意目的的请求（DoS 攻击、供应链攻击、检测规避等）
- 注意代码安全，避免 OWASP Top 10 漏洞（XSS、SQL 注入、命令注入等）

### 2.2 工作原则
- **严格按命令执行**：只做用户明确要求的事，不随意增加或删除功能，如有改变建议必须先征得用户同意
- **先读后写**：永远先阅读文件再建议修改，不要对未读过的文件提出修改建议
- **避免过度工程**：只做被要求的事，不添加不必要的功能、抽象层或"改进"
- **优先编辑而非创建**：尽量修改现有文件，减少创建新文件
- **不主动创建文档**：除非用户明确要求，否则不创建 README、注释、文档等
- **不用表情符号**：除非用户明确要求，否则不使用表情符号
- **不给时间估计**：不预测任务需要多长时间

### 2.3 代码风格
- 保持函数短小、职责清晰
- 只修改必要的部分，不进行"配套清理"
- 不添加未使用的功能或配置
- 不添加向后兼容的 hack

### 2.4 工具使用
- **文件搜索**：使用 Glob/Grep 而非 bash 的 find/grep
- **文件读取**：使用 Read 而非 bash 的 cat
- **文件编辑**：使用 Edit 而非 bash 的 sed/awk
- **文件创建**：使用 Write 而非 bash 的 echo 重定向
- **复杂任务**：使用 Task 工具启动专门的子代理

### 2.6 编码处理
- 涉及中文内容的文件，一律按 UTF-8 读取与写入
- 读写时明确指定编码（例如 `-Encoding UTF8`），避免系统默认代码页导致乱码
- 若不确定文件编码，先确认（如查看 git 原始内容或用字节级检测）再修改

### 2.5 沟通与决策
- **需要澄清时**：使用 `AskUserQuestion` 工具询问用户
- **复杂任务**：使用 `Task` 工具启动 Explore/Plan/通用代理
- **简短回应**：输出要简短，适合命令行显示
- **引用代码**：引用代码时使用 `file_path:line_number` 格式

---

## 3. 项目特定规范（来自 PROJECT_GUIDE.md）

### 3.1 目录职责
- `src/taskpane/` - 任务窗格 UI 与入口逻辑
- `src/commands/` - Ribbon 命令逻辑
- `src/dialog/` - 业务对话框（Canvas 叠加、热点、标注）
- `src/buildsheet/` - Excel 表格生成逻辑

### 3.2 文件职责原则
- HTML 只放结构
- CSS 只放样式
- 所有 JS/TS 逻辑必须在 TS 文件中
- 模块按职责拆分（数据 / UI / 画布 / API）

### 3.3 构建与测试
- 只改 `src/`，禁止改 `dist/`
- 修改后必须 `npm run build:dev`
- 测试前重新加载 Taskpane（Ctrl+F5 或关闭重开）
- 对话框关闭后重新打开

### 3.4 代码风格
- TS/JS：2 空格缩进，双引号
- Office.js 统一用 `Excel.run` + `context.sync`

### 3.5 运行约定
- Ribbon 命令必须 `event.completed()`
- 对话框与后端均使用 HTTPS（Office 要求）
- Canvas 需 `crossOrigin="anonymous"` 才能读像素/导出

---

## 4. 开发命令速查

```bash
npm run build        # 生产构建
npm run build:dev    # 开发构建
npm run watch        # 开发构建+监听
npm run start        # 启动 dev server + 后端
npm run start:excel  # 启动 Excel 调试
npm run stop         # 停止调试
npm run validate     # 验证 manifest
npm run lint         # 代码检查
npm run lint:fix     # 自动修复
claude --dangerously-skip-permissions   # 跳过权限确认
codex --dangerously-bypass-approvals-and-sandbox   # 跳过权限确认

```

---

## 5. 后端 API 约定

- 后端地址：`https://localhost:3001`
- 数据库：`quotation`
- 主要接口：
  - `GET /api/categories`
  - `GET /api/projects/:categoryId`
  - `GET /api/details/:projectId`
  - `GET /api/annotations/:projectId`
  - `GET /api/config/:projectId`
  - `GET /api/crafting/:componentId`
  - `GET /api/materials/:componentId`
- 图片：`/public/images/*.png`

---

## 6. 常见问题

- **对话框打不开**：检查 `dist/dialog.html` 是否生成
- **图片不显示**：检查 3001 是否启用 HTTPS + CORS + `crossOrigin`
- **Excel 卡死**：检查 `event.completed()`
- **变更不生效**：确认 build 后刷新 Taskpane/对话框

---

## 7. 待完善项

*（此处供用户后续添加更多工作准则）*

---

## 8. Repository Guidelines (Merged from AGENTS.md)

### 8.1 Project Structure & Module Organization
- `src/commands/`: command surface HTML/TS used by the add-in ribbon.
- `src/taskpane/`: taskpane UI (`taskpane.html`, `taskpane.ts`, `taskpane.css`).
- `src/dialog/`: dialog UI entry point (`dialog.html`).
- `public/`: static assets copied into the bundle.
- `assets/` and `images.pkd`: image assets and packed image bundle.
- `server.js`: local Express server for API/dev support.
- `manifest.xml`: Office Add-in manifest (entry point for sideloading).
- `dist/`: webpack build output (generated; do not edit manually).

### 8.2 Build, Test, and Development Commands
Run commands from the repo root:
- `npm run build`: production bundle via webpack.
- `npm run build:dev`: development bundle (no dev server).
- `npm run dev-server`: webpack dev server only.
- `npm run start`: runs `server.js` and webpack dev server together.
- `npm run start:excel`: sideload and launch Excel for debugging.
- `npm run stop`: stop the add-in debugging session.
- `npm run watch`: rebuild on file changes.
- `npm run validate`: validate `manifest.xml`.
- `npm run lint` / `npm run lint:fix`: Office Add-in ESLint rules.
- `npm run prettier`: apply the Office Add-in Prettier config.

### 8.3 Coding Style & Naming Conventions
- TypeScript/JavaScript in `src/` with 2-space indentation and double quotes.
- Keep module names aligned with folder purpose (e.g., `taskpane.ts` for task pane logic).
- Prefer small functions and explicit Office.js async flows (`Excel.run`, `context.sync`).
- Use `office-addin-lint` and `office-addin-prettier-config` before committing.

### 8.4 Testing Guidelines
There are no automated tests in this repo today.
- If you add tests, document their location and add a script in `package.json`.
- Prefer colocated tests like `src/**/__tests__/*.test.ts` or `*.spec.ts`.

### 8.5 Commit & Pull Request Guidelines
- Recent commits use short, descriptive messages (often Chinese) without a strict convention.
- Keep commit subjects concise and imperative (e.g., "优化对话框布局").
- PRs should include: a brief summary, testing steps (commands run), and screenshots for UI changes.
- If `manifest.xml` changes, call it out explicitly and note how to sideload.

### 8.6 Security & Configuration Tips
- Do not commit secrets; configure API credentials via local environment or `.env` if introduced.
- Ensure `manifest.xml` URLs match your dev server (`https://localhost:3000` by default).
