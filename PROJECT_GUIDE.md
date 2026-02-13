# Quotation Add-in 项目规范（统一版）

## 0. 项目概览
这是一个 Excel Office Add-in（报价管理）。包含：
- Taskpane 任务窗格
- Ribbon 命令
- 业务对话框（Canvas 叠加、热点、标注）
- 后端 Express + MySQL（HTTPS）

## 1. 目录与职责
- `src/taskpane/`
  - 任务窗格 UI 与入口逻辑
  - `taskpane.html`：仅结构，禁止业务逻辑
  - `taskpane.ts`：事件绑定与功能入口
- `src/commands/`
  - Ribbon 命令逻辑
- `src/dialog/`
  - 业务对话框（有逻辑的）
  - `dialog.html`：结构
  - `dialog.css`：样式
  - `dialog.ts`：入口逻辑
  - `data.ts`：API 请求与数据处理
  - `ui.ts`：列表/表单渲染
  - `canvas.ts`：画布、叠加、热点、高亮
- `src/buildsheet/`
  - Excel 表格生成逻辑
  - `quotationSheet.ts`：入口（生成报价表 + 配置表）

## 2. 文件职责原则
- HTML 只放结构
- CSS 只放样式
- 所有 JS/TS 逻辑必须在 TS 文件中
- 模块按职责拆分（数据 / UI / 画布 / API）

## 3. 对话框规范
- 有逻辑的对话框：必须在 `src/dialog/`
- 纯展示页面：可放 `public/`（需 Copy 到 dist）
- `openDialog(url)` 必须支持传参
- 对话框与父窗口通信：`Office.context.ui.messageParent()` + `DialogMessageReceived`

## 4. Excel 生成规范
- 所有表格生成必须放在 `src/buildsheet/`
- 每个表格一个函数：
  - `buildQuotationSheet()`
  - `buildConfigSheet()`
- 统一入口：`createQuotationSheet()`
- 字体：微软雅黑 11号
- 标题：16号
- 备注区必须按行合并单元格

## 5. 构建规范
- 只改 `src/`，禁止改 `dist/`
- 修改后必须 `npm run build:dev`
- 测试前重新加载 Taskpane

## 6. 构建后刷新流程
1) `npm run build:dev`
2) Taskpane 内按 `Ctrl+F5` 刷新或关闭再打开
3) 对话框关闭后重新打开
4) 仍无效时才重启 Excel

## 7. 代码风格
- TS/JS：2 空格缩进，双引号
- **注释必须使用中文（强制）**
- 保持函数短小、职责清晰
- Office.js 统一用 `Excel.run` + `context.sync`

## 7.1 禁止硬编码（强制）
- **坚决杜绝硬编码。**
- 所有可复用字面量必须提取为常量，禁止在业务代码中重复写死：
  - URL / API 路径 / 端口
  - 对话框路径与尺寸
  - 业务文案、提示语、标题、表头
  - 默认值、魔法数字、颜色、列宽、字号、正则规则
- 常量统一存放到 `src/shared/`（按领域拆分）：
  - `appConstants.ts`
  - `buildsheetConstants.ts`
  - `businessTextConstants.ts`
- 后端常量统一存放到 `serverConstants.js`
- 仅允许以下硬编码例外：
  - 临时调试代码（提交前必须删除）
  - 与 Office API 绑定的必要枚举字符串（无法抽象时）

## 8. AI 助手协作规则（重要）

### 8.1 代码修改红线
**绝对禁止在未经用户明确许可的情况下修改任何代码文件。**

#### 正确流程：
```
用户提出问题 → AI 分析问题 → AI 给出结论和修改建议 → 用户确认 → AI 执行修改
```

#### 错误流程：
```
用户提出问题 → AI 直接修改代码  ❌ 禁止
```

### 8.2 分析阶段的边界
- ✅ 允许：读取文件、搜索代码、分析问题、给出结论
- ✅ 允许：列出需要修改的位置、给出修改前后的 diff
- ✅ 允许：解释问题原因、提供处理建议
- ❌ 禁止：使用 Edit/Write 工具修改任何文件
- ❌ 禁止：执行构建、部署等破坏性操作

