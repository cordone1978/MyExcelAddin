/* global Office */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Circle, Group, Image as KonvaImage, Label, Layer, Line, Rect, Stage, Tag, Text } from "react-konva";
import { getPortDisplayName, getPortUsageSummary, isConnectionAllowed } from "./connectionRules";
import { buildDefaultScene, createProductFromTemplate, PRODUCT_LIBRARY } from "./productLibrary";
import { GraphScene, MaterialFlowLink, ProductComponent, ProductModel, SelectedTarget, ViewMode } from "./sceneTypes";
import { loadGraphFromWorkbook, saveGraphToWorkbook } from "./workbookStore";

const WORLD_W = 7200;
const WORLD_H = 4200;
const GRID_MAJOR = 180;
const GRID_MINOR = 45;

function cloneDefaultScene() {
  return buildDefaultScene();
}

function asScene(raw: Awaited<ReturnType<typeof loadGraphFromWorkbook>>): GraphScene {
  if (!raw?.graph?.nodes || !Array.isArray(raw.graph.nodes) || raw.graph.nodes.length === 0) return cloneDefaultScene();
  return {
    updatedAt: String(raw.updatedAt || raw.graph.updatedAt || new Date().toISOString()),
    products: raw.graph.nodes as ProductModel[],
    links: Array.isArray(raw.graph.edges) ? (raw.graph.edges as MaterialFlowLink[]) : [],
  };
}

function useContainerSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 1200, height: 720 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setSize({ width: Math.max(320, element.clientWidth), height: Math.max(320, element.clientHeight) });
    update();
    const observer = new window.ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}

function useDashOffset(active: boolean) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!active) {
      setOffset(0);
      return;
    }
    let raf = 0;
    let frame = 0;
    const run = () => {
      frame += 1;
      setOffset(-(frame % 240));
      raf = window.requestAnimationFrame(run);
    };
    raf = window.requestAnimationFrame(run);
    return () => window.cancelAnimationFrame(raf);
  }, [active]);
  return offset;
}

