# Dialog 对话框提交功能实现文档

## 概述

本文档描述了 dialog 对话框中"确认提交"按钮功能的实现，该功能将用户选中的组件数据插入到 Excel 配置表中。

实现日期：2026-02-10
实现者：Claude Sonnet 4.5

---

## 1. 功能说明

### 1.1 功能描述

当用户在 dialog 对话框中完成以下操作后：
1. 选择产品类型（Category）
2. 选择产品型号（Project）
3. 选择组件详情（Details，多选）
4. 选择可选配件（Annotations，多选）

点击"确认提交"按钮，系统将：
- 收集所有选中的数据
- 从后端 API 获取完整的组件详细信息
- 将数据格式化并插入到 Excel 的"配置表"中
- 自动设置格式、合并单元格、添加公式和边框
- 显示操作结果提示

### 1.2 数据流程

```
用户选择数据 → 点击"确认提交"
    ↓
Dialog 发送数据 (Office.context.ui.messageParent)
    ↓
Commands 接收数据 (DialogMessageReceived 事件)
    ↓
解析 JSON 数据
    ↓
从后端 API 获取完整组件信息 (fetchComponentDetails)
    ↓
插入数据到配置表 (insertComponentsToConfigSheet)
    ↓
显示成功/失败提示
```

---

## 2. 文件结构

### 2.1 新增文件

```
src/
├── buildsheet/
│   └── insertRows.ts          # 插入数据到配置表的核心模块
└── commands/
    └── commands.ts            # 更新：添加数据处理逻辑
```

### 2.2 相关文件

```
src/
├── dialog/
│   ├── dialog.html            # 对话框 HTML
│   ├── dialog.ts              # 对话框逻辑（包含 confirmData 函数）
│   └── dialog.css             # 对话框样式
└── commands/
    └── commands.html          # Commands 页面
```

---

## 3. 核心模块详解

### 3.1 insertRows.ts

#### 3.1.1 主函数：insertComponentsToConfigSheet

**函数签名：**
```typescript
export async function insertComponentsToConfigSheet(
  categoryName: string,      // 产品类型名称（根分类）
  projectName: string,        // 产品型号名称（子分类）
  components: any[]           // 组件数据数组
): Promise<void>
```

**功能步骤：**

1. **获取配置表**
   ```typescript
   const configSheet = context.workbook.worksheets.getItemOrNullObject("配置表");
   ```

2. **确定插入位置**
   - 获取配置表的已使用区域
   - 在最后一行之后插入新数据

3. **插入分段标题行**
   - 显示产品类型名称
   - 合并 A-K 列
   - 设置格式：加粗、左对齐、行高30

4. **插入表头行**
   - 19列标题：系列、设备名称、组件名称...备注
   - 设置格式：加粗、居中、行高30
   - N-R 列设置绿色背景（成本区）

5. **插入数据行**
   - 遍历 components 数组
   - 填充每一列的数据
   - 设置格式：取消加粗、行高30

6. **合并单元格**
   - A列（系列）：合并所有数据行，垂直文本
   - B列（设备名称）：根据 is_Assembly 分组合并
   - J列（设备数量）：合并所有数据行，填充"1"
   - K列（单位）：合并所有数据行，填充"套"
   - L列（单价）：合并所有数据行
   - M列（总价）：合并所有数据行
   - P列（合计）：合并所有数据行
   - Q列（系数）：合并所有数据行，填充"2"

7. **设置公式**
   - O列：`=N列 × H列`（成本合计 = 成本单价 × 组件数量）
   - P列：`=SUM(O列)`（合计 = 所有成本合计之和）
   - L列：`=P列 × Q列`（单价 = 合计 × 系数）
   - M列：`=L列 × J列`（总价 = 单价 × 设备数量）

8. **设置边框**
   - 横框线：加粗（Thick）
   - 竖框线：普通（Thin）
   - 标题行：去掉竖框线

#### 3.1.2 辅助函数：mergeConsecutiveEqualCells

