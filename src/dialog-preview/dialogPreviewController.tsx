import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { Image as KonvaImage, Layer, Rect, Stage } from "react-konva";
import { DialogPreviewCallbacks, DialogPreviewController, PreviewItem, PreviewScene, PreviewSize } from "./types";
import { buildHitCanvas, useLoadedImage } from "../shared/konvaHooks";

type LoadedImageMap = Record<string, HTMLImageElement | null>;

type PreviewRenderState = {
  size: PreviewSize;
  scene: PreviewScene;
};

function usePreviewImages(scene: PreviewScene) {
  const baseImageState = useLoadedImage(scene.baseImageUrl);
  const [loadedItems, setLoadedItems] = useState<LoadedImageMap>({});
  const itemSources = useMemo(
    () =>
      scene.items
        .filter((item) => item.visible && item.imageUrl)
        .map((item) => ({ id: item.id, src: String(item.imageUrl || "").trim() }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [scene.items]
  );

  useEffect(() => {
    let active = true;
    if (itemSources.length === 0) {
      setLoadedItems({});
      return () => {
        active = false;
      };
    }

    const nextMap: LoadedImageMap = {};
    let pending = itemSources.length;

    itemSources.forEach(({ id, src }) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      const finish = (loaded: HTMLImageElement | null) => {
        nextMap[id] = loaded;
        pending -= 1;
        if (active && pending <= 0) {
          setLoadedItems({ ...nextMap });
        }
      };
      img.onload = () => finish(img);
      img.onerror = () => finish(null);
      img.src = src;
    });

    return () => {
      active = false;
    };
  }, [itemSources]);

  return { baseImageState, loadedItems };
}

function PreviewStage({
  renderState,
  registerExporter,
  callbacks,
}: {
  renderState: PreviewRenderState;
  registerExporter: (exporter: (() => string | null) | null) => void;
  callbacks?: DialogPreviewCallbacks;
}) {
  const { size, scene } = renderState;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { baseImageState, loadedItems } = usePreviewImages(scene);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const orderedItems = useMemo(
    () => [...scene.items].filter((item) => item.visible).sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    [scene.items]
  );

  const hitContexts = useMemo(() => {
    const map: Record<string, CanvasRenderingContext2D | null> = {};
    orderedItems.forEach((item) => {
      const image = loadedItems[item.id];
      map[item.id] = image ? buildHitCanvas(image, size.width, size.height) : null;
    });
    return map;
  }, [loadedItems, orderedItems, size]);

  useEffect(() => {
    const exportImage = () => {
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = Math.max(1, size.width * 2);
      exportCanvas.height = Math.max(1, size.height * 2);
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) return null;
      orderedItems.forEach((item) => {
        const image = loadedItems[item.id];
        if (!image) return;
        ctx.drawImage(image, 0, 0, exportCanvas.width, exportCanvas.height);
      });
      const png = exportCanvas.toDataURL("image/png");
      return png || null;
    };

    registerExporter(() => exportImage());
    return () => registerExporter(null);
  }, [loadedItems, orderedItems, registerExporter, size]);

  const activeItemId = scene.highlightedItemId || hoveredItemId || null;

  const handlePointerMove = (evt: any) => {
    const stage = evt.target?.getStage?.();
    const pointer = stage?.getPointerPosition?.();
    if (!pointer) {
      setHoveredItemId(null);
      setTooltip(null);
      callbacks?.onHoverItemId?.(null);
      return;
    }

    const pointerX = Math.floor(pointer.x);
    const pointerY = Math.floor(pointer.y);
    let nextHovered: PreviewItem | null = null;

    for (let index = orderedItems.length - 1; index >= 0; index -= 1) {
      const item = orderedItems[index];
      const ctx = hitContexts[item.id];
      if (!ctx) continue;
      try {
        const pixel = ctx.getImageData(pointerX, pointerY, 1, 1);
        if (pixel.data[3] > 0) {
          nextHovered = item;
          break;
        }
      } catch {
        // Ignore read failures on edge pixels.
      }
    }

    if (!nextHovered) {
      setHoveredItemId(null);
      setTooltip(null);
      callbacks?.onHoverItemId?.(null);
      return;
    }

    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    setHoveredItemId(nextHovered.id);
    callbacks?.onHoverItemId?.(nextHovered.id);
    setTooltip({
      x: (wrapperRect ? pointer.x + wrapperRect.left : pointer.x) + 14,
      y: (wrapperRect ? pointer.y + wrapperRect.top : pointer.y) + 14,
      text: nextHovered.name,
    });
  };

  const handlePointerLeave = () => {
    setHoveredItemId(null);
    setTooltip(null);
    callbacks?.onHoverItemId?.(null);
  };

  const handlePointerClick = () => {
    if (hoveredItemId) {
      callbacks?.onClickItemId?.(hoveredItemId);
    }
  };

  const hasVisibleItems = orderedItems.some((item) => loadedItems[item.id]);
  const showBase = !hasVisibleItems && baseImageState.image;
  const showPlaceholder = !showBase && !hasVisibleItems;

  return (
    <div ref={wrapperRef} className="preview-stage-root">
      {showPlaceholder ? <div className="preview-stage-placeholder">{scene.placeholder || "请选择产品型号"}</div> : null}
      <Stage
        width={size.width}
        height={size.height}
        className="preview-stage-canvas"
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
        onClick={handlePointerClick}
      >
        <Layer>
          <Rect x={0} y={0} width={size.width} height={size.height} fill="rgba(255,255,255,0)" />
          {showBase && baseImageState.image ? <KonvaImage image={baseImageState.image} x={0} y={0} width={size.width} height={size.height} listening={false} /> : null}
          {orderedItems.map((item) => {
            const image = loadedItems[item.id];
            if (!image) return null;
            const isActive = item.id === activeItemId;
            const hasActive = !!activeItemId;
            return (
              <KonvaImage
                key={item.id}
                image={image}
                x={0}
                y={0}
                width={size.width}
                height={size.height}
                listening={false}
                  opacity={hasActive ? (isActive ? 1 : 0.1) : 1}
                shadowColor={isActive ? "rgba(28,120,214,0.28)" : undefined}
                shadowBlur={isActive ? 18 : 0}
              />
            );
          })}
        </Layer>
      </Stage>
      {tooltip ? (
        <div className="preview-stage-tooltip" style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px`, display: "block" }}>
          {tooltip.text}
        </div>
      ) : null}
    </div>
  );
}

export function mountDialogPreview(container: HTMLElement, callbacks?: DialogPreviewCallbacks): DialogPreviewController {
  const root: Root = createRoot(container);
  let exportComposite: (() => string | null) | null = null;
  let renderState: PreviewRenderState = {
    size: { width: 320, height: 320 },
    scene: { baseImageUrl: null, items: [], placeholder: "请选择产品型号", highlightedItemId: null },
  };

  const render = () => {
    root.render(
      <PreviewStage
        renderState={renderState}
        callbacks={callbacks}
        registerExporter={(exporter) => {
          exportComposite = exporter;
        }}
      />
    );
  };

  render();

  return {
    resize(size) {
      renderState = { ...renderState, size };
      render();
    },
    setScene(scene) {
      renderState = { ...renderState, scene };
      render();
    },
    exportCompositeImageDataUrl(maxChars) {
      const dataUrl = exportComposite ? exportComposite() : null;
      if (!dataUrl) return null;
      if (typeof maxChars === "number" && maxChars > 0 && dataUrl.length > maxChars) {
        return null;
      }
      return dataUrl;
    },
  };
}
