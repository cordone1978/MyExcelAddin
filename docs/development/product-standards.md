# 产品标准（统一口径）

最后更新：2026-03-05

## 1. 目标与范围

本文件用于统一“组件命名、分类命名、历史数据库展示、标准件/外购件处理”相关规则，作为产品和数据口径基线。

适用范围：
- 数据库主表（生产使用表）
- 信息参考页（`infoReference`）展示逻辑
- 报价配置相关组件分类逻辑（标准件/外购件）

## 2. 组件与分类命名标准

### 2.1 标准命名映射

- `主体` -> `料仓`
  - 仅在“暂存仓”产品类型下生效（避免误伤其他产品类型，如除尘器、真空上料器）
- `料位计` -> `料位开关`
- `流化` -> `流化组件`
- `破拱` -> `破拱组件`

### 2.2 已执行落库范围（2026-03-05）

- `ht_sales_product_default_config.component_name`
  - 条件：`type_name='暂存仓' AND component_name='主体'`
  - 更新：8 行
- `ht_sales_warehouse_statistics.category_name`
  - `料位计` -> `料位开关`：122 行
  - `流化` -> `流化组件`：155 行
  - `破拱` -> `破拱组件`：156 行
- `ht_sales_warehouse_clean.category_name`
  - `料位计` -> `料位开关`：124 行
  - `流化` -> `流化组件`：3404 行
  - `破拱` -> `破拱组件`：411 行
- `ht_sales_warehouse_product_statistics.category_name`
  - 三项均 0 行（无需更新）

### 2.3 不做全局替换的字段（防误改）

以下字段不按本标准做全局文本替换：
- `ItemName` / `item_name`
- `ItemDesc` / `content_spec` / `component_desc`
- 其他自由描述字段

原因：这些字段包含通用工艺/物料文本，存在跨产品复用词（如“主体焊接”），直接替换会误伤语义。

## 3. 历史数据库展示标准（信息参考页）

页面：`src/info-reference/infoReference.html`、`src/info-reference/infoReference.ts`

### 3.1 数据来源

- “历史相关产品列表”与“历史数据库明细”统一读取：`ht_sales_warehouse_statistics`

### 3.2 分类过滤与金额并入

历史数据库明细展示时：
- 不显示：`标准件`、`外购件`
- 其 `category_amount` 金额并入主组件：
  - 默认并入 `row_index = 1` 的组件
  - 若无 `row_index = 1`，并入当前首行可见组件

### 3.3 数值显示规范

- 两个明细表（报价配置表明细、历史数据库明细）所有数字显示为整数
- 处理方式：截断小数（不四舍五入）

### 3.4 列结构规范（与 Excel 标题口径同步后裁剪）

当前保留列：
- `组件名称`
- `内容及规格`
- `型号`
- `主体材质`
- `品牌`
- `组件数量`
- `单位`
- `成本单价（元）`
- `成本合计（元）`

已移除列：
- `J/K`（数量/单位）
- `N`（合计（元））
- `O/P`（单价（元）/总价（元））

### 3.5 汇总行与浮动标识

- 两个明细表最后一行新增：`成本合计汇总`
- 汇总行样式：蓝色背景，价格加粗
- 历史数据库明细的“成本合计（元）”单元格显示：
  - 左侧：价格
  - 右侧：相对报价配置表同名组件的浮动标识
    - 上涨：`上涨xx%`（红色）
    - 下降：`下降xx%`（绿色）
    - 无变化：`--`（黄色）
  - 未找到对应组件时，不显示浮动标识

## 4. 标准件/外购件既有规则

来源：`docs/development/devmodify.md` 与代码常量

- `whatkind` 维度包含：`外购件`、`组件`、`工艺`、`标准件`
- 外购件：可通过价格查询接口匹配单价
- 标准件：单价来自配置表中 `whatkind = 标准件` 的 `component_unitprice`
- 组件总价：由标准件、材料、工艺等构成

## 5. 执行与变更要求

后续涉及命名调整时，按以下顺序执行：
1. 先确认“是否限定产品类型”（避免一刀切）
2. 先改分类/结构化字段，再评估自由文本字段
3. 事务执行 + 行数回执 + 旧值剩余校验
4. 同步更新本文件

## 6. 关联实现位置

- 信息参考页：
  - `src/info-reference/infoReference.html`
  - `src/info-reference/infoReference.ts`
  - `src/info-reference/infoReference.css`
- 后端查询接口：
  - `server.js`（`/api/warehouse-clean-search`，当前读取 `ht_sales_warehouse_statistics`）
- 既有业务说明：
  - `docs/development/devmodify.md`
  - `docs/database/ht_sales_product_default_config.md`
