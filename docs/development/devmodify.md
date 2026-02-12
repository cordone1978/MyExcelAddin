# 更改设备 开发者文档

本说明面向维护“更改设备”功能的开发者，描述当前 Web 版的流程、数据来源与写回规则。

## 功能入口
- 任务窗格按钮：`更改设备`
- 入口函数：`openDevModifyDialog()`
- 依赖选区：必须选中配置表 C 列或 D 列或 E 列或 F 列的组件单元格

## 关键流程
1. 读取选中行数据（A~N 列）
2. 解析当前组件信息
3. 通过后端 API 拉取配置与材料/工艺数据
4. 打开 `devmodify` 窗体并注入初始化数据
5. 处理提交或取消

## 主要文件
- `src/taskpane/taskpane.ts`
- `src/dialog/devmodify.html`
- `src/dialog/devmodify.css`
- `src/dialog/devmodify.ts`
- `server.js`

## 选区读取规则
从选中行读取：
- A 列：产品类别（categoryName）
- B 列：产品型号（projectModel）
- C 列：组件名称（componentName）
- D 列：组件描述（componentDesc）
- E 列：组件类型（componentType）
- F 列：组件材质（componentMaterial）
- G 列：组件品牌（componentBrand）
- I 列：单位（componentUnit）
- L/N 列：价格（易损件表写 L，其它写 N）

## 数据来源与接口
- 产品类型：`GET /api/categories`
- 产品型号：`GET /api/projects/:categoryId`
- 产品配置：`GET /api/config/:projectId`
- 材料配置：`GET /api/materials/:componentId`
- 工艺配置：`GET /api/crafting/:componentId`
- 工艺单价：`GET /api/craft-prices`
- 外购件价格查询：`GET /api/price-search?keyword=...`
- 型号兜底查找：`GET /api/project-by-model/:productModel`

## 价格计算规则
- 标准件单价来自配置表中 `whatkind = 标准件` 的 `component_unitprice`
- 材料价来自 `ht_sales_config_materials.totalprice`
- 工艺价来自 `craftmodify` 总价
- 组件总价 = 标准件 + 材料 + 工艺

## 外购件逻辑
- 若 `whatkind = 外购件`：
  - 材料与工艺区域隐藏
  - 点击“外购价格”弹出价格查询
  - 必须选择价格后才允许写回

## 写回规则（沿用 FillCellsWithData）
- Desc -> C 列
- Type -> E 列
- Material -> F 列
- Brand -> G 列
- Unit -> I 列
- Price -> N 列（或易损件表 L 列）

## 与工艺窗体联动
- devmodify 内点击“表面处理”会打开 craftmodify
- craftmodify 返回 `craftPrice` 与更新后的 `desc`
- devmodify 重新打开并带入新数据

## 注意事项
- 选择行必须包含完整 A/B/C 数据
- 若未选中外购件价格，提交会跳过写回
- 接口返回的 `component_pic` 用于图片预览

