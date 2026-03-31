# 产品图片管理开发文档

本文档用于规范产品图片在系统中的存储、调用和后台管理方式。

固定命名如下：

- 数据库表名：`ht_sales_product_picture`
- 单产品图片描述文件名：`picture.json`

目标分两部分：

1. 关系画布如何调用产品图片
2. 数据清洗系统后台如何管理产品图片数据

## 一、关系画布调用规则

### 1.1 设计目标

关系画布中的产品库和设备缩略图必须做到：

- 新增产品后有稳定的默认取图逻辑
- 不依赖中文名称硬编码匹配文件
- 能兼容已有模板图、产品专属图、缺图占位图
- 后续可以平滑切换到后台维护的图片数据

### 1.2 主键规则

关系画布调用图片时，统一使用以下标识：

- `product_code`
  业务产品编码，例如 `DDM6A`
- `asset_family`
  图片目录编码，例如 `ddm6a`
- `picture_code`
  图片用途编码，例如 `thumbnail`、`overall`、`body`

约束：

- `product_code` 用于业务查询和数据库关联
- `asset_family` 用于文件目录和静态资源路径
- `picture_code` 用于确定图片用途

### 1.3 文件目录规范

产品图片静态资源统一放在：

```text
assets/equipment/<asset_family>/
```

示例：

```text
assets/equipment/ddm6a/
  picture.json
  overall.png
  thumbnail.png
  body.png
  shell.png
  motor.png
```

目录命名要求：

- 小写
- 使用英文字母、数字、中划线
- 不使用中文
- 不使用空格

### 1.4 `picture.json` 规范

每个产品目录下必须有一个 `picture.json`，用于描述该产品目录中的图片资产。

示例：

```json
{
  "product_code": "DDM6A",
  "asset_family": "ddm6a",
  "product_name": "钉碟磨机",
  "template_type": "mill",
  "default_thumbnail": "thumbnail.png",
  "default_overall": "overall.png",
  "pictures": [
    { "picture_code": "thumbnail", "file_name": "thumbnail.png", "label": "产品库缩略图" },
    { "picture_code": "overall", "file_name": "overall.png", "label": "整机主图" },
    { "picture_code": "body", "file_name": "body.png", "label": "主体" },
    { "picture_code": "motor", "file_name": "motor.png", "label": "电机" }
  ]
}
```

最少要求：

- `product_code`
- `asset_family`
- `default_overall`
- `pictures`

建议要求：

- `default_thumbnail`
- `template_type`

### 1.5 关系画布默认取图顺序

关系画布产品库展示缩略图时，建议使用以下优先级：

1. 数据库 `ht_sales_product_picture` 中状态为启用且用途为 `thumbnail` 的图片
2. 当前产品目录 `picture.json` 中 `default_thumbnail`
3. 当前产品目录中的 `overall.png`
4. 模板默认图
5. 系统占位图

关系画布画布内新增产品实例时，建议使用以下优先级：

1. 数据库中用途为 `overall` 的图片
2. `picture.json` 中 `default_overall`
3. 模板默认主图
4. 系统占位图

### 1.6 关系画布调用建议

关系画布不要直接依赖产品名称关键词去拼图片路径。推荐调用顺序如下：

1. 已知 `product_code`
2. 查询 `ht_sales_product_picture` 获取启用中的默认图记录
3. 取得 `asset_family` 与图片文件名
4. 生成静态资源路径：

```text
/assets/equipment/<asset_family>/<file_name>
```

5. 若数据库无记录，则读取对应目录的 `picture.json`
6. 若 `picture.json` 也缺失，则退回模板图

### 1.7 建议固定的 `picture_code`

为避免命名混乱，建议固定以下图片用途编码：

- `thumbnail`
- `overall`
- `body`
- `shell`
- `motor`
- `frame`
- `support-frame`
- `inlet-outlet`
- `disc-clamp`
- `grinding-disc`
- `wear-ring`

如未来新增用途，应先补规范再扩展，不建议自由命名。

### 1.8 新增产品接入最小要求

一个新产品要能在关系画布正常显示，至少需要补齐：

1. 产品目录 `assets/equipment/<asset_family>/`
2. 主图 `overall.png`
3. 描述文件 `picture.json`
4. 数据库 `ht_sales_product_picture` 中至少一条启用记录

推荐同时补齐：

1. `thumbnail.png`
2. 组件分层图片
3. 模板类型映射

## 二、数据清洗系统后台数据管理规则

### 2.1 设计目标

后台图片管理的目标不是只“存文件名”，而是解决以下问题：

- 一个产品有哪些图
- 哪张是默认缩略图
- 哪张是默认主图
- 图片是否已审核
- 图片是否启用
- 当前使用的是哪一版
- 哪些产品还缺图

