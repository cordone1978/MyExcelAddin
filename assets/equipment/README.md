# Equipment Assets

图形编辑器设备资源统一放在这个目录下。

建议结构：

```text
assets/equipment/
  silo-1000l/
    body.png
    outlet.png
    leg-left.png
    leg-right.png
  pipe-module/
    pipe-main.png
    inlet-port.png
```

要求：

- 使用透明背景 PNG
- 同一产品内所有图片保持同一视角
- 文件名使用语义化命名
- 避免大量无效留白

模板映射见：

`src/graph-editor/productLibrary.ts`
