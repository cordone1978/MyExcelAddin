# 报价关系画布（Graph Editor）开发方案与MVP落地

## 1. 目标

在 Excel Add-in 中新增一个可拖拽、可连线的“产品关系画布”，让用户通过图形化方式配置产品关系，并一键落地到“报价配置表”。

当前产品规划包含两种模式：

- 模式一（优先落地）：先配置报价表，再生成可拖动模块，用户手动连管道关系
- 模式二（后续迭代）：先在模板库拖图配置，再反向生成报价配置表

本期先实现模式一的最小可用版本（MVP）：

- 画布节点拖拽
- 节点之间连线
- 本地自动保存（localStorage）
- 一键生成并写入报价配置表
- 从报价配置表一键生成模块

## 2. 范围边界

MVP 范围内（模式一）：

- 仅在客户端本地保存图数据
- 通过现有 `insertComponentsToConfigSheet` 写入配置表
- 以“系统分组 + 节点组件”方式落地

MVP 暂不包含：

- 后端持久化（数据库）
- 多人协同与版本冲突处理
- 复杂图校验（环检测、规则引擎）
- 完整反向恢复（从配置表完全还原边）

## 3. 总体架构

1. Taskpane 新增“关系画布”按钮，打开对话页 `graphEditor.html`。
2. 画布页维护图状态：
3. `nodes[]`：节点（产品/组件）
4. `edges[]`：连接关系
5. 图状态自动写入 localStorage。
6. 用户点击“写入报价配置表”后：
7. 按系统归组节点
8. 转换为组件清单
9. 调用 `insertComponentsToConfigSheet` 插入到对应系统区块

## 4. 数据模型（MVP）

```ts
type GraphNode = {
  id: string;
  label: string;
  systemName: string;
  componentDesc: string;
  componentType: string;
  componentMaterial: string;
  componentBrand: string;
  componentUnit: string;
  componentQuantity: number;
  componentUnitPrice: number;
  x: number;
  y: number;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
};
```

## 5. UI 与交互

1. 工具栏按钮：
2. 从配置表生成模块
2. 新增节点
3. 连线模式（开/关）
4. 删除选中
5. 清空画布
6. 写入报价配置表
7. 模式一流程：
8. 先在 Excel 完成报价配置表录入
9. 打开画布点击“从配置表生成模块”
10. 拖动模块并连线形成工艺/流程关系
11. 按需回写配置表（可选）
7. 画布操作：
8. 拖拽节点移动
9. 连线模式下，先点源节点再点目标节点创建连线
10. 选中线或节点后可删除

## 6. Excel 落地策略

1. 若不存在报价模板，先自动创建（`createQuotationSheet`）。
2. 读取“报价配置表”A/B列定位系统标题行。
3. 每个系统分组分别插入组件数据。
4. 插入字段映射：
5. `component_name <- node.label`
6. `component_desc <- node.componentDesc + 上游关系描述`
7. `component_type/material/brand/quantity/unit/unitprice <- node对应字段`
8. `is_Assembly = 1`（避免整组被合并成单一设备标题）

## 7. 验收标准（MVP）

1. 用户可在画布新增至少 50 个节点并拖动。
2. 连线可创建/删除并持久化到本地。
3. 刷新对话页后画布可恢复。
4. 点击写入按钮后，配置表可按系统插入节点对应组件行。
5. 插入失败时可看到明确错误提示。

## 8. 后续迭代（非MVP）

1. 新增后端接口保存图版本（`quote_graph`）。
2. 增加发布快照与历史恢复。
3. 从配置表反向恢复图关系。
4. 增加图校验（环、孤点、必填字段）。
