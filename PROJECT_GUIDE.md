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
- 保持函数短小、职责清晰
- Office.js 统一用 `Excel.run` + `context.sync`

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
