/* global Office */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Circle, Group, Image as KonvaImage, Label, Layer, Line, Rect, Stage, Tag, Text } from "react-konva";
import { getPortDisplayName, getPortUsageSummary, isConnectionAllowed } from "./connectionRules";
import { buildDefaultScene, createProductFromTemplate, PRODUCT_LIBRARY } from "./productLibrary";
import { QuoteLibraryResolvedItem, resolveTemplateFromProductName, resolveTemplateThumbnail } from "./productLibraryLookup";
import { GraphScene, MaterialFlowLink, ProductComponent, ProductModel, SelectedTarget, ViewMode } from "./sceneTypes";
import { GraphProductLibraryEntry, WorkbookGraphPayload } from "./workbookStore";
import { useContainerSize, useLoadedImage } from "../shared/konvaHooks";

const WORLD_W = 7200;
const WORLD_H = 4200;
const GRID_MAJOR = 180;
const GRID_MINOR = 45;
const GRAPH_EDITOR_TEMPLATES_MSG = "graph_editor_templates";
const GRAPH_EDITOR_REQUEST_MSG = "graph_editor_request_templates";
const GRAPH_EDITOR_SAVE_REQUEST_MSG = "graph_editor_save_request";
const GRAPH_EDITOR_SAVE_RESULT_MSG = "graph_editor_save_result";

type QuoteLibraryItem = QuoteLibraryResolvedItem & {
  key: string;
};

type DrawerMode = "products" | "tools" | null;
type DragLibraryPayload = {
  source: "products" | "tools";
  templateId: string;
  deviceName: string;
};

type GraphEditorDialogPayload = {
  cache: unknown | null;
  graph: WorkbookGraphPayload | null;
  quoteProductNames: string[];
  libraryEntries: GraphProductLibraryEntry[];
};

let pendingDialogPayloadResolver: ((payload: GraphEditorDialogPayload) => void) | null = null;
let pendingSaveRequestSeq = 0;
const pendingSaveRequests = new Map<
  string,
  {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: number;
  }
>();
let activeDragLibraryPayload: DragLibraryPayload | null = null;

function cloneDefaultScene() {
  return buildDefaultScene();
}

