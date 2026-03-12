# Graph Editor Asset Checklist

当前图形编辑器模板依赖的 PNG 资源清单如下。

放置规则：

- 根目录：`assets/equipment/`
- 每个模板一个子目录
- 文件名必须与模板配置一致

## template_silo

模板名：`暂存仓（2000L）`

目录：

`assets/equipment/silo-2000l/`

需要文件：

- `overall.png`
- `overall-highlight.png`
- `body.png`
- `frame.png`
- `slide-gate.png`
- `rotary-valve.png`
- `exhaust-filter.png`
- `load-cell.png`
- `level-switch.png`
- `fluidization-kit.png`
- `anti-bridging-kit.png`

## template_pipe

模板名：`输送管道模组`

目录：

`assets/equipment/pipe-module/`

需要文件：

- `pipe-main.png`
- `pipe-main-highlight.png`
- `inlet-port.png`
- `inlet-port-highlight.png`

## template_cyclone

模板名：`旋风分离器`

目录：

`assets/equipment/cyclone-separator/`

需要文件：

- `body.png`
- `body-highlight.png`

## 说明

- 如果 PNG 不存在，运行时会回退到模板内置的示意图。
- `*-highlight.png` 用于 hover / 选中时的局部高亮。
- 同一模板内所有 PNG 应保持相同视角、相同基准位置。
- 如果后续新增模板，需要同步更新：
  - `src/graph-editor/productLibrary.ts`
  - 本清单
