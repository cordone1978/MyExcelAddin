# Graph Editor Asset Guide

## 目标

图形编辑器中的每个产品模板，最终都应由多层 PNG 资源组成，而不是单张整图。

这样可以支持：

- 单个组件点击选中
- 端口锚点连接
- 热点定位
- 后续高亮、流动动画、状态切换

## 目录规范

所有设备资源统一放在：

`assets/equipment/`

建议每个产品一个子目录：

```text
assets/
  equipment/
    silo-1000l/
      body.png
      outlet.png
      leg-left.png
      leg-right.png
    pipe-module/
      pipe-main.png
      inlet-port.png
    cyclone-separator/
      body.png
```

目录名建议：

- 全小写
- 用 `-` 分隔单词
- 与模板中的 `equipmentAssetPath("<dir>", "<file>")` 保持一致

## 图片要求

建议：

- 格式：`PNG`
- 背景：透明
- 方向：固定视角，同一产品所有图层视角必须一致
- 裁切：尽量贴合实际外轮廓，避免大量空白
- 命名：按部件语义命名，不要用 `1.png`、`2.png`

推荐命名：

- `body.png`
- `frame.png`
- `outlet.png`
- `inlet.png`
- `support-left.png`
- `support-right.png`
- `highlight.png`

如果某个组件需要 hover / 选中时的局部发亮效果，建议额外提供：

- `body-highlight.png`
- `outlet-highlight.png`
- `pipe-main-highlight.png`

## 模板结构

模板定义在：

`src/graph-editor/productLibrary.ts`

每个产品模板由多个组件组成，每个组件又可包含多个图片层：

```ts
{
  templateId: "template_silo",
  name: "1000L 暂存仓",
  defaultViewMode: "bird",
  components: [
    {
      id: "silo_body",
      name: "料仓",
      kind: "silo",
      x: 0,
      y: 8,
      width: 136,
      height: 190,
      zIndex: 10,
      layers: [
        {
          id: "silo_body_main",
          name: "主体",
          x: 0,
          y: 0,
          width: 136,
          height: 190,
          imageUrl: equipmentAssetPath("silo-1000l", "body.png"),
          fallbackImageUrl: "...",
          zIndex: 10,
        },
      ],
      ports: [{ id: "out_port", name: "出料端口", x: 68, y: 198 }],
      hotspots: [{ id: "hs1", label: "仓顶检修口", x: 68, y: 24 }],
      parameters: { 材质: "SUS304" },
    },
  ],
}
```

## 字段说明

### 产品模板

- `templateId`: 模板唯一标识
- `name`: 产品名称，界面显示用
- `defaultViewMode`: 默认视角，可选 `front` / `top` / `bird`
- `components`: 产品内的组件列表

### 组件

- `id`: 组件唯一标识
- `name`: 组件名称，属性面板显示用
- `kind`: 组件类型，当前用于基础交互和回退形状
- `x`, `y`: 组件相对于产品原点的位置
- `width`, `height`: 组件整体外接尺寸
- `zIndex`: 组件层级，值越大越靠上
- `layers`: 组件图片层列表
- `ports`: 连接端口列表
- `hotspots`: 热点列表
- `parameters`: 参数字典，用于右侧属性面板

### 图片层

- `id`: 图层唯一标识
- `name`: 图层说明
- `x`, `y`: 图层相对组件原点的位置
- `width`, `height`: 图层渲染尺寸
- `imageUrl`: 主资源路径，通常指向 `assets/equipment/...`
- `fallbackImageUrl`: 主资源缺失时的回退图
- `opacity`: 图层透明度，默认 `1`
- `zIndex`: 图层层级
- `role`: 图层用途，可选 `base` / `highlight` / `shadow` / `overlay`

其中：

- `base` 是常规显示层
- `highlight` 只在 hover / 选中时显示

### 端口

- `id`: 端口唯一标识
- `name`: 端口名称
- `x`, `y`: 端口相对组件原点的位置

端口用于：

- 连接线锚点
- 后续流向动画起止点
- 组件连接规则

### 热点

- `id`: 热点唯一标识
- `label`: 热点提示文字
- `x`, `y`: 热点相对组件原点的位置

热点用于：

- 点击命中辅助
- 提示标注
- 后续高亮和说明

## 建议工作流

1. 先确定一个产品模板目录名，例如 `silo-1000l`
2. 设计师导出透明 PNG，按部件命名
3. 将 PNG 放入 `assets/equipment/<目录名>/`
4. 在 `productLibrary.ts` 中填写 `layers`
5. 调整组件的 `ports` 和 `hotspots`
6. 在画布中验证位置是否正确

## 当前实现状态

当前运行时逻辑是：

- 优先加载 `imageUrl`
- 如果真实 PNG 不存在，则自动回退到 `fallbackImageUrl`

因此可以边做模板边替换真实资源，不需要一次性准备完全部素材。