**函数签名：**
```typescript
async function mergeConsecutiveEqualCells(
  sheet: Excel.Worksheet,
  startRow: number,
  endRow: number,
  column: string,
  components: any[]
): Promise<void>
```

**功能：**
- 根据 `is_Assembly` 字段分组
- 合并 B 列中连续相同的单元格
- 用于将可选配件组合在一起显示

---

### 3.2 commands.ts

#### 3.2.1 更新的 openDialog 函数

**主要变更：**

1. **添加消息处理器**
   ```typescript
   dialog.addEventHandler(Office.EventType.DialogMessageReceived, async function(args) {
       const data = JSON.parse(args.message);
       await handleDialogData(data);
       dialog.close();
   });
   ```

2. **添加成功/失败提示**
   - 使用 `displayDialogAsync` 显示简单的 HTML 提示
   - 成功提示：2秒后自动关闭
   - 失败提示：3秒后自动关闭

#### 3.2.2 新增函数：handleDialogData

**函数签名：**
```typescript
async function handleDialogData(data: any): Promise<void>
```

**功能：**
1. 验证数据完整性
2. 调用 `fetchComponentDetails` 获取完整组件信息
3. 调用 `insertComponentsToConfigSheet` 插入数据

**数据验证：**
- 检查 `categoryId` 和 `projectId` 是否存在
- 检查 `details` 数组是否为空

#### 3.2.3 新增函数：fetchComponentDetails

**函数签名：**
```typescript
async function fetchComponentDetails(
  projectId: number,
  selectedDetails: any[]
): Promise<any[]>
```

**功能：**
1. 从后端 API 获取项目配置数据
2. 筛选出用户选中的组件
3. 按 `component_sn` 排序
4. 返回完整的组件数据数组

**API 端点：**
```
GET https://localhost:3001/api/config/{projectId}
```

---

## 4. 数据映射

### 4.1 配置表列定义

| 列 | 字段名 | 数据来源 | 说明 |
|---|---|---|---|
| A | 系列 | categoryName | 产品类型，合并显示 |
| B | 设备名称 | projectName | 产品型号 |
| C | 组件名称 | component_name | 组件名称 |
| D | 内容及规格 | component_desc | 组件描述 |
| E | 型号 | component_type | 组件型号 |
| F | 材质 | component_material | 组件材质 |
| G | 品牌 | component_brand | 组件品牌 |
| H | 组件数量 | component_quantity | 数量，默认1 |
| I | 单位 | component_unit | 单位，默认"个" |
| J | 设备数量 | 固定值：1 | 合并显示 |
| K | 单位 | 固定值："套" | 合并显示 |
| L | 单价（万元） | 公式：=P*Q | 合并显示 |
| M | 总价（万元） | 公式：=L*J | 合并显示 |
| N | 成本单价（元） | component_unitprice | 成本价 |
| O | 成本合计（元） | 公式：=N*H | 每行计算 |
| P | 合计（元） | 公式：=SUM(O列) | 合并显示 |
| Q | 系数 | 固定值：2 | 合并显示 |
| R | 备注 | 空 | 预留 |
| S | 备注 | 空 | 预留 |

### 4.2 Dialog 返回的数据结构

```typescript
interface DialogResult {
  categoryId: number;           // 产品类型ID
  category: string;             // 产品类型名称
  projectId: number;            // 产品型号ID
  project: string;              // 产品型号名称
  details: Array<{              // 选中的组件
    id: number;
    name: string;
  }>;
  annotations: Array<{          // 选中的可选配件
    id: number;
    name: string;
  }>;
  hotspots: Array<{             // 热点标记（暂未使用）
    annotationId: string;
    annotation: string;
    position: { x: number; y: number };
  }>;
  compositeImage?: string;      // 合成图片（Base64，暂未使用）
}
```

### 4.3 后端 API 返回的组件数据结构