function useLoadedImage(src?: string, fallbackSrc?: string) {
  const [state, setState] = useState<{ image: HTMLImageElement | null; usedFallback: boolean }>({
    image: null,
    usedFallback: false,
  });

  useEffect(() => {
    const primary = String(src || "").trim();
    const fallback = String(fallbackSrc || "").trim();
    if (!primary && !fallback) {
      setState({ image: null, usedFallback: false });
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setState({ image: img, usedFallback: false });
    img.onerror = () => {
      if (!fallback || primary === fallback) {
        setState({ image: null, usedFallback: false });
        return;
      }
      const fallbackImg = new window.Image();
      fallbackImg.crossOrigin = "anonymous";
      fallbackImg.onload = () => setState({ image: fallbackImg, usedFallback: true });
      fallbackImg.onerror = () => setState({ image: null, usedFallback: false });
      fallbackImg.src = fallback;
    };
    img.src = primary || fallback;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src, fallbackSrc]);

  return state;
}

function LayeredComponentImage({
  component,
  selected,
  hovered,
  onSelect,
  onHoverChange,
}: {
  component: ProductComponent;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const orderedLayers = useMemo(
    () => [...(component.layers || [])].sort((a, b) => Number(a.zIndex || 0) - Number(b.zIndex || 0)),
    [component.layers]
  );
  const fallbackImageState = useLoadedImage(component.imageUrl);

  return (
    <Group
      x={component.x}
      y={component.y}
      onClick={onSelect}
      onTap={onSelect}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      {orderedLayers.length > 0
        ? orderedLayers.map((layer) => {
            const role = layer.role || "base";
            const visible = role !== "highlight" || selected || hovered;
            if (!visible) return null;
            return (
            <SingleImageLayer
              key={layer.id}
              src={layer.imageUrl}
              fallbackSrc={layer.fallbackImageUrl}
              x={layer.x}
              y={layer.y}
              width={layer.width}
              height={layer.height}
              cropX={layer.cropX}
              cropY={layer.cropY}
              cropWidth={layer.cropWidth}
              cropHeight={layer.cropHeight}
              opacity={layer.opacity == null ? (role === "highlight" ? (selected ? 0.95 : 0.78) : 1) : layer.opacity}
            />
            );
          })
        : fallbackImageState.image
          ? <KonvaImage image={fallbackImageState.image} width={component.width} height={component.height} />
          : null}
      {(selected || hovered) && !(component.layers || []).some((layer) => (layer.role || "base") === "highlight") ? (
        <Rect
          x={-4}
          y={-4}
          width={component.width + 8}
          height={component.height + 8}
          cornerRadius={12}
          stroke={selected ? "#b54534" : "#7f93ad"}
          strokeWidth={selected ? 2 : 1.5}
          dash={selected ? [6, 5] : [5, 5]}
          shadowColor={hovered ? "#90a0b6" : undefined}
          shadowBlur={hovered ? 12 : 0}
          shadowOpacity={hovered ? 0.28 : 0}
        />
      ) : null}
    </Group>
  );
}

function SingleImageLayer({
  src,
  fallbackSrc,
  x,
  y,
  width,
  height,
  cropX,
  cropY,
  cropWidth,
  cropHeight,
  opacity,
}: {
  src: string;
  fallbackSrc?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  opacity?: number;
}) {
  const { image, usedFallback } = useLoadedImage(src, fallbackSrc);
  if (!image) return null;
  const crop =
    !usedFallback && cropWidth && cropHeight
      ? {
          x: cropX || 0,
          y: cropY || 0,
          width: cropWidth,
          height: cropHeight,
        }
      : undefined;
  return (
    <KonvaImage
      image={image}
      x={x}
      y={y}
      width={width}
      height={height}
      crop={crop}
      opacity={opacity == null ? 1 : opacity}
    />
  );
}

function getTransform(mode: ViewMode) {
  if (mode === "front") return { scaleY: 1, skewX: 0, offsetY: 0 };
  if (mode === "top") return { scaleY: 0.72, skewX: -0.48, offsetY: -14 };
  return { scaleY: 0.84, skewX: -0.34, offsetY: -8 };
}

function findComponent(scene: GraphScene, productId: string, componentId: string) {
  const product = scene.products.find((item) => item.id === productId);
  const component = product?.components.find((item) => item.id === componentId);
  return product && component ? { product, component } : null;
}

function findPort(scene: GraphScene, productId: string, componentId: string, portId?: string) {
  const found = findComponent(scene, productId, componentId);
  if (!found) return null;
  if (!portId) {
    return found.component.ports?.[0] || null;
  }
  return found.component.ports?.find((port) => port.id === portId) || null;
}

function getRect(scene: GraphScene, productId: string, componentId: string) {
  const found = findComponent(scene, productId, componentId);
  if (!found) return null;
  return {
    x: found.product.x + found.component.x,
    y: found.product.y + found.component.y,
    width: found.component.width,
    height: found.component.height,
  };
}

function getPortPoint(scene: GraphScene, productId: string, componentId: string, portId?: string) {
  const found = findComponent(scene, productId, componentId);
  if (!found) return null;
  const port = findPort(scene, productId, componentId, portId);
  if (port) {
    return {
      x: found.product.x + found.component.x + port.x,
      y: found.product.y + found.component.y + port.y,
    };
  }
  return {
    x: found.product.x + found.component.x + found.component.width,
    y: found.product.y + found.component.y + found.component.height / 2,
  };
}

function getLinkPoints(scene: GraphScene, link: MaterialFlowLink) {
  const from = getPortPoint(scene, link.from.productId, link.from.componentId, link.from.portId);
  const to = getPortPoint(scene, link.to.productId, link.to.componentId, link.to.portId);
  if (!from || !to) return [];
  const x1 = from.x;
  const y1 = from.y;
  const x2 = to.x;
  const y2 = to.y;
  const mx = x1 + (x2 - x1) / 2;
  return [x1, y1, mx, y1, mx, y2, x2, y2];
}

function getPreviewLinkPoints(
  scene: GraphScene,
  source: { productId: string; componentId: string; portId?: string },
  target: { x: number; y: number } | { productId: string; componentId: string; portId?: string }
) {
  const from = getPortPoint(scene, source.productId, source.componentId, source.portId);
  const to =
    "productId" in target
      ? getPortPoint(scene, target.productId, target.componentId, target.portId)
      : target;
  if (!from || !to) return [];
  const mx = from.x + (to.x - from.x) / 2;
  return [from.x, from.y, mx, from.y, mx, to.y, to.x, to.y];
}

function getConnectedLinks(scene: GraphScene, productId: string, componentId: string, portId?: string) {
  return scene.links.filter((link) =>
    (link.from.productId === productId && link.from.componentId === componentId && link.from.portId === portId) ||
    (link.to.productId === productId && link.to.componentId === componentId && link.to.portId === portId)
  );
}

function ComponentShape({
  component,
  selected,
  hovered,
  onSelect,
  onHoverChange,
}: {
  component: ProductComponent;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  const stroke = selected ? "#b54534" : "#6e7a89";
  const width = selected ? 3 : 1.5;

  if ((component.layers && component.layers.length > 0) || component.imageUrl) {
    return (
      <LayeredComponentImage
        component={component}
        selected={selected}
        hovered={hovered}
        onSelect={onSelect}
        onHoverChange={onHoverChange}
      />
    );
  }

  if (component.kind === "pipe") {
    return (
      <Group x={component.x} y={component.y} onClick={onSelect} onTap={onSelect} onMouseEnter={() => onHoverChange(true)} onMouseLeave={() => onHoverChange(false)}>
        <Rect width={component.width} height={component.height} cornerRadius={999} fill={component.color} stroke={hovered && !selected ? "#8fa3bc" : stroke} strokeWidth={width} shadowColor={hovered ? "#93a5bb" : undefined} shadowBlur={hovered ? 10 : 0} shadowOpacity={hovered ? 0.25 : 0} />
        <Rect x={18} y={4} width={component.width - 36} height={5} cornerRadius={999} fill="rgba(255,255,255,0.42)" />
      </Group>
    );
  }

  if (component.kind === "support") {
    return (
      <Group x={component.x} y={component.y} onClick={onSelect} onTap={onSelect} onMouseEnter={() => onHoverChange(true)} onMouseLeave={() => onHoverChange(false)}>
        <Rect width={component.width} height={component.height} fill={component.color} stroke={hovered && !selected ? "#8fa3bc" : stroke} strokeWidth={width} shadowColor={hovered ? "#93a5bb" : undefined} shadowBlur={hovered ? 8 : 0} shadowOpacity={hovered ? 0.22 : 0} />
      </Group>
    );
  }

  if (component.kind === "port") {
    return (
      <Group x={component.x} y={component.y} onClick={onSelect} onTap={onSelect} onMouseEnter={() => onHoverChange(true)} onMouseLeave={() => onHoverChange(false)}>
        <Rect width={component.width} height={component.height} cornerRadius={10} fill={component.color} stroke={hovered && !selected ? "#8fa3bc" : stroke} strokeWidth={width} shadowColor={hovered ? "#93a5bb" : undefined} shadowBlur={hovered ? 10 : 0} shadowOpacity={hovered ? 0.22 : 0} />
        <Rect x={4} y={6} width={component.width - 8} height={8} cornerRadius={999} fill="rgba(255,255,255,0.35)" />
      </Group>
    );
  }

  return (
    <Group x={component.x} y={component.y} onClick={onSelect} onTap={onSelect} onMouseEnter={() => onHoverChange(true)} onMouseLeave={() => onHoverChange(false)}>
      <Circle x={component.width / 2} y={40} radius={component.width / 2.2} fill={component.color} stroke={hovered && !selected ? "#8fa3bc" : stroke} strokeWidth={width} shadowColor={hovered ? "#93a5bb" : undefined} shadowBlur={hovered ? 10 : 0} shadowOpacity={hovered ? 0.2 : 0} />
      <Rect x={20} y={42} width={component.width - 40} height={component.height - 64} cornerRadius={10} fill={component.color} stroke={hovered && !selected ? "#8fa3bc" : stroke} strokeWidth={width} />
      <Line points={[38, component.height - 20, 52, component.height + 18]} stroke="#556270" strokeWidth={4} />
      <Line points={[component.width - 38, component.height - 20, component.width - 52, component.height + 18]} stroke="#556270" strokeWidth={4} />
      <Rect x={30} y={16} width={component.width - 60} height={8} cornerRadius={999} fill="rgba(255,255,255,0.42)" />
    </Group>
  );
}

function ProductNode({
  scene,
  product,
  selected,
  hoveredComponentId,
  connectSource,
  onSelect,
  onSelectPort,
  onMove,
  onHoverChange,
}: {
  scene: GraphScene;
  product: ProductModel;
  selected: SelectedTarget;
  hoveredComponentId: string;
  connectSource: SelectedTarget;
  onSelect: (productId: string, componentId: string) => void;
  onSelectPort: (productId: string, componentId: string, portId: string) => void;
  onMove: (productId: string, x: number, y: number) => void;
  onHoverChange: (productId: string, componentId: string, hovered: boolean) => void;
}) {
  const transform = getTransform(product.viewMode);
  const orderedComponents = useMemo(
    () => [...product.components].sort((a, b) => Number(a.zIndex || 0) - Number(b.zIndex || 0)),
    [product.components]
  );
  return (
    <Group
      x={product.x}
      y={product.y}
      draggable
      onMouseDown={(evt) => {
        evt.cancelBubble = true;
      }}
      onTouchStart={(evt) => {
        evt.cancelBubble = true;
      }}
      onDragStart={(evt) => {
        evt.cancelBubble = true;
      }}
      onDragMove={(evt) => {
        evt.cancelBubble = true;
      }}
      onDragEnd={(evt) => {
        evt.cancelBubble = true;
        onMove(product.id, evt.target.x(), evt.target.y());
      }}
    >
      <Group y={transform.offsetY} scaleY={transform.scaleY} skewX={transform.skewX}>
        <Rect x={-24} y={210} width={280} height={24} cornerRadius={999} fill="rgba(50,58,72,0.12)" />
        <Label x={18} y={-18}>
          <Tag fill="rgba(255,255,255,0.96)" cornerRadius={9} pointerDirection="down" pointerWidth={10} pointerHeight={10} />
          <Text text={product.name} padding={9} fontSize={12} fill="#1f2937" fontStyle="700" />
        </Label>
        {orderedComponents.map((component) => {
          const isSelected =
            selected?.type === "component" &&
            selected.productId === product.id &&
            selected.componentId === component.id;
          const isHovered = hoveredComponentId === component.id;
          const isConnectSource =
            connectSource?.type === "port" &&
            connectSource.productId === product.id &&
            connectSource.componentId === component.id;
          const isConnectTarget =
            connectSource?.type === "port" &&
            component.ports?.some((port) =>
              isConnectionAllowed(scene, connectSource, { productId: product.id, componentId: component.id, portId: port.id })
            ) &&
            hoveredComponentId === component.id;
          return (
            <Group key={component.id}>
              <ComponentShape
                component={component}
                selected={isSelected || isConnectSource}
                hovered={isHovered || isConnectTarget}
                onSelect={() => onSelect(product.id, component.id)}
                onHoverChange={(hovered) => onHoverChange(product.id, component.id, hovered)}
              />
              {component.hotspots.map((hotspot) => (
                <Group key={hotspot.id} x={component.x + hotspot.x} y={component.y + hotspot.y} onClick={() => onSelect(product.id, component.id)} onTap={() => onSelect(product.id, component.id)}>
                  <Circle radius={isHovered || isSelected ? 6.5 : 6} fill="#c54a39" stroke="#fff" strokeWidth={2} />
                  <Circle radius={isHovered || isSelected ? 13 : 11} stroke={isHovered || isSelected ? "rgba(197,74,57,0.38)" : "rgba(197,74,57,0.25)"} strokeWidth={2} dash={[4, 3]} />
                </Group>
              ))}
            </Group>
          );
        })}
        {orderedComponents
          .filter((component) => Array.isArray(component.ports) && component.ports.length > 0)
          .map((component) =>
            component.ports?.map((port) => (
              <Group key={`${component.id}_${port.id}`} x={component.x + port.x} y={component.y + port.y}>
              {(hoveredComponentId === component.id ||
                (selected?.type === "component" && selected.productId === product.id && selected.componentId === component.id) ||
                (connectSource?.type === "port" && connectSource.productId === product.id && connectSource.componentId === component.id && connectSource.portId === port.id)) ? (
                <>
                  <Circle radius={11} fill="rgba(96,112,128,0.12)" />
                  <Label x={10} y={-26}>
                    <Tag fill="rgba(255,255,255,0.95)" cornerRadius={8} />
                    <Text
                      text={`${port.name}${port.direction ? ` · ${port.direction}` : ""}${(() => {
                        const usage = getPortUsageSummary(scene, { productId: product.id, componentId: component.id, portId: port.id });
                        if (usage.asSource > 0 || usage.asTarget > 0) {
                          return " · occupied";
                        }
                        return "";
                      })()}`}
                      padding={6}
                      fontSize={11}
                      fill="#334155"
                    />
                  </Label>
                </>
              ) : null}
              {connectSource?.type === "port" && isConnectionAllowed(scene, connectSource, { productId: product.id, componentId: component.id, portId: port.id }) ? (
                <Circle
                  radius={hoveredComponentId === component.id ? 13.5 : 10}
                  fill={hoveredComponentId === component.id ? "rgba(87, 182, 112, 0.18)" : "rgba(87, 182, 112, 0.10)"}
                  stroke={hoveredComponentId === component.id ? "#57b670" : "rgba(87, 182, 112, 0.55)"}
                  strokeWidth={hoveredComponentId === component.id ? 2 : 1.5}
                  dash={hoveredComponentId === component.id ? undefined : [4, 4]}
                />
              ) : null}
              <Circle
                radius={hoveredComponentId === component.id ? 5.5 : 4}
                fill={
                  connectSource?.type === "port" && connectSource.productId === product.id && connectSource.componentId === component.id && connectSource.portId === port.id
                    ? "#c54a39"
                    : (() => {
                        const usage = getPortUsageSummary(scene, { productId: product.id, componentId: component.id, portId: port.id });
                        if (usage.asSource > 0 || usage.asTarget > 0) {
                          return "#f59e0b";
                        }
                        return hoveredComponentId === component.id && isConnectionAllowed(scene, connectSource, { productId: product.id, componentId: component.id, portId: port.id })
                          ? "#57b670"
                          : "#ffffff";
                      })()
                }
                stroke={
                  (() => {
                    const usage = getPortUsageSummary(scene, { productId: product.id, componentId: component.id, portId: port.id });
                    if (usage.asSource > 0 || usage.asTarget > 0) {
                      return "#d97706";
                    }
                    if (hoveredComponentId === component.id && isConnectionAllowed(scene, connectSource, { productId: product.id, componentId: component.id, portId: port.id })) {
                      return "#57b670";
                    }
                    return hoveredComponentId === component.id ? "#8a9cb2" : "#607080";
                  })()
                }
                strokeWidth={1.5}
                onClick={() => onSelectPort(product.id, component.id, port.id)}
                onTap={() => onSelectPort(product.id, component.id, port.id)}
              />
              </Group>
            ))
          )}
      </Group>
    </Group>
  );
}

function FlowLink({ scene, link, selected, onSelect }: { scene: GraphScene; link: MaterialFlowLink; selected: boolean; onSelect: () => void }) {
  const dashOffset = useDashOffset(link.flow === "flowing");
  const points = useMemo(() => getLinkPoints(scene, link), [scene, link]);
  if (points.length === 0) return null;
  return (
    <Group onClick={onSelect} onTap={onSelect}>
      <Line points={points} stroke="rgba(56,65,81,0.18)" strokeWidth={10} lineCap="round" lineJoin="round" />
      <Line points={points} stroke={selected ? "#c54a39" : "#596476"} strokeWidth={4} lineCap="round" lineJoin="round" />
      {link.flow === "flowing" ? (
        <Line points={points} stroke="#79c26e" strokeWidth={2} dash={[12, 10]} dashOffset={dashOffset} lineCap="round" lineJoin="round" />
      ) : null}
    </Group>
  );
}

function PreviewLink({
  points,
}: {
  points: number[];
}) {
  if (points.length === 0) return null;
  return (
    <Group listening={false}>
      <Line points={points} stroke="rgba(94, 115, 140, 0.18)" strokeWidth={10} lineCap="round" lineJoin="round" />
      <Line points={points} stroke="#6f849f" strokeWidth={3} dash={[10, 8]} lineCap="round" lineJoin="round" />
      <Circle x={points[points.length - 2]} y={points[points.length - 1]} radius={4.5} fill="#6f849f" />
    </Group>
  );
}

function App() {
  const { ref, size } = useContainerSize();
  const [scene, setScene] = useState<GraphScene>(cloneDefaultScene);
  const [selected, setSelected] = useState<SelectedTarget>(null);
  const [status, setStatus] = useState("正在初始化图形编辑器...");
  const [ready, setReady] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("bird");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(PRODUCT_LIBRARY[0]?.templateId || "");
  const [connectSource, setConnectSource] = useState<SelectedTarget>(null);
  const [hoveredComponent, setHoveredComponent] = useState<{ productId: string; componentId: string } | null>(null);
  const [pointerWorld, setPointerWorld] = useState<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState({ scale: 0.42, x: 80, y: 70 });
  const [spacePressed, setSpacePressed] = useState(false);
  const [blankPanning, setBlankPanning] = useState(false);
  const firstSaveSkipped = useRef(false);
  const blankPanStart = useRef<{ pointerX: number; pointerY: number; viewportX: number; viewportY: number } | null>(null);

  useEffect(() => {
    let disposed = false;
    Office.onReady(async () => {
      try {
        const stored = await loadGraphFromWorkbook();
        if (disposed) return;
        setScene(asScene(stored));
        setStatus(stored ? "已从工作簿恢复场景。" : "已加载默认工业场景。");
      } catch (error) {
        if (disposed) return;
        setStatus(`读取工作簿失败，已加载默认场景：${String((error as Error)?.message || "未知错误")}`);
      } finally {
        if (!disposed) setReady(true);
      }
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    setScene((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      products: current.products.map((product) => ({ ...product, viewMode })),
    }));
  }, [viewMode]);

  useEffect(() => {
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.code !== "Space") return;
      const target = evt.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      evt.preventDefault();
      setSpacePressed(true);
    };
    const onKeyUp = (evt: KeyboardEvent) => {
      if (evt.code !== "Space") return;
      setSpacePressed(false);
    };
    const onBlur = () => setSpacePressed(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const finishBlankPan = () => {
      blankPanStart.current = null;
      setBlankPanning(false);
    };
    window.addEventListener("mouseup", finishBlankPan);
    window.addEventListener("blur", finishBlankPan);
    return () => {
      window.removeEventListener("mouseup", finishBlankPan);
      window.removeEventListener("blur", finishBlankPan);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!firstSaveSkipped.current) {
      firstSaveSkipped.current = true;
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        await saveGraphToWorkbook({
          schemaVersion: "2.0",
          updatedAt: scene.updatedAt,
          graph: { nodes: scene.products, edges: scene.links, updatedAt: scene.updatedAt },
          images: {},
        });
        setStatus("已保存到工作簿。");
      } catch (error) {
        setStatus(`保存失败：${String((error as Error)?.message || "未知错误")}`);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [ready, scene]);

  const selectedComponent = useMemo(() => {
    if (!selected || (selected.type !== "component" && selected.type !== "port")) return null;
    return findComponent(scene, selected.productId, selected.componentId);
  }, [scene, selected]);

  const selectedLink = useMemo(() => {
    if (!selected || selected.type !== "link") return null;
    return scene.links.find((item) => item.id === selected.linkId) || null;
  }, [scene.links, selected]);

  const selectedLinkInfo = useMemo(() => {
    if (!selectedLink) return null;
    return {
      link: selectedLink,
      fromLabel: getPortDisplayName(scene, selectedLink.from),
      toLabel: getPortDisplayName(scene, selectedLink.to),
      fromComponent: findComponent(scene, selectedLink.from.productId, selectedLink.from.componentId),
      toComponent: findComponent(scene, selectedLink.to.productId, selectedLink.to.componentId),
    };
  }, [scene, selectedLink]);

  const selectedPort = useMemo(() => {
    if (!selected || selected.type !== "port") return null;
    const componentResult = findComponent(scene, selected.productId, selected.componentId);
    const port = findPort(scene, selected.productId, selected.componentId, selected.portId);
    if (!componentResult || !port) return null;
    const usage = getPortUsageSummary(scene, { productId: selected.productId, componentId: selected.componentId, portId: selected.portId });
    const links = getConnectedLinks(scene, selected.productId, selected.componentId, selected.portId);
    return {
      product: componentResult.product,
      component: componentResult.component,
      port,
      usage,
      links,
    };
  }, [scene, selected]);

  const previewLinkPoints = useMemo(() => {
    if (!connectSource || connectSource.type !== "port") return [];
    if (
      hoveredComponent &&
      (() => {
        const component = findComponent(scene, hoveredComponent.productId, hoveredComponent.componentId)?.component;
        return (component?.ports || []).some((port) =>
          isConnectionAllowed(scene, connectSource, {
            productId: hoveredComponent.productId,
            componentId: hoveredComponent.componentId,
            portId: port.id,
          })
        );
      })()
    ) {
      const component = findComponent(scene, hoveredComponent.productId, hoveredComponent.componentId)?.component;
      const port = (component?.ports || []).find((item) =>
        isConnectionAllowed(scene, connectSource, {
          productId: hoveredComponent.productId,
          componentId: hoveredComponent.componentId,
          portId: item.id,
        })
      );
      if (port) {
        return getPreviewLinkPoints(scene, connectSource, {
          productId: hoveredComponent.productId,
          componentId: hoveredComponent.componentId,
          portId: port.id,
        });
      }
    }
    if (pointerWorld) {
      return getPreviewLinkPoints(scene, connectSource, pointerWorld);
    }
    return [];
  }, [scene, connectSource, hoveredComponent, pointerWorld]);

  const updateScene = (next: (current: GraphScene) => GraphScene) =>
    setScene((current) => ({ ...next(current), updatedAt: new Date().toISOString() }));

  const onSelectComponent = (productId: string, componentId: string) => {
    setSelected({ type: "component", productId, componentId });
  };

  const onSelectPort = (productId: string, componentId: string, portId: string) => {
    const targetPort: SelectedTarget = { type: "port", productId, componentId, portId };
    if (connectSource?.type === "port" && isConnectionAllowed(scene, connectSource, { productId, componentId, portId })) {
      updateScene((current) => ({
        ...current,
        links: [
          ...current.links,
          {
            id: `link_${Date.now()}`,
            from: { productId: connectSource.productId, componentId: connectSource.componentId, portId: connectSource.portId },
            to: { productId, componentId, portId },
            flow: "flowing",
            materialName: "新建物流线",
          },
        ],
      }));
      setConnectSource(null);
      setPointerWorld(null);
      setSelected(targetPort);
      setStatus("已建立端口连接，并启用物流流动动画。");
      return;
    }
    setSelected(targetPort);
  };

  const onDeleteSelected = () => {
    if (!selected) {
      setStatus("请先选中一个设备、端口或连接线。");
      return;
    }
    if (selected.type === "link") {
      updateScene((current) => ({ ...current, links: current.links.filter((item) => item.id !== selected.linkId) }));
    }
    if (selected.type === "component" || selected.type === "port") {
      const productId = selected.productId;
      updateScene((current) => {
        const removedProduct = current.products.find((product) => product.id === productId);
        const removedComponentIds = new Set((removedProduct?.components || []).map((component) => component.id));
        return {
          ...current,
          products: current.products.filter((product) => product.id !== productId),
          links: current.links.filter((link) => {
            const hitsFrom = link.from.productId === productId && removedComponentIds.has(link.from.componentId);
            const hitsTo = link.to.productId === productId && removedComponentIds.has(link.to.componentId);
            return !hitsFrom && !hitsTo;
          }),
        };
      });
      setStatus("已删除选中的设备实例。");
    }
    setSelected(null);
    setConnectSource(null);
    setPointerWorld(null);
    setHoveredComponent(null);
  };

  const onToggleFlow = () => {
    if (!selectedLink) {
      setStatus("请先选中一条连接线。");
      return;
    }
    updateScene((current) => ({
      ...current,
      links: current.links.map((item) => (item.id === selectedLink.id ? { ...item, flow: item.flow === "flowing" ? "idle" : "flowing" } : item)),
    }));
  };

  const onBeginConnect = () => {
    if (!selected || selected.type !== "port") {
      setStatus("先选中一个端口，再点击“建立连接”。");
      return;
    }
    setConnectSource(selected);
    setStatus("已进入连接模式，请点击目标端口。");
  };

  const onAddProduct = () => {
    const template =
      PRODUCT_LIBRARY.find((item) => item.templateId === selectedTemplateId) ||
      PRODUCT_LIBRARY[0];
    const nextIndex = scene.products.length + 1;
    const placement = {
      x: 260 + ((nextIndex - 1) % 3) * 280,
      y: 280 + Math.floor((nextIndex - 1) / 3) * 220,
    };
    const product = createProductFromTemplate(template.templateId, placement, nextIndex);
    updateScene((current) => ({
      ...current,
      products: [...current.products, product],
    }));
    setSelected(null);
    setStatus(`已新增产品实例：${template.name}`);
  };

  const handleHoverChange = (productId: string, componentId: string, hovered: boolean) => {
    if (hovered) {
      setHoveredComponent({ productId, componentId });
      return;
    }
    setHoveredComponent((current) => {
      if (!current) return null;
      return current.productId === productId && current.componentId === componentId ? null : current;
    });
  };

  return (
    <div className="graph-editor-shell">
      <main className="graph-editor-main">
        <section className="graph-canvas-panel">
          <header className="graph-canvas-header">
            <div>
              <h1>工业场景编辑器</h1>
              <p>React + react-konva 底座。当前支持组件热点、连接动画、俯视/鸟瞰切换。</p>
              <p>
                当前新增模板：
                {PRODUCT_LIBRARY.find((item) => item.templateId === selectedTemplateId)?.name || "未选择模板"}
              </p>
              <p>左键拖动设备可移动设备；左键拖动空白区域可平移画布；按住空格也可辅助平移。</p>
            </div>
            <div className="view-switches">
              {(["front", "top", "bird"] as ViewMode[]).map((mode) => (
                <button key={mode} type="button" className={`toolbar-btn${viewMode === mode ? " active" : ""}`} onClick={() => setViewMode(mode)}>
                  {mode === "front" ? "正视" : mode === "top" ? "俯视" : "鸟瞰"}
                </button>
              ))}
            </div>
          </header>
          <div ref={ref} className={`graph-stage-shell${spacePressed || blankPanning ? " pan-ready" : ""}${blankPanning ? " panning" : ""}`}>
            <Stage
              width={size.width}
              height={size.height}
              scaleX={viewport.scale}
              scaleY={viewport.scale}
              x={viewport.x}
              y={viewport.y}
              draggable={spacePressed}
              onDragEnd={(evt) => {
                if (evt.target !== evt.target.getStage()) return;
                setViewport((current) => ({ ...current, x: evt.target.x(), y: evt.target.y() }));
              }}
              onWheel={(evt) => {
                evt.evt.preventDefault();
                const next = viewport.scale + (evt.evt.deltaY > 0 ? -0.05 : 0.05);
                setViewport((current) => ({ ...current, scale: Math.max(0.18, Math.min(1.8, Number(next.toFixed(2)))) }));
              }}
              onMouseMove={(evt) => {
                const stage = evt.target.getStage();
                const pointer = stage?.getPointerPosition();
                if (!pointer) return;
                const panStart = blankPanStart.current;
                if (panStart && !spacePressed) {
                  const deltaX = pointer.x - panStart.pointerX;
                  const deltaY = pointer.y - panStart.pointerY;
                  setViewport((current) => ({
                    ...current,
                    x: panStart.viewportX + deltaX,
                    y: panStart.viewportY + deltaY,
                  }));
                }
                setPointerWorld({
                  x: (pointer.x - viewport.x) / viewport.scale,
                  y: (pointer.y - viewport.y) / viewport.scale,
                });
              }}
              onMouseDown={(evt) => {
                if (evt.target === evt.target.getStage()) {
                  const stage = evt.target.getStage();
                  const pointer = stage?.getPointerPosition();
                  if (pointer && !spacePressed) {
                    blankPanStart.current = {
                      pointerX: pointer.x,
                      pointerY: pointer.y,
                      viewportX: viewport.x,
                      viewportY: viewport.y,
                    };
                    setBlankPanning(true);
                  }
                  setSelected(null);
                  setConnectSource(null);
                  setPointerWorld(null);
                }
              }}
              onMouseUp={() => {
                blankPanStart.current = null;
                setBlankPanning(false);
              }}
            >
              <Layer listening={false}>
                <Rect x={0} y={0} width={WORLD_W} height={WORLD_H} fill="#e9edf4" cornerRadius={28} />
                {Array.from({ length: Math.ceil((WORLD_W + WORLD_H) / GRID_MINOR) + 6 }).map((_, i) => {
                  const x = -WORLD_H + i * GRID_MINOR;
                  return (
                    <Line
                      key={`v-${i}`}
                      points={[x, 0, x + WORLD_H, WORLD_H]}
                      stroke={i % 4 === 0 ? "rgba(84,97,126,0.16)" : "rgba(84,97,126,0.06)"}
                      strokeWidth={i % 4 === 0 ? 1.6 : 1}
                    />
                  );
                })}
                {Array.from({ length: Math.ceil(WORLD_H / GRID_MINOR) + 4 }).map((_, i) => (
                  <Line
                    key={`h-${i}`}
                    points={[0, i * GRID_MINOR, WORLD_W, i * GRID_MINOR]}
                    stroke={i % 4 === 0 ? "rgba(84,97,126,0.12)" : "rgba(84,97,126,0.05)"}
                    strokeWidth={i % 4 === 0 ? 1.5 : 1}
                  />
                ))}
                <Line points={[180, 260, 1280, 260, 930, 980, -120, 980]} fill="rgba(255,255,255,0.64)" closed />
                <Line points={[2380, 180, 4180, 180, 3820, 980, 2040, 980]} fill="rgba(255,255,255,0.52)" closed />
                <Line points={[4620, 540, 6460, 540, 6140, 1400, 4340, 1400]} fill="rgba(255,255,255,0.48)" closed />
                <Line points={[1680, 2280, 3420, 2280, 3100, 3060, 1400, 3060]} fill="rgba(255,255,255,0.44)" closed />
                <Line points={[4300, 2560, 6140, 2560, 5820, 3400, 3980, 3400]} fill="rgba(255,255,255,0.46)" closed />
              </Layer>
              <Layer>
                {scene.links.map((link) => (
                  <FlowLink key={link.id} scene={scene} link={link} selected={selected?.type === "link" && selected.linkId === link.id} onSelect={() => setSelected({ type: "link", linkId: link.id })} />
                ))}
                <PreviewLink points={previewLinkPoints} />
              </Layer>
              <Layer>
                {scene.products.map((product) => (
                  <ProductNode
                    key={product.id}
                    scene={scene}
                    product={product}
                    selected={selected}
                    hoveredComponentId={hoveredComponent?.productId === product.id ? hoveredComponent.componentId : ""}
                    connectSource={connectSource}
                    onSelect={onSelectComponent}
                    onSelectPort={onSelectPort}
                    onMove={(productId, x, y) =>
                      updateScene((current) => ({
                        ...current,
                        products: current.products.map((item) => (item.id === productId ? { ...item, x, y } : item)),
                      }))
                    }
                    onHoverChange={handleHoverChange}
                  />
                ))}
              </Layer>
            </Stage>
          </div>
        </section>

        <aside className="graph-inspector">
          <section className="inspector-card">
            <h2>属性面板</h2>
            {selected?.type === "port" && selectedPort ? (
              <>
                <div className="inspector-title">{selectedPort.port.name}</div>
                <div className="inspector-subtitle">
                  {selectedPort.product.name} / {selectedPort.component.name}
                </div>
                <dl className="inspector-grid">
                  <dt>方向</dt>
                  <dd>{selectedPort.port.direction || "both"}</dd>
                  <dt>组件</dt>
                  <dd>{selectedPort.component.name}</dd>
                  <dt>作为起点</dt>
                  <dd>{selectedPort.usage.asSource}</dd>
                  <dt>作为终点</dt>
                  <dd>{selectedPort.usage.asTarget}</dd>
                  <dt>占用状态</dt>
                  <dd>{selectedPort.usage.asSource > 0 || selectedPort.usage.asTarget > 0 ? "已占用" : "空闲"}</dd>
                </dl>
                <p className="inspector-note">
                  已连接：
                  {selectedPort.links.length > 0
                    ? selectedPort.links
                        .map((link) => {
                          const isSource =
                            link.from.productId === selectedPort.product.id &&
                            link.from.componentId === selectedPort.component.id &&
                            link.from.portId === selectedPort.port.id;
                          const endpoint = isSource ? link.to : link.from;
                          return getPortDisplayName(scene, endpoint);
                        })
                        .join("；")
                    : "无"}
                </p>
              </>
            ) : selectedComponent ? (
              <>
                <div className="inspector-title">{selectedComponent.component.name}</div>
                <div className="inspector-subtitle">{selectedComponent.product.name}</div>
                <dl className="inspector-grid">
                  {Object.entries(selectedComponent.component.parameters).map(([key, value]) => (
                    <React.Fragment key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
                <p className="inspector-note">热点数：{selectedComponent.component.hotspots.length}</p>
              </>
            ) : selectedLinkInfo ? (
              <>
                <div className="inspector-title">物流连接</div>
                <div className="inspector-subtitle">{selectedLinkInfo.link.materialName}</div>
                <dl className="inspector-grid">
                  <dt>状态</dt>
                  <dd>{selectedLinkInfo.link.flow === "flowing" ? "流动中" : "静止"}</dd>
                  <dt>起点</dt>
                  <dd>{selectedLinkInfo.fromLabel}</dd>
                  <dt>终点</dt>
                  <dd>{selectedLinkInfo.toLabel}</dd>
                  <dt>起点组件</dt>
                  <dd>{selectedLinkInfo.fromComponent?.component.name || selectedLinkInfo.link.from.componentId}</dd>
                  <dt>终点组件</dt>
                  <dd>{selectedLinkInfo.toComponent?.component.name || selectedLinkInfo.link.to.componentId}</dd>
                </dl>
              </>
            ) : (
              <p className="inspector-placeholder">选择一个组件或连线后，这里会显示参数。</p>
            )}
          </section>

          <section className="inspector-card">
            <h3>当前状态</h3>
            <p className="status-text">{status}</p>
            {connectSource?.type === "component" ? <p className="status-pill">连接模式：已选择源组件</p> : null}
          </section>
        </aside>
      </main>

      <footer className="graph-toolbar">
        <label className="template-picker">
          <span>新增模板</span>
          <select
            value={selectedTemplateId}
            onChange={(evt) => setSelectedTemplateId(evt.target.value)}
          >
            {PRODUCT_LIBRARY.map((template) => (
              <option key={template.templateId} value={template.templateId}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="toolbar-btn" onClick={onAddProduct}>新增产品</button>
        <button type="button" className="toolbar-btn" onClick={onBeginConnect}>建立连接</button>
        <button type="button" className="toolbar-btn" onClick={onToggleFlow}>切换流动</button>
        <button type="button" className="toolbar-btn" onClick={() => setViewport((current) => ({ ...current, scale: Math.min(1.8, Number((current.scale + 0.1).toFixed(2))) }))}>放大</button>
        <button type="button" className="toolbar-btn" onClick={() => setViewport((current) => ({ ...current, scale: Math.max(0.18, Number((current.scale - 0.1).toFixed(2))) }))}>缩小</button>
        <button type="button" className="toolbar-btn danger" onClick={onDeleteSelected}>删除选中</button>
        <button
          type="button"
          className="toolbar-btn primary"
          onClick={async () => {
            await saveGraphToWorkbook({ schemaVersion: "2.0", updatedAt: scene.updatedAt, graph: { nodes: scene.products, edges: scene.links, updatedAt: scene.updatedAt }, images: {} });
            setStatus("手动保存成功。");
          }}
        >
          保存
        </button>
      </footer>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