因此，主数据建议放数据库，`picture.json` 作为资产目录描述文件保留。

### 2.2 数据库存储原则

数据库表 `ht_sales_product_picture` 用作主数据表，负责管理：

- 产品与图片的绑定关系
- 图片用途
- 启用状态
- 默认状态
- 文件路径
- 审核与维护信息

不建议把图片二进制直接存数据库。建议：

- 图片文件存文件系统或对象存储
- 数据库存相对路径、状态和元数据

### 2.3 推荐字段

建议 `ht_sales_product_picture` 至少包含以下字段：

- `id`
  主键
- `product_code`
  产品编码，例如 `DDM6A`
- `product_name`
  产品名称，例如 `钉碟磨机`
- `asset_family`
  资源目录编码，例如 `ddm6a`
- `picture_code`
  图片用途，例如 `thumbnail`、`overall`
- `file_name`
  文件名，例如 `overall.png`
- `relative_path`
  相对路径，例如 `assets/equipment/ddm6a/overall.png`
- `is_default`
  是否该用途默认图
- `is_enabled`
  是否启用
- `sort_order`
  排序
- `version_no`
  版本号
- `source_type`
  来源，例如 `manual`、`render`、`legacy`
- `remark`
  备注
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`

建议增加唯一约束：

- `product_code + picture_code + version_no`

建议增加默认图约束逻辑：

- 同一 `product_code + picture_code` 下，只允许一条 `is_default = 1 and is_enabled = 1`

### 2.4 `picture.json` 与数据库关系

建议关系如下：

- `picture.json` 是产品目录中的静态资产说明文件
- `ht_sales_product_picture` 是后台主数据

推荐规则：

1. 后台新增或修改产品图片时，同时更新数据库
2. 图片文件落盘后，自动重建或更新对应的 `picture.json`
3. 前端读取优先看数据库
4. 本地资产校验、静态构建、离线检查可读取 `picture.json`

换句话说：

- 数据库是真相源
- `picture.json` 是目录级镜像描述

### 2.5 后台页面建议能力

后台图片管理页面建议至少具备以下功能：

- 按 `product_code`、`product_name` 搜索
- 查看产品当前默认缩略图和默认主图
- 上传图片
- 替换图片
- 设置默认图
- 启用/停用图片
- 查看历史版本
- 校验 `picture.json` 是否完整
- 校验目录文件是否缺失

建议增加状态筛选：

- 已启用
- 未启用
- 缺少主图
- 缺少缩略图
- 待审核

### 2.6 后台新增图片流程

建议后台流程如下：

1. 选择产品或输入 `product_code`
2. 确认 `asset_family`
3. 上传图片文件
4. 选择 `picture_code`
5. 写入文件目录 `assets/equipment/<asset_family>/`
6. 写入数据库表 `ht_sales_product_picture`
7. 更新或生成 `picture.json`
8. 若当前图被设为默认图，自动取消同用途旧默认图

### 2.7 后台校验规则

后台保存时建议校验以下内容：

1. `product_code` 不允许为空
2. `asset_family` 不允许为空
3. `picture_code` 必须在允许枚举内
4. `file_name` 不允许中文和空格
5. `relative_path` 必须落在 `assets/equipment/` 下
6. 默认图必须为启用状态
7. 同一产品同一用途只能有一张启用默认图

### 2.8 推荐后台状态规则

建议统一以下状态：

- `draft`
  草稿，刚上传未确认
- `ready`
  可用，允许前端调用
- `disabled`
  停用，不参与前端默认取图
- `deprecated`
  历史旧图，保留但不默认使用

若不想单独建状态字段，也至少要保留：

- `is_enabled`
- `is_default`

### 2.9 推荐管理口径

后台应坚持以下口径：

- 图片主键用 `product_code`，不用中文名
- 目录主键用 `asset_family`，不用中文名
- 图片用途用 `picture_code`，不用随意文件名语义
- 数据库存规则，文件系统存资源，`picture.json` 存目录描述

## 三、推荐实施顺序

建议分三步实施：

1. 先确定目录规则和 `picture.json` 结构
2. 再落数据库表 `ht_sales_product_picture`
3. 最后改关系画布与后台上传逻辑，统一改为“数据库优先，`picture.json` 回退”

## 四、建议的默认结论

如无特殊说明，默认采用以下规则：

- 数据库主表：`ht_sales_product_picture`
- 单产品目录描述文件：`picture.json`
- 关系画布缩略图优先级：数据库 `thumbnail` -> `picture.json` -> `overall.png` -> 模板图 -> 占位图
- 关系画布主图优先级：数据库 `overall` -> `picture.json` -> 模板图 -> 占位图
- 图片文件统一落在：`assets/equipment/<asset_family>/`