```typescript
interface ComponentData {
  id: number;                   // 组件ID
  project_id: number;           // 项目ID
  component_sn: number;         // 组件序号（用于排序）
  component_name: string;       // 组件名称
  component_desc: string;       // 组件描述
  component_type: string;       // 组件型号
  component_material: string;   // 组件材质
  component_brand: string;      // 组件品牌
  component_quantity: number;   // 组件数量
  component_unit: string;       // 组件单位
  component_unitprice: number;  // 成本单价
  component_pic: string;        // 组件图片
  is_required: number;          // 是否必选（0/1）
  is_Assembly: number;          // 是否可选配件（0/1）
}
```

---

## 5. 与 VBA 代码的对应关系

### 5.1 函数映射

| VBA 函数 | TypeScript 函数 | 说明 |
|---|---|---|
| `InsertComponentsAndFormat` | `insertComponentsToConfigSheet` | 主插入函数 |
| `MergeConsecutiveEqualCells` | `mergeConsecutiveEqualCells` | 合并相同单元格 |
| `cmdOK_Click` | `handleDialogData` | 确认按钮处理 |
| `GetSubCategoryDataFromDefaultTabel` | `fetchComponentDetails` | 获取组件数据 |

### 5.2 实现差异

| 功能 | VBA 实现 | TypeScript 实现 | 说明 |
|---|---|---|---|
| 数据来源 | 从"默认配置表"读取 | 从后端 API 获取 | 更灵活，支持远程数据 |
| 插入位置 | 基于 targetCell | 基于 usedRange | 自动在末尾插入 |
| 合并逻辑 | 基于 MergeInfo 类 | 直接使用 Excel.js API | 更简洁 |
| 公式设置 | 逐行设置 | 批量设置 | 性能更好 |
| 错误处理 | On Error GoTo | try-catch | 更现代化 |

---

## 6. 使用方法

### 6.1 前置条件

1. **配置表已创建**
   - 通过 `createQuotationSheet()` 创建"配置表"
   - 或手动创建名为"配置表"的工作表

2. **后端服务运行**
   - API 服务器运行在 `https://localhost:3001`
   - 数据库连接正常

3. **项目已编译**
   ```bash
   npm run build
   ```

### 6.2 操作步骤

1. **启动开发服务器**
   ```bash
   npm start
   ```

2. **在 Excel 中打开 Add-in**
   - 打开 Excel
   - 加载 manifest.xml
   - 或使用侧边加载

3. **打开对话框**
   - 点击功能区的"打开对话框"按钮
   - 或在任务窗格中点击相应按钮

4. **选择数据**
   - 选择产品类型（左侧列表）
   - 选择产品型号（中间列表）
   - 勾选组件详情（右侧上方，多选）
   - 勾选可选配件（右侧下方，多选）

5. **确认提交**
   - 点击"确认提交"按钮
   - 等待数据插入完成
   - 查看成功提示

6. **查看结果**
   - 切换到"配置表"工作表
   - 查看新插入的数据

### 6.3 多次插入

- 支持多次插入不同的产品配置
- 每次插入会在配置表末尾添加新的分段
- 不会覆盖已有数据

---

## 7. 格式说明

### 7.1 分段标题行格式

- **合并范围**：A-K 列
- **字体**：加粗
- **对齐**：左对齐、垂直居中
- **行高**：30
- **边框**：上下加粗，无竖框线
- **内容**：产品类型名称（如"水处理系统"）

### 7.2 表头行格式

