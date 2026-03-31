# UI 开发规范

最后更新：2026-03-30

## 1. 目的

本文件用于约束本项目 UI 的开发方式，解决当前样式散落、重复定义、模块间不一致的问题。

本规范关注的是“怎么开发”，不是“长什么样”。视觉风格基线见：

- [UI 独立风格定义](./ui-style-foundation.md)

## 2. 适用范围

适用于以下前端模块：
- `src/taskpane`
- `src/dialog`
- `src/info-reference`
- `src/graph-editor`
- `src/quote-preview`

## 3. 基本原则

### 3.1 先 token，后组件，最后页面

任何新样式开发必须按以下顺序进行：

1. 先判断是否已有 token 可复用
2. 没有则先补 token
3. 再判断是否已有共享组件类可复用
4. 最后才允许页面级局部样式

禁止直接在页面 CSS 中先写死颜色、圆角、间距，再事后抽取。

### 3.2 不允许模块自建一套基础控件

以下基础控件必须共享：
- 按钮
- 输入框
- 下拉框
- 文本域
- 标签
- 卡片
- 列表项选中态
- 状态提示

如果某模块需要特殊变体，应基于共享基类扩展，不允许重新定义一套同名 `.btn`、`.input`。

### 3.3 页面样式只处理布局和局部语义

页面 CSS 应主要负责：
- grid / flex 布局
- 响应式切换
- 页面特有区域结构
- 业务特定状态

页面 CSS 不应重复定义：
- 品牌主色
- 通用按钮形态
- 通用输入框形态
- 通用阴影和圆角

## 4. 文件组织规范

建议新增并逐步迁移到以下结构：

- `src/styles/tokens.css`
- `src/styles/base.css`
- `src/styles/components.css`
- `src/styles/utilities.css`

建议职责：

`tokens.css`
- 颜色
- 间距
- 圆角
- 阴影
- 字体
- 字号
- 行高
- 层级 z-index

`base.css`
- `html` / `body` / `*` 基础规则
- 默认字体栈
- 默认文本色

`components.css`
- `.ui-btn`
- `.ui-input`
- `.ui-card`
- `.ui-tag`
- `.ui-listbox`
- `.ui-feedback`

`utilities.css`
- 少量跨页工具类，如：
  - `.is-hidden`
  - `.text-danger`
  - `.text-muted`
  - `.surface-subtle`

## 5. Token 规范

### 5.1 命名原则

统一使用语义命名，不使用视觉结果命名。

推荐：
- `--color-brand-primary`
- `--color-text-primary`
- `--color-border-muted`
- `--radius-md`
- `--space-3`
- `--shadow-md`

不推荐：
- `--blue-1`
- `--gray-border-2`
- `--round-big`

### 5.2 Token 分类

至少应包含：
- 品牌色 token
- 文本色 token
- 背景色 token
- 边框色 token
- 状态色 token
- 圆角 token
- 间距 token
- 阴影 token
- 字体 token
- 行高 token

### 5.3 禁止事项

- 禁止在新增样式中继续使用裸值 `#0078d4`
- 禁止新增 `#333`、`#222`、`#666`
- 禁止在多个文件重复写同一组阴影参数
- 禁止新增无来源的 `10px`、`14px`、`18px` 圆角

## 6. 组件规范

### 6.1 按钮

统一基类建议：
- `.ui-btn`
- `.ui-btn--primary`
- `.ui-btn--secondary`
- `.ui-btn--danger`

要求：
- 高度、padding、圆角统一
- `hover / active / focus / disabled` 状态完整
- 文字居中
- 不同模块不得各自定义不同高度主按钮

### 6.2 输入控件

统一基类建议：
- `.ui-input`
- `.ui-select`
- `.ui-textarea`

要求：
- 边框、背景、字体、焦点态统一
- 表单行高统一
- 搜索框和普通输入框只允许做轻量差异，不允许重建一套风格

### 6.3 反馈组件

统一基类建议：
- `.ui-feedback`
- `.ui-feedback--success`
- `.ui-feedback--warning`
- `.ui-feedback--danger`
- `.ui-feedback--info`

要求：
- 颜色必须走状态 token
- 文案大小、内边距、圆角统一

### 6.4 卡片与面板

统一基类建议：
- `.ui-card`
- `.ui-card--dense`
- `.ui-card--elevated`

要求：
- 卡片不允许每页定义一套新的背景和阴影
- 卡片只在密度和层级上区分，不在视觉语言上分裂

## 7. 页面布局规范

### 7.1 布局优先级

优先使用：
- `flex`
- `grid`
- `minmax()`
- `repeat()`

固定像素宽度可以使用，但必须满足以下条件之一：
- 表格列需要稳定对齐
- 选择器列需要保证可读性
- 图片/预览区有明确最小尺寸要求

如果使用固定宽度：
- 需要写清楚业务原因
- 需要配套断点或容器降级策略

### 7.2 响应式要求

所有新页面至少覆盖两档：
- 常规桌面宽度
- 窄宽度或任务窗格压缩宽度

必须保证：
- 文本不大面积溢出
- 按钮不挤压变形
- 关键操作可见

## 8. 字体与文本规范

统一字体栈：

`"Segoe UI", "Microsoft YaHei UI", Tahoma, Arial, sans-serif`

文本颜色只允许使用语义 token：
- 主文字
- 次级文字
- 辅助文字
- 状态文字

禁止：
- 页面里直接混用 `#222` / `#333` / `#666`

## 9. 状态与交互规范

### 9.1 焦点态

所有可交互控件必须支持：
- `:hover`
- `:focus` 或 `:focus-visible`
- `:disabled`（如适用）

键盘焦点不可省略。

### 9.2 选中态

列表、标签、切换器、选项卡的选中逻辑必须统一：
- 颜色来源一致
- 字重变化一致
- 边框或底色表达一致

### 9.3 动效

统一时长建议：
- `120ms`
- `150ms`
- `180ms`

页面里不要出现多个完全不同节奏的过渡。

## 10. 代码评审检查项

提交 UI 代码时，至少检查以下项目：

- 是否新增了硬编码颜色
- 是否重复定义了按钮或输入框
- 是否引入了规范外圆角
- 是否沿用了旧色 `#0078d4`
- 是否保留了中文字体栈
- 是否补齐了 hover / focus / disabled 状态
- 是否能在窄宽度下正常使用

## 11. 迁移规范

旧页面重构时按以下顺序处理：

1. 先替换颜色、圆角、间距为 token
2. 再替换按钮、输入框、反馈为共享组件类
3. 再清理页面级重复样式
4. 最后处理细节对齐和局部特例

不要一上来全页重写样式，否则回归风险高。

## 12. 当前项目执行策略

按当前代码现状，建议分三批落地：

第一批：
- 建立 `tokens.css`、`components.css`
- 接入 `taskpane`

第二批：
- 迁移 `info-reference`
- 迁移 `queryprice`

第三批：
- 迁移 `dialog`
- 迁移 `devmodify`
- 迁移 `craftmodify`
- 清理 `quote-preview` 可共享部分

## 13. 例外说明

以下情况允许保留局部特例，但必须写清楚原因：

- 打印预览 / 文档页
- 画布类编辑器的舞台区域
- 与第三方控件强耦合的样式覆盖

即使存在特例，也应尽量共享字体、状态色、浮层、按钮和输入控件规范。