function asScene(raw: WorkbookGraphPayload | null): GraphScene {
  if (!raw?.graph?.nodes || !Array.isArray(raw.graph.nodes) || raw.graph.nodes.length === 0) return cloneDefaultScene();
  return {
    updatedAt: String(raw.updatedAt || raw.graph.updatedAt || new Date().toISOString()),
    products: raw.graph.nodes as ProductModel[],
    links: Array.isArray(raw.graph.edges) ? (raw.graph.edges as MaterialFlowLink[]) : [],
  };
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

function normalizePortDirection(direction?: "in" | "out" | "both") {
  return direction || "both";
}

function getPortColorPalette(direction?: "in" | "out" | "both") {
  const normalized = normalizePortDirection(direction);
  if (normalized === "in") {
    return {
      baseFill: "#4b8fe8",
      baseStroke: "#2f6fbe",
      haloFill: "rgba(75, 143, 232, 0.12)",
      haloStroke: "rgba(75, 143, 232, 0.42)",
    };
  }
  if (normalized === "out") {
    return {
      baseFill: "#f08a32",
      baseStroke: "#c56a1f",
      haloFill: "rgba(240, 138, 50, 0.12)",
      haloStroke: "rgba(240, 138, 50, 0.42)",
    };
  }
  return {
    baseFill: "#7a8797",
    baseStroke: "#607080",
    haloFill: "rgba(122, 135, 151, 0.12)",
    haloStroke: "rgba(96, 112, 128, 0.42)",
  };
}

function getPortOccupiedState(
  usage: { asSource: number; asTarget: number },
  direction?: "in" | "out" | "both"
) {
  const normalized = normalizePortDirection(direction);
  if (normalized === "in") {
    return {
      occupied: usage.asTarget > 0,
      label: usage.asTarget > 0 ? " · 已接入" : "",
    };
  }
  if (normalized === "out") {
    return {
      occupied: usage.asSource > 0,
      label: usage.asSource > 0 ? " · 已输出" : "",
    };
  }
  const occupied = usage.asSource > 0 || usage.asTarget > 0;
  return {
    occupied,
    label: occupied ? " · occupied" : "",
  };
}

function getPortOccupiedText(
  usage: { asSource: number; asTarget: number },
  direction?: "in" | "out" | "both"
) {
  const normalized = normalizePortDirection(direction);
  if (normalized === "in") {
    return usage.asTarget > 0 ? "已接入" : "空闲";
  }
  if (normalized === "out") {
    return usage.asSource > 0 ? "已输出" : "空闲";
  }
  return usage.asSource > 0 || usage.asTarget > 0 ? "已占用" : "空闲";
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

function isPipeLink(scene: GraphScene, link: MaterialFlowLink) {
  const fromComponent = findComponent(scene, link.from.productId, link.from.componentId)?.component;
  const toComponent = findComponent(scene, link.to.productId, link.to.componentId)?.component;
  return fromComponent?.kind === "pipe" || toComponent?.kind === "pipe";
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

function getProductInstanceLabel(scene: GraphScene, productId: string) {
  const product = scene.products.find((item) => item.id === productId);
  if (!product) return productId;
  const sameNameProducts = scene.products.filter((item) => item.name === product.name);
  const index = sameNameProducts.findIndex((item) => item.id === productId);
  return `${product.name} #${Math.max(index + 1, 1)}`;
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
  hoveredPort,
  connectSource,
  onSelect,
  onSelectPort,
  onMove,
  onHoverChange,
  onHoverPortChange,
  onContextMenu,
}: {
  scene: GraphScene;
  product: ProductModel;
  selected: SelectedTarget;
  hoveredComponentId: string;
  hoveredPort: { productId: string; componentId: string; portId: string } | null;
  connectSource: SelectedTarget;
  onSelect: (productId: string, componentId: string) => void;
  onSelectPort: (productId: string, componentId: string, portId: string) => void;
  onMove: (productId: string, x: number, y: number) => void;
  onHoverChange: (productId: string, componentId: string, hovered: boolean) => void;
  onHoverPortChange: (port: { productId: string; componentId: string; portId: string } | null) => void;
  onContextMenu: (evt: any, productId: string, componentId: string) => void;
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
            <Group
              key={component.id}
              onContextMenu={(evt) => {
                evt.evt.preventDefault();
                onContextMenu(evt, product.id, component.id);
              }}
            >
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
            component.ports?.map((port) => {
              const usage = getPortUsageSummary(scene, { productId: product.id, componentId: component.id, portId: port.id });
              const palette = getPortColorPalette(port.direction);
              const occupiedState = getPortOccupiedState(usage, port.direction);
              const isCurrentSource =
                connectSource?.type === "port" &&
                connectSource.productId === product.id &&
                connectSource.componentId === component.id &&
                connectSource.portId === port.id;
              const isCurrentHover =
                hoveredPort?.productId === product.id &&
                hoveredPort.componentId === component.id &&
                hoveredPort.portId === port.id;
              const isCurrentSelected =
                selected?.type === "port" &&
                selected.productId === product.id &&
                selected.componentId === component.id &&
                selected.portId === port.id;
              const isConnectableTarget =
                connectSource?.type === "port" &&
                isConnectionAllowed(scene, connectSource, { productId: product.id, componentId: component.id, portId: port.id });
              const isOccupied = occupiedState.occupied;
              return (
              <Group key={`${component.id}_${port.id}`} x={component.x + port.x} y={component.y + port.y}>
              {isCurrentHover ? (
                <>
                  <Circle radius={11} fill="rgba(96,112,128,0.12)" />
                  <Label x={10} y={-26}>
                    <Tag fill="rgba(255,255,255,0.95)" cornerRadius={8} />
                    <Text
                      text={`${port.name}${port.direction ? ` · ${port.direction}` : ""}${occupiedState.label}`}
                      padding={6}
                      fontSize={11}
                      fill="#334155"
                    />
                  </Label>
                </>
              ) : null}
              {isConnectableTarget ? (
                <Circle
                  radius={hoveredComponentId === component.id ? 17 : 14}
                  fill={hoveredComponentId === component.id ? "rgba(87, 182, 112, 0.22)" : "rgba(87, 182, 112, 0.12)"}
                  stroke={hoveredComponentId === component.id ? "#57b670" : "rgba(87, 182, 112, 0.72)"}
                  strokeWidth={hoveredComponentId === component.id ? 2.5 : 2}
                  dash={hoveredComponentId === component.id ? undefined : [5, 4]}
                />
              ) : null}
              <Circle
                radius={8.5}
                fill={isConnectableTarget ? "rgba(255,255,255,0.98)" : palette.haloFill}
                stroke={isConnectableTarget ? "#57b670" : palette.haloStroke}
                strokeWidth={1}
              />
              <Circle
                radius={16}
                fill="rgba(255,255,255,0.001)"
                onMouseEnter={() => {
                  console.log("[graphEditor] hovered port", {
                    productId: product.id,
                    productName: product.name,
                    componentId: component.id,
                    componentName: component.name,
                    portId: port.id,
                    portName: port.name,
                    direction: port.direction || "both",
                    usage,
                  });
                  onHoverPortChange({ productId: product.id, componentId: component.id, portId: port.id });
                }}
                onMouseLeave={() => {
                  onHoverPortChange((hoveredPort &&
                    hoveredPort.productId === product.id &&
                    hoveredPort.componentId === component.id &&
                    hoveredPort.portId === port.id)
                      ? null
                      : hoveredPort);
                }}
                onClick={() => onSelectPort(product.id, component.id, port.id)}
                onTap={() => onSelectPort(product.id, component.id, port.id)}
              />
              <Circle
                radius={hoveredComponentId === component.id ? 7 : 5.5}
                fill={
                  isCurrentSource
                    ? "#c54a39"
                    : isOccupied
                      ? "#f59e0b"
                      : isConnectableTarget
                        ? "#57b670"
                        : palette.baseFill
                }
                stroke={
                  isOccupied
                    ? "#d97706"
                    : isConnectableTarget
                      ? "#57b670"
                      : hoveredComponentId === component.id
                        ? palette.baseStroke
                        : palette.baseStroke
                }
                strokeWidth={2}
                onClick={() => onSelectPort(product.id, component.id, port.id)}
                onTap={() => onSelectPort(product.id, component.id, port.id)}
              />
              </Group>
            )})
          )}
      </Group>
    </Group>
  );
}