- **字体**：加粗
- **对齐**：水平居中、垂直居中
- **行高**：30
- **背景色**：N-R 列为绿色 (#cfe8b9)
- **边框**：全边框

### 7.3 数据行格式

- **字体**：正常（不加粗）
- **对齐**：
  - C、D 列：左对齐
  - 其他列：居中
- **行高**：30
- **边框**：全边框

### 7.4 合并单元格格式

- **A列（系列）**：
  - 垂直文本（orientation: 90）
  - 加粗
  - 居中对齐

- **B列（设备名称）**：
  - 根据 is_Assembly 分组合并
  - 居中对齐

- **J、K、L、M、P、Q 列**：
  - 合并所有数据行
  - 居中对齐

---

## 8. 错误处理

### 8.1 常见错误

| 错误 | 原因 | 解决方法 |
|---|---|---|
| "配置表不存在" | 工作簿中没有"配置表" | 先创建配置表 |
| "缺少必要的产品类型或产品型号信息" | 未选择产品 | 确保选择了产品类型和型号 |
| "没有选择任何组件" | 未勾选组件 | 至少勾选一个组件 |
| "无法连接到数据库服务器" | 后端服务未运行 | 启动后端服务 |
| "获取组件数据失败" | API 返回错误 | 检查后端日志 |

### 8.2 错误提示

- **成功提示**：
  ```
  ✅ 数据插入成功
  已成功插入 X 个组件到配置表
  ```

- **失败提示**：
  ```
  ❌ 插入失败
  [错误信息]
  ```

---

## 9. 性能优化

### 9.1 已实现的优化

1. **批量操作**
   - 使用数组一次性设置多行数据
   - 避免逐行操作

2. **减少 sync 调用**
   - 合并多个操作后再 sync
   - 减少与 Excel 的通信次数

3. **并行加载**
   - Dialog 中并行加载 details、annotations、config

### 9.2 可能的优化方向

1. **缓存组件数据**
   - 避免重复请求相同的项目数据

2. **延迟加载图片**
   - 仅在需要时加载组件图片

3. **增量更新**
   - 仅更新变化的部分，而非重新渲染整个 Canvas

---

## 10. 测试建议

### 10.1 功能测试

- [ ] 插入单个组件
- [ ] 插入多个组件
- [ ] 插入必选组件
- [ ] 插入可选配件
- [ ] 多次插入不同产品
- [ ] 公式计算正确性
- [ ] 合并单元格正确性
- [ ] 格式设置正确性

### 10.2 边界测试

- [ ] 空配置表
- [ ] 配置表不存在
- [ ] 未选择产品
- [ ] 未选择组件
- [ ] 后端服务不可用
- [ ] 网络超时

### 10.3 兼容性测试

- [ ] Excel 桌面版（Windows）
- [ ] Excel 桌面版（Mac）
- [ ] Excel Online
- [ ] 不同 Excel 版本

---

## 11. 未来改进

### 11.1 功能增强

1. **图片插入**
   - 将合成图片插入到配置表中
   - 支持组件图片预览

2. **批量编辑**
   - 支持修改已插入的数据
   - 支持删除已插入的分段

3. **模板支持**
   - 保存常用配置为模板
   - 快速应用模板

4. **导出功能**
   - 导出为 PDF
   - 导出为 Word 报价单

### 11.2 用户体验

1. **进度提示**
   - 显示插入进度条
   - 显示详细的操作步骤

2. **撤销功能**
   - 支持撤销最后一次插入
   - 支持撤销历史记录

3. **预览功能**
   - 插入前预览数据
   - 确认后再插入

### 11.3 性能优化

1. **虚拟滚动**
   - Dialog 中大量数据时使用虚拟滚动

2. **Web Worker**
   - 使用 Web Worker 处理图片合成

3. **增量渲染**
   - 仅渲染可见区域的 Canvas

---

## 12. 参考资料

### 12.1 Office.js API

- [Excel JavaScript API](https://learn.microsoft.com/en-us/javascript/api/excel)
- [Dialog API](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/dialog-api-in-office-add-ins)
- [Office Add-ins](https://learn.microsoft.com/en-us/office/dev/add-ins/)

### 12.2 项目文档

- `fyi/modInsertRows.html` - VBA 原始实现
- `src/dialog/dialog.ts` - Dialog 逻辑
- `src/commands/commands.ts` - Commands 逻辑

### 12.3 相关技术

- TypeScript
- Webpack
- Office.js
- Excel JavaScript API

---

## 13. 版本历史

| 版本 | 日期 | 作者 | 说明 |
|---|---|---|---|
| 1.0.0 | 2026-02-10 | Claude Sonnet 4.5 | 初始实现 |

---

## 14. 联系方式

如有问题或建议，请联系项目维护者。

---

**文档结束**