### 8.3 用户确认的方式
只有以下情况才能执行代码修改：
1. 用户明确说"修改"、"执行"、"帮我改"等
2. 用户选择包含修改内容的选项（如 AskUserQuestion）
3. 用户在任务列表中确认执行修改

### 8.4 "分析"与"修改"的明确区分
| 用户提问示例 | 正确响应 |
|-------------|---------|
| "分析一下问题" | 只分析，不修改 |
| "看看代码怎么回事" | 只看，不改 |
| "如何修复" | 给方案，不改代码 |
| "帮我修复这个问题" | 可以修改 |
| "需要我修复吗？" | 等待用户确认 |

### 8.5 违规后果
- AI 助手违反此规则 → 用户信任度下降
- 未经验证的修改 → 可能引入新问题
- 代码库历史混乱 → 难以追溯变更

---

## 9. 关键运行约定

## 8. 关键运行约定
- Ribbon 命令必须 `event.completed()`
- 对话框与后端均使用 HTTPS（Office 要求）
- Canvas 需 `crossOrigin="anonymous"` 才能读像素/导出

## 9. 开发命令速查
- `npm run build`：生产构建
- `npm run build:dev`：开发构建
- `npm run watch`：开发构建+监听
- `npm run start`：启动 dev server + 后端
- `npm run start:excel`：启动 Excel 调试
- `npm run stop`：停止调试
- `npm run validate`：验证 manifest
- `npm run lint` / `npm run lint:fix`

## 10. 架构与入口点
Webpack 入口：
- taskpane：`src/taskpane/taskpane.ts` + `taskpane.html` -> `dist/taskpane.html` + `taskpane.js`
- commands：`src/commands/commands.ts` -> `dist/commands.html` + `commands.js`
- dialog：`src/dialog/dialog.ts` + `dialog.html` -> `dist/dialog.html` + `dialog.js`

## 11. 后端与 API 约定
- 后端：`https://localhost:3001`
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

## 12. Dialog Canvas 约定
- 组件结构：`{ id, name, imageUrl, layer, image, loaded, visible }`
- 叠加渲染：按层级排序绘制
- 命中检测：分析画布（analysis canvas）+ `getImageData`
- 悬停高亮：`renderCanvas(highlightId)` + 描边图
- 热点：红色圆点 + 百分比坐标
- 图片加载：必须 `crossOrigin="anonymous"` + `encodeURIComponent` + 缓存破坏参数

## 13. 常见问题
- 对话框打不开：检查 `dist/dialog.html` 是否生成
- 图片不显示：检查 3001 是否启用 HTTPS + CORS + `crossOrigin`
- Excel 卡死：检查 `event.completed()`
- 变更不生效：确认 build 后刷新 Taskpane/对话框

## 14. 代码文件清单（根目录 + src）
说明：按你当前约定，代码主要位于项目根目录与 `src/` 目录。以下为当前清单。

根目录代码/配置文件：
- `babel.config.json`
- `diagnose.js`
- `manifest.xml`
- `package.json`
- `package-lock.json`
- `server.js`
- `tsconfig.json`
- `unpack.js`
- `webpack.config.js`
- `.eslintrc.json`

`src/` 源码文件：
- `src/buildsheet/index.ts`
- `src/buildsheet/insertRows.ts`
- `src/buildsheet/quotationSheet.ts`
- `src/commands/commands.html`
- `src/commands/commands.ts`
- `src/dialog/craftmodify.css`
- `src/dialog/craftmodify.html`
- `src/dialog/craftmodify.ts`
- `src/dialog/devmodify.css`
- `src/dialog/devmodify.html`
- `src/dialog/devmodify.ts`
- `src/dialog/dialog.css`
- `src/dialog/dialog.html`
- `src/dialog/dialog.ts`
- `src/dialog/handleDialogData.ts`
- `src/dialog/queryprice.css`
- `src/dialog/queryprice.html`
- `src/dialog/queryprice.ts`
- `src/shared/dialogActions.ts`
- `src/shared/sheetNames.ts`
- `src/taskpane/devCraftController.ts`
- `src/taskpane/devCraftDataService.ts`
- `src/taskpane/devCraftTypes.ts`
- `src/taskpane/querypriceController.ts`
- `src/taskpane/quotationSelectionService.ts`
- `src/taskpane/taskpane.css`
- `src/taskpane/taskpane.html`
- `src/taskpane/taskpane.ts`