function FlowLink({
  scene,
  link,
  selected,
  onSelect,
  onContextMenu,
}: {
  scene: GraphScene;
  link: MaterialFlowLink;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (evt: any) => void;
}) {
  const dashOffset = useDashOffset(link.flow === "flowing");
  const points = useMemo(() => getLinkPoints(scene, link), [scene, link]);
  const pipeLink = useMemo(() => isPipeLink(scene, link), [scene, link]);
  if (points.length === 0) return null;
  return (
    <Group
      onClick={onSelect}
      onTap={onSelect}
      onContextMenu={(evt) => {
        evt.evt.preventDefault();
        onContextMenu(evt);
      }}
    >
      {pipeLink ? (
        <>
          <Line
            points={points}
            stroke={selected ? "rgba(197,69,52,0.30)" : "rgba(83, 97, 116, 0.22)"}
            strokeWidth={30}
            lineCap="round"
            lineJoin="round"
          />
          <Line
            points={points}
            stroke={selected ? "#c54a39" : "#aeb9c7"}
            strokeWidth={24}
            lineCap="round"
            lineJoin="round"
          />
          <Line
            points={points}
            stroke="rgba(255,255,255,0.42)"
            strokeWidth={6}
            lineCap="round"
            lineJoin="round"
          />
          {link.flow === "flowing" ? (
            <Line
              points={points}
              stroke="rgba(121,194,110,0.55)"
              strokeWidth={3}
              dash={[14, 12]}
              dashOffset={dashOffset}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}
        </>
      ) : (
        <>
          <Line
            points={points}
            stroke="rgba(56,65,81,0.18)"
            strokeWidth={10}
            lineCap="round"
            lineJoin="round"
          />
          <Line
            points={points}
            stroke={selected ? "#c54a39" : "#596476"}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
          {link.flow === "flowing" ? (
            <Line
              points={points}
              stroke="#79c26e"
              strokeWidth={2}
              dash={[12, 10]}
              dashOffset={dashOffset}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}
        </>
      )}
    </Group>
  );
}

function PreviewLink({
  points,
  pipeStyle = false,
}: {
  points: number[];
  pipeStyle?: boolean;
}) {
  if (points.length === 0) return null;
  return (
    <Group listening={false}>
      {pipeStyle ? (
        <>
          <Line points={points} stroke="rgba(83, 97, 116, 0.18)" strokeWidth={28} lineCap="round" lineJoin="round" />
          <Line points={points} stroke="#aeb9c7" strokeWidth={22} lineCap="round" lineJoin="round" />
          <Line points={points} stroke="rgba(255,255,255,0.34)" strokeWidth={5} lineCap="round" lineJoin="round" />
        </>
      ) : (
        <>
          <Line points={points} stroke="rgba(94, 115, 140, 0.18)" strokeWidth={10} lineCap="round" lineJoin="round" />
          <Line points={points} stroke="#6f849f" strokeWidth={3} dash={[10, 8]} lineCap="round" lineJoin="round" />
        </>
      )}
    </Group>
  );
}

function registerParentMessageHandler() {
  try {
    Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, (arg: any) => {
      try {
        const payload = JSON.parse(String(arg?.message || "{}"));
        if (payload?.type === GRAPH_EDITOR_TEMPLATES_MSG) {
          const data = (payload?.data || {}) as GraphEditorDialogPayload;
          pendingDialogPayloadResolver?.(data);
          pendingDialogPayloadResolver = null;
          return;
        }
        if (payload?.type === GRAPH_EDITOR_SAVE_RESULT_MSG) {
          const requestId = String(payload?.requestId || "").trim();
          if (!requestId) return;
          const pending = pendingSaveRequests.get(requestId);
          if (!pending) return;
          window.clearTimeout(pending.timer);
          pendingSaveRequests.delete(requestId);
          if (payload?.ok) {
            pending.resolve();
          } else {
            pending.reject(new Error(String(payload?.message || "父窗口保存失败")));
          }
        }
      } catch {
        // ignore malformed parent messages
      }
    });
  } catch {
    // ignore handler registration failures
  }
}

function requestDialogPayload(): Promise<GraphEditorDialogPayload> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (pendingDialogPayloadResolver === resolveWrapped) {
        pendingDialogPayloadResolver = null;
      }
      reject(new Error("父窗口未返回工作簿数据"));
    }, 6000);
    const resolveWrapped = (payload: GraphEditorDialogPayload) => {
      window.clearTimeout(timer);
      resolve(payload);
    };
    pendingDialogPayloadResolver = resolveWrapped;
    try {
      Office.context.ui.messageParent(JSON.stringify({ type: GRAPH_EDITOR_REQUEST_MSG }));
    } catch (error) {
      pendingDialogPayloadResolver = null;
      window.clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function requestParentSave(payload: WorkbookGraphPayload): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = `save_${Date.now()}_${++pendingSaveRequestSeq}`;
    const timer = window.setTimeout(() => {
      pendingSaveRequests.delete(requestId);
      reject(new Error("父窗口保存超时"));
    }, 8000);
    pendingSaveRequests.set(requestId, { resolve, reject, timer });
    try {
      Office.context.ui.messageParent(
        JSON.stringify({
          type: GRAPH_EDITOR_SAVE_REQUEST_MSG,
          requestId,
          payload,
        })
      );
    } catch (error) {
      window.clearTimeout(timer);
      pendingSaveRequests.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function buildQuoteLibraryItems(productNames: string[], mappingRows: GraphProductLibraryEntry[]): QuoteLibraryItem[] {
  const productNameList = (productNames || []).map((item) => String(item || "").trim()).filter(Boolean);
  const mappingByName = new Map(
    mappingRows.map((item) => [String(item.deviceName || "").trim(), item] as const).filter(([key]) => key)
  );

  console.log("[graphEditor] 报价配置表设备名称列表:", productNameList);
  console.log("[graphEditor] 隐藏表产品映射列表:", mappingRows);

  const items = productNameList
    .map((deviceName, index) => {
      const mapped = mappingByName.get(deviceName);
      if (mapped) {
        return {
          key: `${mapped.templateId}:${deviceName}:${index}`,
          deviceName,
          templateId: mapped.templateId,
          thumbnailUrl: mapped.thumbnailUrl,
        } satisfies QuoteLibraryItem;
      }
      const template = resolveTemplateFromProductName(deviceName);
      if (!template) return null;
      return {
        key: `${template.templateId}:${deviceName}:${index}`,
        deviceName,
        templateId: template.templateId,
        thumbnailUrl: resolveTemplateThumbnail(template),
      } satisfies QuoteLibraryItem;
    })
    .filter((item): item is QuoteLibraryItem => !!item);

  console.log("[graphEditor] 产品库抽屉最终列表:", items);

  return items;
}

function App() {
  const { ref, size } = useContainerSize();
  const [scene, setScene] = useState<GraphScene>(cloneDefaultScene);
  const [selected, setSelected] = useState<SelectedTarget>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState("正在初始化图形编辑器...");
  const [ready, setReady] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("bird");
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [quoteLibraryItems, setQuoteLibraryItems] = useState<QuoteLibraryItem[]>([]);
  const [isRefreshingQuoteLibrary, setIsRefreshingQuoteLibrary] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [connectSource, setConnectSource] = useState<SelectedTarget>(null);
  const [hoveredPort, setHoveredPort] = useState<{ productId: string; componentId: string; portId: string } | null>(null);
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
        registerParentMessageHandler();
        try {
          const payload = await requestDialogPayload();
          if (disposed) return;
          const restoredScene = asScene(payload.graph);
          setScene(restoredScene);
          setQuoteLibraryItems(buildQuoteLibraryItems(payload.quoteProductNames, payload.libraryEntries || []));
          setStatus(
            payload.graph
              ? `已从工作簿恢复场景。设备数=${restoredScene.products.length}，组件数=${restoredScene.products.reduce((sum, product) => sum + (product.components?.length || 0), 0)}`
              : "当前工作簿暂无画布数据。"
          );
        } catch (error) {
          if (disposed) return;
          setStatus(`读取工作簿失败：${String((error as Error)?.message || "未知错误")}`);
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
    const closeMenu = () => setContextMenu(null);
    const closeLibrary = () => setDrawerMode(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("click", closeLibrary);
    window.addEventListener("blur", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("click", closeLibrary);
      window.removeEventListener("blur", closeMenu);
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
        await requestParentSave({
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
      fromProductLabel: getProductInstanceLabel(scene, selectedLink.from.productId),
      toProductLabel: getProductInstanceLabel(scene, selectedLink.to.productId),
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

  const previewLinkPipeStyle = useMemo(() => {
    if (!connectSource || connectSource.type !== "port") return false;
    const sourceComponent = findComponent(scene, connectSource.productId, connectSource.componentId)?.component;
    if (sourceComponent?.kind === "pipe") return true;
    if (!hoveredComponent) return false;
    const component = findComponent(scene, hoveredComponent.productId, hoveredComponent.componentId)?.component;
    return component?.kind === "pipe";
  }, [scene, connectSource, hoveredComponent]);

  const updateScene = (next: (current: GraphScene) => GraphScene) =>
    setScene((current) => ({ ...next(current), updatedAt: new Date().toISOString() }));

  const refreshQuoteLibrary = async () => {
    setIsRefreshingQuoteLibrary(true);
    try {
      const payload = await requestDialogPayload();
      const items = buildQuoteLibraryItems(payload.quoteProductNames, payload.libraryEntries || []);
      setQuoteLibraryItems(items);
    } catch (error) {
      setQuoteLibraryItems([]);
      setStatus(`读取产品库失败：${String((error as Error)?.message || "未知错误")}`);
    } finally {
      setIsRefreshingQuoteLibrary(false);
    }
  };

  const onSelectComponent = (productId: string, componentId: string) => {
    setSelected({ type: "component", productId, componentId });
  };

  const onSelectPort = (productId: string, componentId: string, portId: string) => {
    const targetPort: SelectedTarget = { type: "port", productId, componentId, portId };
    if (!connectMode) {
      setSelected(targetPort);
      return;
    }
    if (!connectSource || connectSource.type !== "port") {
      setConnectSource(targetPort);
      setSelected(targetPort);
      setStatus("已选择源端口，请继续点击目标端口。");
      return;
    }
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
      setConnectMode(false);
      setConnectSource(null);
      setPointerWorld(null);
      setSelected(targetPort);
      setStatus("已建立端口连接。");
      return;
    }
    if (
      connectSource?.type === "port" &&
      connectSource.productId === productId &&
      connectSource.componentId === componentId &&
      connectSource.portId === portId
    ) {
      setStatus("请点击另一个目标端口。");
      setSelected(targetPort);
      return;
    }
    setStatus("当前两个端口不允许建立连接。");
    setSelected(targetPort);
  };

  const onDeleteSelected = () => {
    setContextMenu(null);
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
    setConnectMode(false);
    setConnectSource(null);
    setHoveredPort(null);
    setPointerWorld(null);
    setHoveredComponent(null);
  };

  const openDeleteMenu = (evt: any, target: SelectedTarget) => {
    evt.evt.preventDefault();
    evt.cancelBubble = true;
    setSelected(target);
    setContextMenu({
      x: evt.evt.clientX,
      y: evt.evt.clientY,
    });
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
    if (connectMode) {
      setConnectMode(false);
      setConnectSource(null);
      setPointerWorld(null);
      setStatus("已取消连接模式。");
      return;
    }
    setConnectMode(true);
    setConnectSource(null);
    setPointerWorld(null);
    setStatus("已进入连接模式，请先点击源端口。");
  };

  const onAddProduct = (item: QuoteLibraryItem) => {
    const template = PRODUCT_LIBRARY.find((templateItem) => templateItem.templateId === item.templateId) || PRODUCT_LIBRARY[0];
    if (!template) return;
    const nextIndex = scene.products.length + 1;
    const placement = {
      x: 260 + ((nextIndex - 1) % 3) * 280,
      y: 280 + Math.floor((nextIndex - 1) / 3) * 220,
    };
    const product = createProductFromTemplate(template.templateId, placement, nextIndex);
    product.name = item.deviceName;
    updateScene((current) => ({
      ...current,
      products: [...current.products, product],
    }));
    setSelected(null);
    setDrawerMode(null);
    setStatus(`已新增产品实例：${item.deviceName}`);
  };

  const toolLibraryItems = useMemo<QuoteLibraryItem[]>(
    () =>
      PRODUCT_LIBRARY.filter((template) => template.templateId !== "template_silo").map((template) => ({
        key: `tool:${template.templateId}`,
        deviceName: template.name,
        templateId: template.templateId,
        thumbnailUrl: resolveTemplateThumbnail(template),
      })),
    []
  );

  const availableQuoteLibraryItems = useMemo(() => {
    const placedCounts = new Map<string, number>();
    scene.products.forEach((product) => {
      const countKey = `${String(product.templateId || "").trim()}::${String(product.name || "").trim()}`;
      placedCounts.set(countKey, (placedCounts.get(countKey) || 0) + 1);
    });

    return quoteLibraryItems.filter((item) => {
      const countKey = `${item.templateId}::${item.deviceName}`;
      const placed = placedCounts.get(countKey) || 0;
      if (placed <= 0) {
        return true;
      }
      placedCounts.set(countKey, placed - 1);
      return false;
    });
  }, [quoteLibraryItems, scene.products]);

  const currentDrawerItems = drawerMode === "tools" ? toolLibraryItems : availableQuoteLibraryItems;
  const currentDrawerTitle = drawerMode === "tools" ? "工具" : "产品库";
  const currentDrawerMeta =
    drawerMode === "tools" ? "点击或拖拽缩略图可向画布添加辅助器材" : "点击或拖拽缩略图可向画布添加当前报价配置表产品";

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
            </div>
            <div className="view-switches">
              {(["front", "top", "bird"] as ViewMode[]).map((mode) => (
                <button key={mode} type="button" className={`toolbar-btn${viewMode === mode ? " active" : ""}`} onClick={() => setViewMode(mode)}>
                  {mode === "front" ? "正视" : mode === "top" ? "俯视" : "鸟瞰"}
                </button>
              ))}
            </div>
          </header>
          <div
            ref={ref}
            className={`graph-stage-shell${spacePressed || blankPanning ? " pan-ready" : ""}${blankPanning ? " panning" : ""}`}
            onDragOver={(evt) => {
              evt.preventDefault();
              evt.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(evt) => {
              evt.preventDefault();
              const raw =
                evt.dataTransfer.getData("application/quotation-graph-item") ||
                evt.dataTransfer.getData("text/plain") ||
                "";
              let payload = activeDragLibraryPayload;
              try {
                if (raw) {
                  payload = JSON.parse(raw) as DragLibraryPayload;
                }
              } catch {
                payload = activeDragLibraryPayload;
              }
              activeDragLibraryPayload = null;
              if (!payload?.templateId) return;
              const template = PRODUCT_LIBRARY.find((templateItem) => templateItem.templateId === payload.templateId);
              if (!template) return;
              const rect = ref.current?.getBoundingClientRect();
              if (!rect) return;
              const worldX = (evt.clientX - rect.left - viewport.x) / viewport.scale;
              const worldY = (evt.clientY - rect.top - viewport.y) / viewport.scale;
              const nextIndex = scene.products.length + 1;
              const product = createProductFromTemplate(
                template.templateId,
                { x: worldX - 120, y: worldY - 80 },
                nextIndex
              );
              product.name = payload.deviceName || template.name;
              updateScene((current) => ({
                ...current,
                products: [...current.products, product],
              }));
              setSelected(null);
              setDrawerMode(null);
              setStatus(`已拖入产品实例：${product.name}`);
            }}
          >
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
              onContextMenu={(evt) => {
                evt.evt.preventDefault();
                setContextMenu(null);
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
                  <FlowLink
                    key={link.id}
                    scene={scene}
                    link={link}
                    selected={selected?.type === "link" && selected.linkId === link.id}
                    onSelect={() => setSelected({ type: "link", linkId: link.id })}
                    onContextMenu={(evt) => openDeleteMenu(evt, { type: "link", linkId: link.id })}
                  />
                ))}
                <PreviewLink points={previewLinkPoints} pipeStyle={previewLinkPipeStyle} />
              </Layer>
              <Layer>
                {scene.products.map((product) => (
                  <ProductNode
                    key={product.id}
                    scene={scene}
                    product={product}
                    selected={selected}
                    hoveredComponentId={hoveredComponent?.productId === product.id ? hoveredComponent.componentId : ""}
                    hoveredPort={hoveredPort}
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
                    onHoverPortChange={setHoveredPort}
                    onContextMenu={(evt, productId, componentId) => openDeleteMenu(evt, { type: "component", productId, componentId })}
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
                   {getProductInstanceLabel(scene, selectedPort.product.id)} / {selectedPort.component.name}
                 </div>
                  <dl className="inspector-grid">
                    <dt>端口ID</dt>
                    <dd>{selectedPort.port.id}</dd>
                    <dt>方向</dt>
                    <dd>{selectedPort.port.direction || "both"}</dd>
                    <dt>组件</dt>
                    <dd>{selectedPort.component.name}</dd>
                    <dt>作为起点</dt>
                    <dd>{selectedPort.usage.asSource}</dd>
                    <dt>作为终点</dt>
                    <dd>{selectedPort.usage.asTarget}</dd>
                    <dt>占用状态</dt>
                    <dd>{getPortOccupiedText(selectedPort.usage, selectedPort.port.direction)}</dd>
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
                            return `${getProductInstanceLabel(scene, endpoint.productId)} / ${getPortDisplayName(scene, endpoint)}`;
                          })
                          .join("；")
                      : "无"}
                  </p>
              </>
            ) : selectedComponent ? (
                <>
                 <div className="inspector-title">{selectedComponent.component.name}</div>
                 <div className="inspector-subtitle">{getProductInstanceLabel(scene, selectedComponent.product.id)}</div>
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
                    <dt>连接ID</dt>
                    <dd>{selectedLinkInfo.link.id}</dd>
                    <dt>状态</dt>
                   <dd>{selectedLinkInfo.link.flow === "flowing" ? "流动中" : "静止"}</dd>
                    <dt>起点设备</dt>
                   <dd>{selectedLinkInfo.fromProductLabel}</dd>
                    <dt>起点</dt>
                   <dd>{selectedLinkInfo.fromLabel}</dd>
                    <dt>终点设备</dt>
                   <dd>{selectedLinkInfo.toProductLabel}</dd>
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
            {connectMode ? (
              <p className="status-pill">
                {connectSource?.type === "port" ? "连接模式：已选择源端口" : "连接模式：等待选择源端口"}
              </p>
            ) : null}
          </section>
        </aside>
      </main>

      <section className="graph-bottom-dock">
        <section className={`graph-template-drawer${drawerMode ? " open" : ""}`} onClick={(evt) => evt.stopPropagation()}>
          <div className="graph-drawer-head">
            <h3 className="graph-drawer-title">{currentDrawerTitle}</h3>
            <span className="graph-drawer-meta">
              {drawerMode === "products" && isRefreshingQuoteLibrary ? "正在刷新产品库..." : currentDrawerMeta}
            </span>
          </div>
          <div className="graph-template-list">
            {currentDrawerItems.length > 0 ? (
              currentDrawerItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="template-item"
                  onClick={() => onAddProduct(item)}
                  title={item.deviceName}
                  draggable
                  onDragStart={(evt) => {
                    const payload: DragLibraryPayload = {
                      source: drawerMode === "tools" ? "tools" : "products",
                      templateId: item.templateId,
                      deviceName: item.deviceName,
                    };
                    activeDragLibraryPayload = payload;
                    const serialized = JSON.stringify(payload);
                    evt.dataTransfer.setData("application/quotation-graph-item", serialized);
                    evt.dataTransfer.setData("text/plain", serialized);
                    evt.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={() => {
                    activeDragLibraryPayload = null;
                  }}
                >
                  <div className="template-thumb">
                    {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt={item.deviceName} /> : null}
                  </div>
                  <div className="template-name">{item.deviceName}</div>
                </button>
              ))
            ) : (
              <div className="template-meta">
                {drawerMode === "tools" ? "暂无可用工具模板。" : "暂无产品。请先在报价配置表录入产品后再打开产品库。"}
              </div>
            )}
          </div>
        </section>
        <footer className="graph-toolbar">
          <div className="graph-toolbar-row">
            <button
              type="button"
              className={`toolbar-btn${drawerMode === "products" ? " active" : ""}`}
              onClick={(evt) => {
                evt.stopPropagation();
                const nextOpen = drawerMode !== "products";
                if (nextOpen) {
                  setDrawerMode("products");
                  void refreshQuoteLibrary();
                  return;
                }
                setDrawerMode(null);
              }}
            >
              产品库
            </button>
            <button
              type="button"
              className={`toolbar-btn${drawerMode === "tools" ? " active" : ""}`}
              onClick={(evt) => {
                evt.stopPropagation();
                setDrawerMode((current) => (current === "tools" ? null : "tools"));
              }}
            >
              工具
            </button>
            <button
              type="button"
              className={`toolbar-btn${connectMode ? " primary active" : ""}`}
              onClick={onBeginConnect}
            >
              {connectMode ? "取消" : "建立连接"}
            </button>
            <button type="button" className="toolbar-btn" onClick={onToggleFlow}>切换流动</button>
            <button type="button" className="toolbar-btn danger" onClick={onDeleteSelected}>删除选中</button>
            <button
              type="button"
              className="toolbar-btn primary"
              onClick={async () => {
                await requestParentSave({
                  schemaVersion: "2.0",
                  updatedAt: scene.updatedAt,
                  graph: { nodes: scene.products, edges: scene.links, updatedAt: scene.updatedAt },
                  images: {},
                });
                setStatus("手动保存成功。");
              }}
            >
              保存
            </button>
          </div>
        </footer>
      </section>
      {contextMenu ? (
        <div
          className="graph-context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(evt) => evt.stopPropagation()}
        >
          <button type="button" className="graph-context-menu__item danger" onClick={onDeleteSelected}>
            删除
          </button>
        </div>
      ) : null}
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
