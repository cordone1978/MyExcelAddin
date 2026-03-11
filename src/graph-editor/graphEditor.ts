/* global Office, Excel, document, window */

import { API_PATHS, APP_URLS } from "../shared/appConstants";
import { BUILDSHEET_TEXT } from "../shared/businessTextConstants";
import { SHEET_NAMES } from "../shared/sheetNames";
import { loadGraphFromWorkbook, saveGraphToWorkbook } from "./workbookStore";

type Hotspot = {
  name: string;
  x: number;
  y: number;
};

type StrokePoint = {
  x: number;
  y: number;
};

type GraphStroke = {
  id: string;
  points: StrokePoint[];
  color: string;
  width: number;
};

type GraphNode = {
  id: string;
  nodeType: "module" | "productHotspot";
  label: string;
  systemName: string;
  componentDesc: string;
  componentType: string;
  componentMaterial: string;
  componentBrand: string;
  componentUnit: string;
  componentQuantity: number;
  componentUnitPrice: number;
  productModel: string;
  imageUrl: string;
  imageKey?: string;
  templateFingerprint?: string;
  hotspots: Hotspot[];
  x: number;
  y: number;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
};

type GraphState = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  strokes: GraphStroke[];
  updatedAt: string;
};

type TemplateItem = {
  id: string;
  productModel: string;
  imageUrl: string;
  hotspots: Hotspot[];
};

type GraphStoreCacheEntry = {
  savedAt?: string;
  project?: string;
  compositeImage?: string;
};

const STORAGE_KEY = "quotation_addin_graph_editor_state_v1";
const DEV_GRAPH_STORE_SHEET = "_graph_store_dev";
const DEV_GRAPH_STORE_CACHE_KEY = "quotation_addin_graph_store_dev_cache_v1";
const DEV_GRAPH_STORE_SHEET_MARK = "GRAPH_DIALOG_DEV_LIST_V2";
const GRAPH_EDITOR_TEMPLATES_MSG = "graph_editor_templates";
const GRAPH_EDITOR_REQUEST_MSG = "graph_editor_request_templates";
const GRAPH_EDITOR_SAVE_REQUEST_MSG = "graph_editor_save_request";
const GRAPH_EDITOR_SAVE_RESULT_MSG = "graph_editor_save_result";
const TITLE_PREFIX_REGEX = /^([一二三四五六七八九十百零\d]+)[、.\s]*/;
const NODE_WIDTH = 180;
const NODE_HEIGHT = 88;
const PRODUCT_NODE_WIDTH = 120;
const PRODUCT_NODE_HEIGHT = 120;
const IMAGE_BASE = APP_URLS.imageBase;
const IMAGE_CACHE_BUSTER = Date.now().toString(36);

const state: GraphState = {
  nodes: [],
  edges: [],
  strokes: [],
  updatedAt: "",
};
const imageAssetStore = new Map<string, string>();

let selectedNodeId = "";
let selectedEdgeId = "";
let selectedStrokeId = "";
let selectedNodeIds = new Set<string>();
let selectedEdgeIds = new Set<string>();
let selectedStrokeIds = new Set<string>();
let connectMode = false;
let saveTimer = 0;
let isPenDrawing = false;
let penSourceNodeId = "";
let penPreviewX = 0;
let penPreviewY = 0;
let drawMode = false;
let isStrokeDrawing = false;
let activeStrokeId = "";

let dragNodeId = "";
let dragOffsetX = 0;
let dragOffsetY = 0;
let isPanning = false;
let isBoxSelecting = false;
let suppressCanvasClearClick = false;
let boxStartClientX = 0;
let boxStartClientY = 0;
let boxCurrentClientX = 0;
let boxCurrentClientY = 0;
let panStartClientX = 0;
let panStartClientY = 0;
let panOriginX = 0;
let panOriginY = 0;
let viewScale = 1;
let viewPanX = 0;
let viewPanY = 0;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.2;

let templateLibrary: TemplateItem[] = [];
let parentCachedTemplate: TemplateItem[] = [];
const consumedTemplateImageKeys = new Set<string>();
const templateImageInfoCache = new Map<string, { width: number; height: number; kb: number | null }>();
let productCatalogCache: Array<{ id: number; name: string }> | null = null;
let saveRequestSeq = 0;
const pendingSaveRequests = new Map<
  string,
  {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: number;
  }
>();

const systemOptions = BUILDSHEET_TEXT.configSections.map((s) => s.replace(TITLE_PREFIX_REGEX, "").trim());

Office.onReady(() => {
  void initializeGraphEditor();
});

async function initializeGraphEditor() {
  bindEvents();
  registerParentMessageHandler();
  ensureSystemOptions();
  await restoreState();
  syncConsumedTemplatesFromState();
  applyViewportTransform();
  renderAll();
  requestTemplatesFromParent();
}

function bindEvents() {
  getButton("loadTemplateLibraryBtn").addEventListener("click", () => {
    const nextOpen = !isTemplateDrawerOpen();
    if (nextOpen) {
      setToolsDrawerOpen(false);
      setTemplateDrawerOpen(true);
      void loadTemplateLibraryFromQuoteSheet();
      return;
    }
    setTemplateDrawerOpen(false);
  });
  getButton("toolsBtn").addEventListener("click", () => {
    const nextOpen = !isToolsDrawerOpen();
    if (nextOpen) {
      setTemplateDrawerOpen(false);
      setToolsDrawerOpen(true);
      return;
    }
    setToolsDrawerOpen(false);
  });
  getButton("penConnectBtn").addEventListener("click", toggleConnectMode);
  getButton("drawStrokeBtn").addEventListener("click", toggleDrawMode);
  getButton("undoStrokeBtn").addEventListener("click", undoLastStroke);
  getContextDeleteButton().addEventListener("click", () => {
    hideContextMenu();
    deleteSelected();
  });
  getButton("deleteSelectedBtn").addEventListener("click", deleteSelected);
  getButton("clearAllBtn").addEventListener("click", clearAll);
  getButton("saveBtn").addEventListener("click", () => {
    void saveStateToWorkbook();
  });

  const canvas = getCanvas();
  canvas.addEventListener("pointerdown", onCanvasPointerDown);
  canvas.addEventListener("wheel", onCanvasWheel, { passive: false });
  canvas.addEventListener("contextmenu", onCanvasContextMenu);
  canvas.addEventListener("dragover", (evt) => {
    evt.preventDefault();
  });
  canvas.addEventListener("drop", (evt) => {
    evt.preventDefault();
    const templateId = evt.dataTransfer ? evt.dataTransfer.getData("text/plain") : "";
    if (!templateId) return;
    const template = templateLibrary.find((t) => t.id === templateId);
    if (!template) return;
    const world = toWorldPoint(evt.clientX, evt.clientY);
    const x = world.x - PRODUCT_NODE_WIDTH / 2;
    const y = world.y - PRODUCT_NODE_HEIGHT / 2;
    addProductNodeFromTemplate(template, x, y);
    consumeTemplateByImage(template);
  });

  canvas.addEventListener("click", (evt) => {
    if (suppressCanvasClearClick) {
      suppressCanvasClearClick = false;
      return;
    }
    if (evt.target === canvas || evt.target === getNodeLayer() || evt.target === getEdgeLayer()) {
      selectedNodeId = "";
      selectedEdgeId = "";
      selectedStrokeId = "";
      selectedNodeIds.clear();
      selectedEdgeIds.clear();
      selectedStrokeIds.clear();
      renderAll();
    }
  });

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onGlobalKeyDown);
}

function onGlobalKeyDown(evt: KeyboardEvent) {
  const key = String(evt.key || "").toLowerCase();
  if (key === "escape") {
    hideContextMenu();
    return;
  }
  if (key !== "delete" && key !== "backspace") return;

  const target = evt.target as HTMLElement | null;
  const tagName = String(target?.tagName || "").toUpperCase();
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return;
  }

  if (
    selectedEdgeId ||
    selectedNodeId ||
    selectedStrokeId ||
    selectedNodeIds.size > 0 ||
    selectedEdgeIds.size > 0 ||
    selectedStrokeIds.size > 0
  ) {
    evt.preventDefault();
    deleteSelected();
  }
}

function onDocumentPointerDown(evt: PointerEvent) {
  const menu = getContextMenu();
  if (!menu.classList.contains("open")) return;
  const target = evt.target as Element | null;
  if (target && (target === menu || menu.contains(target))) {
    return;
  }
  hideContextMenu();
}

async function loadTemplateLibraryFromQuoteSheet() {
  try {
    setStatus("正在加载模板库...", "");

    if (parentCachedTemplate.length > 0) {
      templateLibrary = dedupeTemplateLibraryByImage(parentCachedTemplate);
      renderTemplateLibrary();
      setStatus(`已从父窗口缓存加载模板 ${templateLibrary.length} 个。`, "success");
      return;
    }

    const cachedTemplates = loadTemplateLibraryFromLocalCache();
    if (cachedTemplates.length > 0) {
      templateLibrary = dedupeTemplateLibraryByImage(cachedTemplates);
      renderTemplateLibrary();
      setStatus(`已从本地缓存加载模板 ${templateLibrary.length} 个。`, "success");
      return;
    }

    const devTemplates = await safeLoadTemplateLibraryFromDevSheet();
    if (devTemplates.length > 0) {
      templateLibrary = dedupeTemplateLibraryByImage(devTemplates);
      renderTemplateLibrary();
      setStatus(`已从开发存储sheet加载模板 ${templateLibrary.length} 个。`, "success");
      return;
    }

    const models = await safeReadProductModelCandidates();
    if (models.length === 0) {
      templateLibrary = [];
      renderTemplateLibrary();
      setStatus("模板库为空，请先添加设备后再加载模板库。", "");
      return;
    }

    const items: TemplateItem[] = [];
    let unresolvedCount = 0;
    for (const model of models) {
      try {
        const product = await resolveProductByName(model);
        const productId = Number(product && product.product_id ? product.product_id : 0);
        if (!productId) {
          unresolvedCount += 1;
          continue;
        }

        const annotations = await apiGet<
          Array<{ name?: string; image_url?: string; position_x?: number | string; position_y?: number | string }>
        >(`${API_PATHS.annotations}/${productId}`);

        const originalImageUrl = normalizeImageUrl(
          String(annotations && annotations[0] && annotations[0].image_url ? annotations[0].image_url : "")
        );
        let imageUrl = originalImageUrl;
        if (!imageUrl) {
          const configRows = await apiGet<Array<{ component_pic?: string }>>(`${API_PATHS.config}/${productId}`);
          const rowWithPic = (configRows || []).find((r) => String(r && r.component_pic ? r.component_pic : "").trim() !== "");
          imageUrl = getImageUrl(rowWithPic && rowWithPic.component_pic ? rowWithPic.component_pic : "");
        }
        // 优先使用原图（通常更清晰）；仅当原图不可读取时回退到临时图。
        let stableImageUrl = await ensureStableTemplateImageUrl(imageUrl);
        if (!stableImageUrl) {
          const tempUrl = await requestTempImageUrl(String(product && product.product_model ? product.product_model : model), imageUrl);
          stableImageUrl = await ensureStableTemplateImageUrl(tempUrl);
        }
        imageUrl = stableImageUrl || imageUrl;
        const hotspots = (annotations || []).slice(0, 24).map((a, idx) => ({
          name: String(a && a.name ? a.name : `热点${idx + 1}`),
          x: clampPercent(parseNumber(a ? a.position_x : 0), (idx % 6) * 16 + 10),
          y: clampPercent(parseNumber(a ? a.position_y : 0), Math.floor(idx / 6) * 20 + 14),
        }));

        items.push({
          id: `tpl_${productId}_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
          productModel: String(product && product.product_model ? product.product_model : model),
          imageUrl,
          hotspots,
        });
      } catch {
        // 单个模板加载失败时跳过
        unresolvedCount += 1;
      }
    }

    templateLibrary = dedupeTemplateLibraryByImage(items);
    renderTemplateLibrary();
    if (templateLibrary.length === 0) {
      setStatus(`未匹配到产品模板。候选名称 ${models.length} 个，未匹配 ${unresolvedCount} 个。`, "error");
      return;
    }
    setStatus(`模板库加载完成，共 ${templateLibrary.length} 个产品（未匹配 ${unresolvedCount} 个）。`, "success");
  } catch (error) {
    const message = String((error as Error)?.message || "");
    if (message.includes("无法执行请求的操作")) {
      templateLibrary = [];
      renderTemplateLibrary();
      setStatus("模板库暂不可用，已显示空模板库。", "error");
      return;
    }
    setStatus(message || "模板库加载失败。", "error");
  }
}

async function safeLoadTemplateLibraryFromDevSheet(): Promise<TemplateItem[]> {
  try {
    return await loadTemplateLibraryFromDevSheet();
  } catch {
    // 某些宿主在工作簿结构变化后短时间内会抛“无法执行请求的操作”，忽略并走后续来源。
    return [];
  }
}

async function safeReadProductModelCandidates(): Promise<string[]> {
  try {
    return await readProductModelCandidates();
  } catch {
    await delay(180);
    try {
      return await readProductModelCandidates();
    } catch {
      return [];
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function ensureStableTemplateImageUrl(imageUrl: string): Promise<string> {
  const src = String(imageUrl || "").trim();
  if (!src) return "";
  if (src.startsWith("data:")) return src;
  const dataUrl = await tryFetchImageAsDataUrl(src);
  return dataUrl || src;
}

function registerParentMessageHandler() {
  try {
    Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, (arg: any) => {
      try {
        const payload = JSON.parse(String(arg?.message || "{}"));
        if (payload?.type === GRAPH_EDITOR_TEMPLATES_MSG) {
          const data = payload?.data;
          if (Array.isArray(data?.templates)) {
            parentCachedTemplate = (data.templates as GraphStoreCacheEntry[])
              .map((x, idx) => {
                const imageUrl = String(x?.compositeImage || "").trim();
                if (!imageUrl) return null;
                const project = String(x?.project || "").trim() || "缓存模板";
                const savedAt = String(x?.savedAt || Date.now());
                return {
                  id: `tpl_parent_${savedAt}_${idx}`,
                  productModel: project,
                  imageUrl,
                  hotspots: [],
                } as TemplateItem;
              })
              .filter((x): x is TemplateItem => !!x);
            if (parentCachedTemplate.length > 0) {
              setStatus(`已接收父窗口模板数据（${parentCachedTemplate.length} 个）。`, "success");
            }
            return;
          }
          const imageUrl = String(data?.compositeImage || "").trim();
          if (!imageUrl) return;
          const project = String(data?.project || "").trim() || "缓存模板";
          parentCachedTemplate = [
            {
              id: `tpl_parent_${Date.now()}`,
              productModel: project,
              imageUrl,
              hotspots: [],
            },
          ];
          setStatus(`已接收父窗口模板数据（长度 ${imageUrl.length}）。`, "success");
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
        // ignore parent payload parse errors
      }
    });
  } catch {
    // ignore handler registration failures
  }
}

function requestTemplatesFromParent() {
  try {
    Office.context.ui.messageParent(JSON.stringify({ type: GRAPH_EDITOR_REQUEST_MSG }));
  } catch {
    // ignore if parent channel unavailable
  }
}

function loadTemplateLibraryFromLocalCache(): TemplateItem[] {
  try {
    const raw = window.localStorage.getItem(DEV_GRAPH_STORE_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { templates?: GraphStoreCacheEntry[]; project?: string; compositeImage?: string; savedAt?: string };
    if (Array.isArray(parsed?.templates)) {
      return parsed.templates
        .map((x, idx) => {
          const imageUrl = String(x?.compositeImage || "").trim();
          if (!imageUrl) return null;
          const project = String(x?.project || "").trim() || "缓存模板";
          const suffix = String(x?.savedAt || `${Date.now()}_${idx}`);
          return {
            id: `tpl_cache_${suffix}_${idx}`,
            productModel: project,
            imageUrl,
            hotspots: [],
          } as TemplateItem;
        })
        .filter((x): x is TemplateItem => !!x);
    }
    const imageUrl = String(parsed?.compositeImage || "").trim();
    if (!imageUrl) return [];
    const project = String(parsed?.project || "").trim() || "缓存模板";
    const suffix = String(parsed?.savedAt || Date.now());
    return [
      {
        id: `tpl_cache_${suffix}`,
        productModel: project,
        imageUrl,
        hotspots: [],
      },
    ];
  } catch {
    return [];
  }
}

async function loadTemplateLibraryFromDevSheet(): Promise<TemplateItem[]> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItemOrNullObject(DEV_GRAPH_STORE_SHEET);
    sheet.load("name,isNullObject");
    await context.sync();
    if (sheet.isNullObject) {
      return [];
    }

    const header = sheet.getRange("A1:A4");
    header.load("values");
    await context.sync();

    const mark = String(header.values?.[0]?.[0] || "").trim();
    if (mark === DEV_GRAPH_STORE_SHEET_MARK) {
      const metaRange = sheet.getRange("A1:F20000");
      metaRange.load("values");
      await context.sync();
      const values = metaRange.values || [];
      const nextRowRaw = Number(values?.[0]?.[1] || 10);
      const stopRow = Number.isFinite(nextRowRaw) && nextRowRaw > 10 ? Math.min(20000, Math.floor(nextRowRaw)) : 20000;
      const items: TemplateItem[] = [];
      let row = 10;
      while (row < stopRow) {
        const markCell = String(values?.[row - 1]?.[0] || "").trim();
        if (markCell !== "ENTRY") {
          row += 1;
          continue;
        }
        const savedAt = String(values?.[row - 1]?.[1] || "");
        const projectName = String(values?.[row - 1]?.[2] || "").trim() || "未命名模板";
        const chunkCount = Math.max(0, Number(values?.[row - 1]?.[4] || 0));
        const chunks: string[] = [];
        for (let i = 0; i < chunkCount && row + i <= 20000; i += 1) {
          chunks.push(String(values?.[row + i + 1]?.[5] || ""));
        }
        const imageBase64 = chunks.join("");
        if (imageBase64) {
          items.push({
            id: `tpl_dev_${savedAt || Date.now()}_${row}`,
            productModel: projectName,
            imageUrl: imageBase64,
            hotspots: [],
          });
        }
        row = row + 1 + chunkCount + 1;
      }
      if (items.length > 0) {
        setStatus(`已从开发存储sheet读取模板 ${items.length} 个。`, "success");
      }
      return items;
    }

    if (mark !== "GRAPH_DIALOG_DEV_V1") {
      return [];
    }

    const chunkCount = Math.max(0, Number(String(header.values?.[2]?.[0] || "0")));
    const projectName = String(header.values?.[3]?.[0] || "").trim() || "未命名模板";
    // 优先按A3分块数读取；若A3异常，则回退读取A10:A2000首段非空数据。
    const readEndRow = chunkCount > 0 ? 10 + chunkCount - 1 : 2000;
    const imageRange = sheet.getRange(`A10:A${readEndRow}`);
    imageRange.load("values");
    await context.sync();

    const rows = imageRange.values || [];
    let chunks = rows.map((row) => String(row?.[0] || ""));
    if (chunkCount <= 0) {
      const compact: string[] = [];
      for (const chunk of chunks) {
        if (!chunk) {
          if (compact.length > 0) break;
          continue;
        }
        compact.push(chunk);
      }
      chunks = compact;
    }
    const imageBase64 = chunks.join("");
    if (!imageBase64) {
      setStatus("开发存储sheet存在，但未读到合成图数据。", "error");
      return [];
    }
    setStatus(`已读取开发存储sheet图片数据（长度 ${imageBase64.length}）。`, "success");

    return [{
      id: `tpl_dev_${Date.now()}`,
      productModel: projectName,
      imageUrl: imageBase64,
      hotspots: [],
    }];
  });
}

async function readProductModelCandidates() {
  return Excel.run(async (context) => {
    const workbookSheets = context.workbook.worksheets;
    workbookSheets.load("items/name");
    await context.sync();

    const quoteSheetName = workbookSheets.items
      .map((s) => String(s.name || "").trim())
      .find((name) => name === SHEET_NAMES.quoteConfig || name === "配置报价表" || name.includes("报价配置"));
    if (!quoteSheetName) {
      return [];
    }

    const configSheet = context.workbook.worksheets.getItem(quoteSheetName);
    const configUsed = configSheet.getRange("A:C").getUsedRangeOrNullObject(false);
    configUsed.load(["values", "isNullObject"]);
    await context.sync();

    const models = new Set<string>();
    const headerSerial = String(BUILDSHEET_TEXT.configHeaders[0] || "").trim();

    if (!configUsed.isNullObject) {
      const values = configUsed.values || [];
      let currentDevice = "";
      values.forEach((row) => {
        const colA = String(row && row[0] ? row[0] : "").trim();
        const colB = String(row && row[1] ? row[1] : "").trim();
        const colC = String(row && row[2] ? row[2] : "").trim();
        if (/^[一二三四五六七八九十百零]+$/.test(colA)) return;
        if (colA === headerSerial) return;
        if (colB) {
          currentDevice = colB;
        }
        if (colC && currentDevice) {
          models.add(currentDevice);
        }
      });
    }

    return Array.from(models);
  });
}

async function resolveProductByName(name: string): Promise<{ product_id?: number; product_model?: string }> {
  const candidate = String(name || "").trim();
  if (!candidate) return {};

  try {
    return await apiGet<{ product_id?: number; product_model?: string }>(
      `${API_PATHS.projectByModel}/${encodeURIComponent(candidate)}`
    );
  } catch {
    // ignore exact miss
  }

  const catalog = await getProductCatalog();
  const normalizedCandidate = normalizeMatchText(candidate);
  const exact = catalog.find((item) => normalizeMatchText(item.name) === normalizedCandidate);
  if (exact) {
    return { product_id: exact.id, product_model: exact.name };
  }
  const fuzzy = catalog.find((item) => {
    const normalized = normalizeMatchText(item.name);
    return normalized.includes(normalizedCandidate) || normalizedCandidate.includes(normalized);
  });
  if (fuzzy) {
    return { product_id: fuzzy.id, product_model: fuzzy.name };
  }
  return {};
}

async function getProductCatalog() {
  if (productCatalogCache) {
    return productCatalogCache;
  }
  const categories = await apiGet<Array<{ id: number; name: string }>>(API_PATHS.categories);
  const all: Array<{ id: number; name: string }> = [];
  for (const category of categories || []) {
    try {
      const products = await apiGet<Array<{ id: number; name: string }>>(`${API_PATHS.projects}/${category.id}`);
      (products || []).forEach((p) => {
        const id = Number(p && p.id ? p.id : 0);
        const name = String(p && p.name ? p.name : "").trim();
        if (id && name) {
          all.push({ id, name });
        }
      });
    } catch {
      // ignore category fetch failure
    }
  }
  productCatalogCache = all;
  return all;
}

function normalizeMatchText(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[、，,（）().\s\-_/]/g, "");
}

function renderTemplateLibrary() {
  const listEl = document.getElementById("templateList") as HTMLDivElement;
  if (!listEl) return;
  listEl.innerHTML = "";

  if (templateLibrary.length === 0) {
    const empty = document.createElement("div");
    empty.className = "template-meta";
    empty.textContent = "暂无模板。请先在报价配置表录入产品，然后点击“模板库”。";
    listEl.appendChild(empty);
    return;
  }

  templateLibrary.forEach((item) => {
    const card = document.createElement("div");
    card.className = "template-item";
    card.title = String(item.productModel || "").trim() || "未命名模板";
    card.draggable = true;
    card.innerHTML = `
      <div class="template-thumb">
        ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.productModel)}" />` : ""}
        ${renderHotspotsHtml(item.hotspots, "small")}
      </div>
      <div class="template-name">${escapeHtml(String(item.productModel || "").trim() || "未命名模板")}</div>
    `;

    card.addEventListener("dragstart", (evt) => {
      card.classList.add("dragging");
      if (evt.dataTransfer) {
        evt.dataTransfer.setData("text/plain", item.id);
        evt.dataTransfer.setDragImage(card, 60, 30);
      }
    });
    card.addEventListener("click", () => {
      void showTemplateImageInfo(item);
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });
    card.addEventListener("dblclick", () => {
      addProductNodeFromTemplate(item, 40, 40);
      consumeTemplateByImage(item);
    });

    listEl.appendChild(card);
  });
}

function dedupeTemplateLibraryByImage(items: TemplateItem[]): TemplateItem[] {
  const used = new Set<string>();
  const unique: TemplateItem[] = [];
  for (const item of items || []) {
    const key = getTemplateImageFingerprint(item.imageUrl, item.productModel);
    if (!key || consumedTemplateImageKeys.has(key) || used.has(key)) {
      continue;
    }
    used.add(key);
    unique.push(item);
  }
  return unique;
}

function syncConsumedTemplatesFromState() {
  consumedTemplateImageKeys.clear();
  state.nodes.forEach((node) => {
    if (!node || node.nodeType !== "productHotspot") return;
    const key = String(node.templateFingerprint || getTemplateImageFingerprint(node.imageUrl, node.productModel || node.label)).trim();
    if (!key) return;
    consumedTemplateImageKeys.add(key);
  });
}

function consumeTemplateByImage(item: TemplateItem) {
  const key = getTemplateImageFingerprint(item.imageUrl, item.productModel);
  if (!key) return;
  consumedTemplateImageKeys.add(key);
  templateLibrary = templateLibrary.filter((tpl) => getTemplateImageFingerprint(tpl.imageUrl, tpl.productModel) !== key);
  renderTemplateLibrary();
}

function restoreTemplateByDeletedNodes(removedNodes: GraphNode[]) {
  if (!Array.isArray(removedNodes) || removedNodes.length === 0) {
    return;
  }
  let changed = false;
  for (const node of removedNodes) {
    if (!node || node.nodeType !== "productHotspot") continue;
    const key = String(node.templateFingerprint || getTemplateImageFingerprint(node.imageUrl, node.productModel || node.label)).trim();
    if (!key) continue;

    const stillExists = state.nodes.some((n) => {
      if (!n || n.nodeType !== "productHotspot") return false;
      const existingKey = String(n.templateFingerprint || getTemplateImageFingerprint(n.imageUrl, n.productModel || n.label)).trim();
      return existingKey === key;
    });
    if (stillExists) continue;

    consumedTemplateImageKeys.delete(key);
    const alreadyInLibrary = templateLibrary.some((tpl) => getTemplateImageFingerprint(tpl.imageUrl, tpl.productModel) === key);
    if (alreadyInLibrary) continue;

    const recoveredImage = getNodeTemplateImage(node);
    if (!recoveredImage) continue;
    templateLibrary.push({
      id: `tpl_recover_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      productModel: String(node.productModel || node.label || "未命名模板"),
      imageUrl: recoveredImage,
      hotspots: Array.isArray(node.hotspots) ? node.hotspots : [],
    });
    changed = true;
  }
  if (changed) {
    templateLibrary = dedupeTemplateLibraryByImage(templateLibrary);
    renderTemplateLibrary();
  }
}

function getNodeTemplateImage(node: GraphNode): string {
  if (node?.imageKey && imageAssetStore.has(node.imageKey)) {
    const fromCache = String(imageAssetStore.get(node.imageKey) || "").trim();
    if (fromCache) return fromCache;
  }
  return String(node?.imageUrl || "").trim();
}

function getTemplateImageFingerprint(imageUrl: string, productModel: string): string {
  const image = String(imageUrl || "").trim();
  if (image.startsWith("data:")) {
    return `data:${image.length}:${image.slice(0, 64)}:${image.slice(-64)}`;
  }
  if (image) {
    try {
      const u = new URL(image, window.location.origin);
      return `url:${u.origin}${u.pathname}`;
    } catch {
      const withoutQuery = image.split("?")[0].split("#")[0];
      return `url:${withoutQuery}`;
    }
  }
  return `model:${String(productModel || "").trim().toLowerCase()}`;
}

function ensureSystemOptions() {
  const select = getField("fieldSystem") as HTMLSelectElement;
  if (select.options.length > 0) return;
  const options = [...systemOptions];
  if (!options.includes("未分类")) {
    options.push("未分类");
  }
  options.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
}

function addProductNodeFromTemplate(item: TemplateItem, x: number, y: number) {
  const templateFingerprint = getTemplateImageFingerprint(item.imageUrl, item.productModel);
  const imageKey = buildImageKey(item.productModel, item.imageUrl);
  const node: GraphNode = {
    id: `node_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    nodeType: "productHotspot",
    label: item.productModel,
    systemName: "未分类",
    componentDesc: `热点图模块: ${item.productModel}`,
    componentType: "",
    componentMaterial: "",
    componentBrand: "",
    componentUnit: "套",
    componentQuantity: 1,
    componentUnitPrice: 0,
    productModel: item.productModel,
    imageUrl: item.imageUrl,
    imageKey,
    templateFingerprint,
    hotspots: item.hotspots,
    x,
    y,
  };
  if (imageKey && item.imageUrl) {
    void cacheImageData(imageKey, item.imageUrl);
  }
  state.nodes.push(node);
  selectedNodeId = node.id;
  selectedEdgeId = "";
  selectedNodeIds.clear();
  selectedEdgeIds.clear();
  selectedStrokeIds.clear();
  applyNodeToForm(node);
  renderAll();
  scheduleSave();
  void stabilizeNodeImage(node.id);
  void attachTempImageForNode(node.id, item.productModel, item.imageUrl);
}

async function attachTempImageForNode(nodeId: string, productModel: string, sourceImageUrl: string) {
  if (!sourceImageUrl) return;
  const raw = String(sourceImageUrl || "").trim();
  if (raw.startsWith("data:") || raw.startsWith("blob:")) {
    return;
  }
  try {
    const tempUrl = await requestTempImageUrl(productModel, sourceImageUrl);
    if (!tempUrl) return;
    const node = findNode(nodeId);
    if (!node) return;
    node.imageUrl = normalizeImageUrl(tempUrl);
    node.imageKey = buildImageKey(productModel, node.imageUrl);
    if (node.imageKey) {
      void cacheImageData(node.imageKey, node.imageUrl);
    }
    void stabilizeNodeImage(nodeId);
    renderAll();
    scheduleSave();
  } catch {
    // ignore temp image generation failure and keep original image url
  }
}

async function stabilizeNodeImage(nodeId: string) {
  const node = findNode(nodeId);
  if (!node || node.nodeType !== "productHotspot") return;
  const src = String(node.imageUrl || "");
  if (!src || src.startsWith("data:")) return;
  const dataUrl = await tryFetchImageAsDataUrl(src);
  if (!dataUrl) return;
  node.imageUrl = dataUrl;
  if (!node.imageKey) {
    node.imageKey = buildImageKey(node.productModel || node.label, dataUrl);
  }
  if (node.imageKey) {
    imageAssetStore.set(node.imageKey, dataUrl);
  }
  renderAll();
}

async function requestTempImageUrl(productModel: string, sourceImageUrl: string) {
  if (!sourceImageUrl) return "";
  const raw = String(sourceImageUrl || "").trim();
  if (raw.startsWith("data:") || raw.startsWith("blob:")) {
    return raw;
  }
  try {
    const data = await apiPost<{ imageUrl?: string }>(API_PATHS.graphTemplateImage, {
      productModel,
      sourceImageUrl,
    });
    return normalizeImageUrl(String(data && data.imageUrl ? data.imageUrl : "").trim());
  } catch {
    return normalizeImageUrl(sourceImageUrl);
  }
}

function toggleConnectMode() {
  connectMode = !connectMode;
  if (connectMode) {
    drawMode = false;
  }
  isPenDrawing = false;
  penSourceNodeId = "";
  getButton("penConnectBtn").textContent = `节点连线笔：${connectMode ? "开" : "关"}`;
  getButton("penConnectBtn").classList.toggle("active", connectMode);
  getButton("drawStrokeBtn").textContent = `自由画线：${drawMode ? "开" : "关"}`;
  getButton("drawStrokeBtn").classList.toggle("active", drawMode);
  setStatus(connectMode ? "画笔连线已开启：按住源节点拖到目标节点即可连线。" : "画笔连线已关闭。", "success");
  renderEdges();
}

function toggleDrawMode() {
  drawMode = !drawMode;
  if (drawMode) {
    connectMode = false;
    isPenDrawing = false;
    penSourceNodeId = "";
  }
  getButton("drawStrokeBtn").textContent = `自由画线：${drawMode ? "开" : "关"}`;
  getButton("drawStrokeBtn").classList.toggle("active", drawMode);
  getButton("penConnectBtn").textContent = `节点连线笔：${connectMode ? "开" : "关"}`;
  getButton("penConnectBtn").classList.toggle("active", connectMode);
  setStatus(drawMode ? "自由画线已开启：按住鼠标左键可直接绘制线条。" : "自由画线已关闭。", "success");
}

function resetToolModes(message = "工具抽屉已关闭。") {
  connectMode = false;
  drawMode = false;
  isPenDrawing = false;
  isStrokeDrawing = false;
  penSourceNodeId = "";
  activeStrokeId = "";
  getButton("penConnectBtn").textContent = "节点连线笔：关";
  getButton("penConnectBtn").classList.remove("active");
  getButton("drawStrokeBtn").textContent = "自由画线：关";
  getButton("drawStrokeBtn").classList.remove("active");
  setStatus(message, "success");
  renderEdges();
  renderStrokes();
}

function undoLastStroke() {
  if (state.strokes.length === 0) {
    setStatus("暂无可撤销的画线。", "error");
    return;
  }
  state.strokes.pop();
  renderStrokes();
  scheduleSave();
  setStatus("已撤销一笔。", "success");
}

function deleteSelected() {
  if (selectedNodeIds.size > 0 || selectedEdgeIds.size > 0 || selectedStrokeIds.size > 0) {
    const nodeIds = new Set<string>(Array.from(selectedNodeIds));
    const edgeIds = new Set<string>(Array.from(selectedEdgeIds));
    const strokeIds = new Set<string>(Array.from(selectedStrokeIds));
    const beforeNodes = state.nodes.length;
    const beforeEdges = state.edges.length;
    const beforeStrokes = state.strokes.length;

    const removedNodes = nodeIds.size > 0 ? state.nodes.filter((n) => nodeIds.has(n.id)) : [];
    if (nodeIds.size > 0) {
      state.nodes = state.nodes.filter((n) => !nodeIds.has(n.id));
    }
    state.edges = state.edges.filter((e) => {
      if (edgeIds.has(e.id)) return false;
      if (nodeIds.has(e.source) || nodeIds.has(e.target)) return false;
      return true;
    });
    state.strokes = state.strokes.filter((s) => !strokeIds.has(s.id));

    selectedNodeIds.clear();
    selectedEdgeIds.clear();
    selectedStrokeIds.clear();
    selectedNodeId = "";
    selectedEdgeId = "";
    selectedStrokeId = "";

    const removedCount =
      (beforeNodes - state.nodes.length) + (beforeEdges - state.edges.length) + (beforeStrokes - state.strokes.length);
    if (removedCount > 0) {
      restoreTemplateByDeletedNodes(removedNodes);
      setStatus(`已批量删除 ${removedCount} 个元素。`, "success");
      renderAll();
      scheduleSave();
    }
    return;
  }
  if (selectedEdgeId) {
    const removed = deleteSelectedEdge();
    if (removed) {
      setStatus("连线已删除。", "success");
    }
    selectedNodeIds.clear();
    selectedEdgeIds.clear();
    selectedStrokeIds.clear();
    renderAll();
    scheduleSave();
    return;
  }
  if (selectedStrokeId) {
    const before = state.strokes.length;
    state.strokes = state.strokes.filter((s) => s.id !== selectedStrokeId);
    selectedStrokeId = "";
    if (state.strokes.length < before) {
      setStatus("画线已删除。", "success");
      selectedNodeIds.clear();
      selectedEdgeIds.clear();
      selectedStrokeIds.clear();
      renderAll();
      scheduleSave();
    }
    return;
  }
  if (selectedNodeId) {
    const id = selectedNodeId;
    const removedNode = state.nodes.find((n) => n.id === id) || null;
    state.nodes = state.nodes.filter((n) => n.id !== id);
    state.edges = state.edges.filter((e) => e.source !== id && e.target !== id);
    selectedNodeId = "";
    selectedEdgeId = "";
    selectedStrokeId = "";
    selectedNodeIds.clear();
    selectedEdgeIds.clear();
    selectedStrokeIds.clear();
    if (removedNode) {
      restoreTemplateByDeletedNodes([removedNode]);
    }
    setStatus("节点已删除。", "success");
    renderAll();
    scheduleSave();
  }
}

function deleteSelectedEdge() {
  if (!selectedEdgeId) return false;
  const currentId = selectedEdgeId;
  const before = state.edges.length;
  state.edges = state.edges.filter((e) => e.id !== currentId);
  selectedEdgeId = "";
  return state.edges.length < before;
}

function clearAll() {
  const removedNodes = state.nodes.filter((n) => n.nodeType === "productHotspot");
  state.nodes = [];
  state.edges = [];
  state.strokes = [];
  selectedNodeId = "";
  selectedEdgeId = "";
  selectedStrokeId = "";
  selectedNodeIds.clear();
  selectedEdgeIds.clear();
  selectedStrokeIds.clear();
  isPenDrawing = false;
  penSourceNodeId = "";
  isStrokeDrawing = false;
  activeStrokeId = "";
  restoreTemplateByDeletedNodes(removedNodes);
  imageAssetStore.clear();
  renderAll();
  scheduleSave();
  setStatus("已清空画布。", "success");
}

async function restoreState() {
  try {
    const workbookPayload = await loadGraphFromWorkbook();
    if (workbookPayload && workbookPayload.graph) {
      state.nodes = normalizeNodes(workbookPayload.graph.nodes as GraphNode[]);
      state.edges = normalizeEdges(workbookPayload.graph.edges as GraphEdge[]);
      state.strokes = normalizeStrokes((workbookPayload.graph as any).strokes);
      state.updatedAt = String(workbookPayload.graph.updatedAt || workbookPayload.updatedAt || "");
      imageAssetStore.clear();
      Object.entries(workbookPayload.images || {}).forEach(([key, data]) => {
        if (key && data) {
          imageAssetStore.set(key, data);
        }
      });
      applyImageAssetsToNodes();
      return;
    }
  } catch {
    // ignore workbook restore failures and fallback to local cache
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as GraphState;
    state.nodes = normalizeNodes(parsed.nodes);
    state.edges = normalizeEdges(parsed.edges);
    state.strokes = normalizeStrokes((parsed as any).strokes);
    state.updatedAt = String(parsed.updatedAt || "");
  } catch {
    setStatus("本地数据解析失败，已忽略旧数据。", "error");
  }
}

function saveStateLocal() {
  state.updatedAt = new Date().toISOString();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function saveStateToWorkbook() {
  await ensureNodeImagesStored();
  state.updatedAt = new Date().toISOString();
  const payload = {
    schemaVersion: "1.0",
    updatedAt: state.updatedAt,
    graph: {
      nodes: state.nodes,
      edges: state.edges,
      strokes: state.strokes,
      updatedAt: state.updatedAt,
    },
    images: getUsedImagesFromState(),
  };

  try {
    await requestWorkbookSaveByParent(payload);
    saveStateLocal();
    setStatus("已保存到当前工作簿。", "success");
  } catch (error) {
    try {
      await saveGraphToWorkbook(payload);
      saveStateLocal();
      setStatus("已保存到当前工作簿。", "success");
    } catch (fallbackError) {
      saveStateLocal();
      const reason = (fallbackError as Error)?.message || (error as Error)?.message || "未知错误";
      setStatus(`保存到工作簿失败，已保存本地缓存：${reason}`, "error");
    }
  }
}

function requestWorkbookSaveByParent(payload: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = `save_${Date.now()}_${saveRequestSeq++}`;
    const timer = window.setTimeout(() => {
      pendingSaveRequests.delete(requestId);
      reject(new Error("父窗口保存超时"));
    }, 12000);

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
      reject(error as Error);
    }
  });
}

function scheduleSave() {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
  }
  saveTimer = window.setTimeout(() => {
    saveStateLocal();
    setStatus("已自动保存到本地缓存。", "success");
  }, 600);
}

function renderAll() {
  renderEdges();
  renderNodes();
  renderStrokes();
  renderTemplateLibrary();
  const node = state.nodes.find((n) => n.id === selectedNodeId);
  if (node) {
    applyNodeToForm(node);
  }
}

function renderEdges() {
  const edgeLayer = getEdgeLayer();
  while (edgeLayer.firstChild) {
    edgeLayer.removeChild(edgeLayer.firstChild);
  }

  state.edges.forEach((edge) => {
    const source = findNode(edge.source);
    const target = findNode(edge.target);
    if (!source || !target) return;

    const sourceW = source.nodeType === "productHotspot" ? PRODUCT_NODE_WIDTH : NODE_WIDTH;
    const sourceH = source.nodeType === "productHotspot" ? PRODUCT_NODE_HEIGHT : NODE_HEIGHT;
    const targetH = target.nodeType === "productHotspot" ? PRODUCT_NODE_HEIGHT : NODE_HEIGHT;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    const hitLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    const sourceX = source.x + sourceW;
    const sourceY = source.y + sourceH / 2;
    const targetX = target.x;
    const targetY = target.y + targetH / 2;
    line.setAttribute("x1", String(sourceX));
    line.setAttribute("y1", String(sourceY));
    line.setAttribute("x2", String(targetX));
    line.setAttribute("y2", String(targetY));
    const edgeSelected = selectedEdgeId === edge.id || selectedEdgeIds.has(edge.id);
    line.setAttribute("class", `edge-line${edgeSelected ? " selected" : ""}`);
    line.dataset.edgeId = edge.id;
    hitLine.setAttribute("x1", String(sourceX));
    hitLine.setAttribute("y1", String(sourceY));
    hitLine.setAttribute("x2", String(targetX));
    hitLine.setAttribute("y2", String(targetY));
    hitLine.setAttribute("class", "edge-hit");
    hitLine.dataset.edgeId = edge.id;

    const selectEdge = (evt: Event) => {
      evt.stopPropagation();
      selectedEdgeId = edge.id;
      selectedNodeId = "";
      selectedStrokeId = "";
      selectedNodeIds.clear();
      selectedEdgeIds.clear();
      selectedStrokeIds.clear();
      setStatus("已选中连线，可按 Delete 删除。", "success");
      renderAll();
    };

    hitLine.addEventListener("click", selectEdge);
    edgeLayer.appendChild(line);
    edgeLayer.appendChild(hitLine);
  });

  if (connectMode && isPenDrawing && penSourceNodeId) {
    const source = findNode(penSourceNodeId);
    if (!source) return;
    const sourceW = source.nodeType === "productHotspot" ? PRODUCT_NODE_WIDTH : NODE_WIDTH;
    const sourceH = source.nodeType === "productHotspot" ? PRODUCT_NODE_HEIGHT : NODE_HEIGHT;
    const preview = document.createElementNS("http://www.w3.org/2000/svg", "line");
    preview.setAttribute("x1", String(source.x + sourceW / 2));
    preview.setAttribute("y1", String(source.y + sourceH / 2));
    preview.setAttribute("x2", String(penPreviewX));
    preview.setAttribute("y2", String(penPreviewY));
    preview.setAttribute("class", "edge-line preview");
    edgeLayer.appendChild(preview);
  }
}

function renderStrokes() {
  const strokeLayer = getStrokeLayer();
  while (strokeLayer.firstChild) {
    strokeLayer.removeChild(strokeLayer.firstChild);
  }

  state.strokes.forEach((stroke) => {
    if (!stroke.points || stroke.points.length < 2) return;
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("class", "stroke-path");
    if (selectedStrokeId === stroke.id || selectedStrokeIds.has(stroke.id)) {
      polyline.classList.add("selected");
    }
    polyline.setAttribute("stroke", stroke.color || "#0284c7");
    polyline.setAttribute("stroke-width", String(Math.max(1, Number(stroke.width || 2))));
    polyline.dataset.strokeId = stroke.id;
    polyline.setAttribute(
      "points",
      stroke.points.map((p) => `${Number(p.x) || 0},${Number(p.y) || 0}`).join(" ")
    );
    polyline.addEventListener("click", (evt) => {
      evt.stopPropagation();
      selectedStrokeId = stroke.id;
      selectedNodeId = "";
      selectedEdgeId = "";
      selectedNodeIds.clear();
      selectedEdgeIds.clear();
      selectedStrokeIds.clear();
      setStatus("已选中画线，可按 Delete 删除。", "success");
      renderAll();
    });
    strokeLayer.appendChild(polyline);
  });
}

function renderNodes() {
  const nodeLayer = getNodeLayer();
  while (nodeLayer.firstChild) {
    nodeLayer.removeChild(nodeLayer.firstChild);
  }

  state.nodes.forEach((node) => {
    const el = document.createElement("div");
    const productClass = node.nodeType === "productHotspot" ? " product-node" : "";
    const isSelected = selectedNodeId === node.id || selectedNodeIds.has(node.id);
    el.className = `graph-node${productClass}${isSelected ? " selected" : ""}`;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.dataset.nodeId = node.id;

    if (node.nodeType === "productHotspot") {
      const imageSrc = getNodeImageSrc(node);
      el.innerHTML = `
        <div class="node-image-wrap">
          ${imageSrc ? `<img class="node-image" src="${escapeHtml(imageSrc)}" alt="" draggable="false" />` : ""}
          ${renderHotspotsHtml(node.hotspots)}
        </div>
      `;
    } else {
      el.innerHTML = `
        <div class="node-title">${escapeHtml(node.label)}</div>
        <div class="node-meta">系统：${escapeHtml(node.systemName)}</div>
        <div class="node-meta">数量：${node.componentQuantity} | 单价：${node.componentUnitPrice}</div>
      `;
    }

    el.addEventListener("click", (evt) => {
      evt.stopPropagation();
      if (connectMode || drawMode) return;
      selectedNodeId = node.id;
      selectedEdgeId = "";
      selectedStrokeId = "";
      selectedNodeIds.clear();
      selectedEdgeIds.clear();
      selectedStrokeIds.clear();
      applyNodeToForm(node);
      renderAll();
    });

    el.addEventListener("pointerdown", (evt) => {
      evt.stopPropagation();
      if (drawMode) {
        beginStrokeDraw(evt);
        return;
      }
      if (connectMode) {
        beginPenDraw(node.id, evt);
        return;
      }
      dragNodeId = node.id;
      const world = toWorldPoint(evt.clientX, evt.clientY);
      dragOffsetX = world.x - node.x;
      dragOffsetY = world.y - node.y;
      (evt.target as HTMLElement).setPointerCapture?.(evt.pointerId);
    });

    nodeLayer.appendChild(el);
  });
}

function onPointerMove(evt: PointerEvent) {
  if (isBoxSelecting) {
    boxCurrentClientX = evt.clientX;
    boxCurrentClientY = evt.clientY;
    updateSelectionBoxVisual();
    return;
  }

  if (drawMode && isStrokeDrawing) {
    appendStrokePoint(evt);
    return;
  }

  if (connectMode && isPenDrawing) {
    const world = toWorldPoint(evt.clientX, evt.clientY);
    penPreviewX = world.x;
    penPreviewY = world.y;
    renderEdges();
    return;
  }

  if (isPanning) {
    viewPanX = panOriginX + (evt.clientX - panStartClientX);
    viewPanY = panOriginY + (evt.clientY - panStartClientY);
    applyViewportTransform();
    return;
  }

  if (!dragNodeId) return;
  const node = findNode(dragNodeId);
  if (!node) return;

  const world = toWorldPoint(evt.clientX, evt.clientY);
  node.x = world.x - dragOffsetX;
  node.y = world.y - dragOffsetY;
  renderAll();
}

function onPointerUp(evt: PointerEvent) {
  if (isBoxSelecting) {
    boxCurrentClientX = evt.clientX;
    boxCurrentClientY = evt.clientY;
    finishBoxSelection();
    return;
  }

  if (drawMode && isStrokeDrawing) {
    endStrokeDraw(evt);
    return;
  }

  if (connectMode && isPenDrawing) {
    finishPenDraw(evt);
    return;
  }

  if (isPanning) {
    isPanning = false;
    getCanvas().style.cursor = "default";
  }
  if (!dragNodeId) return;
  dragNodeId = "";
  scheduleSave();
}

function onCanvasPointerDown(evt: PointerEvent) {
  if (drawMode) {
    beginStrokeDraw(evt);
    return;
  }
  if (connectMode) return;
  if (evt.button === 0 && evt.shiftKey) {
    beginBoxSelection(evt);
    return;
  }
  const canvas = getCanvas();
  const target = evt.target as HTMLElement;
  const isEmptyArea = target === canvas || target === getNodeLayer() || target === getEdgeLayer();
  if (!isEmptyArea || evt.button !== 0) return;
  isPanning = true;
  panStartClientX = evt.clientX;
  panStartClientY = evt.clientY;
  panOriginX = viewPanX;
  panOriginY = viewPanY;
  canvas.style.cursor = "grabbing";
}

function beginBoxSelection(evt: PointerEvent) {
  evt.preventDefault();
  isBoxSelecting = true;
  boxStartClientX = evt.clientX;
  boxStartClientY = evt.clientY;
  boxCurrentClientX = evt.clientX;
  boxCurrentClientY = evt.clientY;
  selectedNodeId = "";
  selectedEdgeId = "";
  selectedStrokeId = "";
  selectedNodeIds.clear();
  selectedEdgeIds.clear();
  selectedStrokeIds.clear();
  updateSelectionBoxVisual();
}

function updateSelectionBoxVisual() {
  const canvas = getCanvas();
  const rect = canvas.getBoundingClientRect();
  const left = Math.max(0, Math.min(boxStartClientX, boxCurrentClientX) - rect.left);
  const top = Math.max(0, Math.min(boxStartClientY, boxCurrentClientY) - rect.top);
  const width = Math.abs(boxCurrentClientX - boxStartClientX);
  const height = Math.abs(boxCurrentClientY - boxStartClientY);
  const box = getSelectionBox();
  box.style.display = "block";
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;
}

function finishBoxSelection() {
  isBoxSelecting = false;
  suppressCanvasClearClick = true;
  getSelectionBox().style.display = "none";
  const a = toWorldPoint(boxStartClientX, boxStartClientY);
  const b = toWorldPoint(boxCurrentClientX, boxCurrentClientY);
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);

  selectedNodeIds.clear();
  selectedEdgeIds.clear();
  selectedStrokeIds.clear();
  state.nodes.forEach((node) => {
    const width = node.nodeType === "productHotspot" ? PRODUCT_NODE_WIDTH : NODE_WIDTH;
    const height = node.nodeType === "productHotspot" ? PRODUCT_NODE_HEIGHT : NODE_HEIGHT;
    const nodeMinX = node.x;
    const nodeMaxX = node.x + width;
    const nodeMinY = node.y;
    const nodeMaxY = node.y + height;
    const intersects = !(nodeMaxX < minX || nodeMinX > maxX || nodeMaxY < minY || nodeMinY > maxY);
    if (intersects) {
      selectedNodeIds.add(node.id);
    }
  });

  const rect = { minX, minY, maxX, maxY };
  state.edges.forEach((edge) => {
    const source = findNode(edge.source);
    const target = findNode(edge.target);
    if (!source || !target) return;
    const sourceW = source.nodeType === "productHotspot" ? PRODUCT_NODE_WIDTH : NODE_WIDTH;
    const sourceH = source.nodeType === "productHotspot" ? PRODUCT_NODE_HEIGHT : NODE_HEIGHT;
    const targetH = target.nodeType === "productHotspot" ? PRODUCT_NODE_HEIGHT : NODE_HEIGHT;
    const x1 = source.x + sourceW;
    const y1 = source.y + sourceH / 2;
    const x2 = target.x;
    const y2 = target.y + targetH / 2;
    if (segmentIntersectsRect(x1, y1, x2, y2, rect)) {
      selectedEdgeIds.add(edge.id);
    }
  });

  state.strokes.forEach((stroke) => {
    if (strokeIntersectsRect(stroke, rect)) {
      selectedStrokeIds.add(stroke.id);
    }
  });

  const total = selectedNodeIds.size + selectedEdgeIds.size + selectedStrokeIds.size;
  if (total > 0) {
    selectedNodeId = "";
    selectedEdgeId = "";
    selectedStrokeId = "";
    setStatus(
      `已框选 节点${selectedNodeIds.size} 连线${selectedEdgeIds.size} 画线${selectedStrokeIds.size}。`,
      "success"
    );
  } else {
    setStatus("未框选到元素。", "error");
  }
  renderAll();
}

function pointInRect(x: number, y: number, rect: { minX: number; minY: number; maxX: number; maxY: number }) {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: { minX: number; minY: number; maxX: number; maxY: number }
) {
  if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;
  return (
    segmentsIntersect(x1, y1, x2, y2, rect.minX, rect.minY, rect.maxX, rect.minY) ||
    segmentsIntersect(x1, y1, x2, y2, rect.maxX, rect.minY, rect.maxX, rect.maxY) ||
    segmentsIntersect(x1, y1, x2, y2, rect.maxX, rect.maxY, rect.minX, rect.maxY) ||
    segmentsIntersect(x1, y1, x2, y2, rect.minX, rect.maxY, rect.minX, rect.minY)
  );
}

function strokeIntersectsRect(stroke: GraphStroke, rect: { minX: number; minY: number; maxX: number; maxY: number }) {
  if (!stroke.points || stroke.points.length === 0) return false;
  for (let i = 0; i < stroke.points.length; i++) {
    const p = stroke.points[i];
    if (pointInRect(p.x, p.y, rect)) return true;
    if (i > 0) {
      const prev = stroke.points[i - 1];
      if (segmentIntersectsRect(prev.x, prev.y, p.x, p.y, rect)) return true;
    }
  }
  return false;
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
) {
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);

  if (o1 === 0 && onSegment(ax, ay, bx, by, cx, cy)) return true;
  if (o2 === 0 && onSegment(ax, ay, bx, by, dx, dy)) return true;
  if (o3 === 0 && onSegment(cx, cy, dx, dy, ax, ay)) return true;
  if (o4 === 0 && onSegment(cx, cy, dx, dy, bx, by)) return true;

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(v) < 1e-6) return 0;
  return v > 0 ? 1 : -1;
}

function onSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  return (
    px >= Math.min(ax, bx) - 1e-6 &&
    px <= Math.max(ax, bx) + 1e-6 &&
    py >= Math.min(ay, by) - 1e-6 &&
    py <= Math.max(ay, by) + 1e-6
  );
}

function onCanvasContextMenu(evt: MouseEvent) {
  evt.preventDefault();
  const target = evt.target as Element | null;
  const nodeId = findDatasetUp(target, "nodeId", "graph-node");
  const edgeId = findDatasetUp(target, "edgeId", "edge-hit", "edge-line");
  const strokeId = findDatasetUp(target, "strokeId", "stroke-path");

  // 右键未精确命中时，保留现有选中，避免“选中被清空导致无法删除”。
  if (nodeId || edgeId || strokeId) {
    selectedNodeId = nodeId;
    selectedEdgeId = edgeId;
    selectedStrokeId = strokeId;
    selectedNodeIds.clear();
    selectedEdgeIds.clear();
    selectedStrokeIds.clear();
  }

  renderAll();
  showContextMenu(
    evt.clientX,
    evt.clientY,
    !!(
      selectedNodeId ||
      selectedEdgeId ||
      selectedStrokeId ||
      selectedNodeIds.size > 0 ||
      selectedEdgeIds.size > 0 ||
      selectedStrokeIds.size > 0
    )
  );
}

function findDatasetUp(target: Element | null, key: string, ...classes: string[]) {
  let cur: Element | null = target;
  while (cur) {
    const hasClass = classes.some((cls) => cur && cur.classList && cur.classList.contains(cls));
    if (hasClass) {
      const dataKey = `data-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
      const value =
        (cur as HTMLElement).dataset?.[key] ||
        cur.getAttribute(dataKey) ||
        "";
      return String(value || "");
    }
    cur = cur.parentElement;
  }
  return "";
}

function showContextMenu(x: number, y: number, canDelete: boolean) {
  const menu = getContextMenu();
  const deleteBtn = getContextDeleteButton();
  deleteBtn.disabled = !canDelete;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.classList.add("open");
}

function hideContextMenu() {
  const menu = getContextMenu();
  menu.classList.remove("open");
}

function beginPenDraw(sourceNodeId: string, evt: PointerEvent) {
  if (evt.button !== 0) return;
  evt.preventDefault();
  const source = findNode(sourceNodeId);
  if (!source) return;
  isPenDrawing = true;
  penSourceNodeId = sourceNodeId;
  const sourceW = source.nodeType === "productHotspot" ? PRODUCT_NODE_WIDTH : NODE_WIDTH;
  const sourceH = source.nodeType === "productHotspot" ? PRODUCT_NODE_HEIGHT : NODE_HEIGHT;
  penPreviewX = source.x + sourceW / 2;
  penPreviewY = source.y + sourceH / 2;
  (evt.target as HTMLElement).setPointerCapture?.(evt.pointerId);
  setStatus("画笔连线中：拖到目标节点后松开。", "success");
  renderEdges();
}

function beginStrokeDraw(evt: PointerEvent) {
  if (evt.button !== 0) return;
  evt.preventDefault();
  const world = toWorldPoint(evt.clientX, evt.clientY);
  const strokeId = `stroke_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  state.strokes.push({
    id: strokeId,
    points: [{ x: world.x, y: world.y }],
    color: "#0284c7",
    width: 2,
  });
  activeStrokeId = strokeId;
  isStrokeDrawing = true;
  (evt.target as HTMLElement).setPointerCapture?.(evt.pointerId);
  renderStrokes();
}

function appendStrokePoint(evt: PointerEvent) {
  const stroke = state.strokes.find((s) => s.id === activeStrokeId);
  if (!stroke) return;
  const world = toWorldPoint(evt.clientX, evt.clientY);
  const last = stroke.points[stroke.points.length - 1];
  if (last) {
    const dx = world.x - last.x;
    const dy = world.y - last.y;
    if (dx * dx + dy * dy < 4) return;
  }
  stroke.points.push({ x: world.x, y: world.y });
  renderStrokes();
}

function endStrokeDraw(evt: PointerEvent) {
  appendStrokePoint(evt);
  isStrokeDrawing = false;
  activeStrokeId = "";
  const last = state.strokes[state.strokes.length - 1];
  if (last && last.points.length < 2) {
    state.strokes.pop();
  } else {
    scheduleSave();
    setStatus("线条已绘制。", "success");
  }
  renderStrokes();
}

function finishPenDraw(evt: PointerEvent) {
  const sourceNodeId = penSourceNodeId;
  const world = toWorldPoint(evt.clientX, evt.clientY);
  const targetNodeId = findNodeIdAtWorldPoint(world.x, world.y, sourceNodeId);
  isPenDrawing = false;
  penSourceNodeId = "";

  if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
    renderEdges();
    return;
  }

  const exists = hasEdgeBetween(sourceNodeId, targetNodeId);
  if (exists) {
    state.edges = state.edges.filter(
      (e) =>
        !(
          (e.source === sourceNodeId && e.target === targetNodeId) ||
          (e.source === targetNodeId && e.target === sourceNodeId)
        )
    );
    setStatus("连线已删除。", "success");
  } else {
    state.edges.push({
      id: `edge_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      source: sourceNodeId,
      target: targetNodeId,
    });
    setStatus("连线已创建。", "success");
  }

  scheduleSave();
  renderAll();
}

function hasEdgeBetween(a: string, b: string) {
  return state.edges.some(
    (e) => (e.source === a && e.target === b) || (e.source === b && e.target === a)
  );
}

function findNodeIdAtWorldPoint(worldX: number, worldY: number, excludeId = "") {
  for (let i = state.nodes.length - 1; i >= 0; i--) {
    const node = state.nodes[i];
    if (!node || node.id === excludeId) continue;
    const width = node.nodeType === "productHotspot" ? PRODUCT_NODE_WIDTH : NODE_WIDTH;
    const height = node.nodeType === "productHotspot" ? PRODUCT_NODE_HEIGHT : NODE_HEIGHT;
    if (worldX >= node.x && worldX <= node.x + width && worldY >= node.y && worldY <= node.y + height) {
      return node.id;
    }
  }
  return "";
}

function onCanvasWheel(evt: WheelEvent) {
  evt.preventDefault();
  const rect = getCanvas().getBoundingClientRect();
  const sx = evt.clientX - rect.left;
  const sy = evt.clientY - rect.top;
  const wx = (sx - viewPanX) / viewScale;
  const wy = (sy - viewPanY) / viewScale;
  const factor = evt.deltaY < 0 ? 1.1 : 0.9;
  const nextScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewScale * factor));
  if (nextScale === viewScale) return;
  viewScale = nextScale;
  viewPanX = sx - wx * viewScale;
  viewPanY = sy - wy * viewScale;
  applyViewportTransform();
}

function applyNodeToForm(node: GraphNode) {
  setInputValue("fieldLabel", node.label);
  setInputValue("fieldSystem", node.systemName);
  setInputValue("fieldDesc", node.componentDesc);
  setInputValue("fieldType", node.componentType);
  setInputValue("fieldMaterial", node.componentMaterial);
  setInputValue("fieldBrand", node.componentBrand);
  setInputValue("fieldUnit", node.componentUnit);
  setInputValue("fieldQty", String(node.componentQuantity));
  setInputValue("fieldPrice", String(node.componentUnitPrice));
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const text = String(value || "")
    .replace(/[¥￥,\s]/g, "")
    .trim();
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function clampPercent(value: number, fallback: number) {
  const v = Number.isFinite(value) ? value : fallback;
  return Math.max(2, Math.min(98, v));
}

function findNode(id: string) {
  return state.nodes.find((n) => n.id === id);
}

function normalizeNodes(nodes: unknown): GraphNode[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((item, index) => {
    const node = item as Partial<GraphNode>;
    return {
      id: String(node.id || `node_restored_${index}`),
      nodeType: node.nodeType === "productHotspot" ? "productHotspot" : "module",
      label: String(node.label || `模块${index + 1}`),
      systemName: String(node.systemName || "未分类"),
      componentDesc: String(node.componentDesc || ""),
      componentType: String(node.componentType || ""),
      componentMaterial: String(node.componentMaterial || ""),
      componentBrand: String(node.componentBrand || ""),
      componentUnit: String(node.componentUnit || "台"),
      componentQuantity: Math.max(1, Math.round(Number(node.componentQuantity || 1))),
      componentUnitPrice: Math.max(0, Math.round(Number(node.componentUnitPrice || 0))),
      productModel: String(node.productModel || ""),
      imageUrl: String(node.imageUrl || ""),
      imageKey: node.imageKey ? String(node.imageKey) : "",
      templateFingerprint: node.templateFingerprint ? String(node.templateFingerprint) : "",
      hotspots: Array.isArray(node.hotspots)
        ? node.hotspots.map((h, hIndex) => ({
            name: String((h as Partial<Hotspot>).name || `热点${hIndex + 1}`),
            x: clampPercent(Number((h as Partial<Hotspot>).x), 15),
            y: clampPercent(Number((h as Partial<Hotspot>).y), 20),
          }))
        : [],
      x: Math.max(0, Number(node.x || 0)),
      y: Math.max(0, Number(node.y || 0)),
    };
  });
}

function normalizeEdges(edges: unknown): GraphEdge[] {
  if (!Array.isArray(edges)) return [];
  return edges
    .map((item, index) => {
      const edge = item as Partial<GraphEdge>;
      return {
        id: String(edge.id || `edge_restored_${index}`),
        source: String(edge.source || ""),
        target: String(edge.target || ""),
      };
    })
    .filter((edge) => edge.source && edge.target);
}

function normalizeStrokes(strokes: unknown): GraphStroke[] {
  if (!Array.isArray(strokes)) return [];
  return strokes
    .map((item, index) => {
      const stroke = item as Partial<GraphStroke>;
      const points = Array.isArray(stroke.points)
        ? stroke.points
            .map((p) => ({
              x: Number((p as Partial<StrokePoint>)?.x || 0),
              y: Number((p as Partial<StrokePoint>)?.y || 0),
            }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        : [];
      return {
        id: String(stroke.id || `stroke_restored_${index}`),
        points,
        color: String(stroke.color || "#0284c7"),
        width: Math.max(1, Number(stroke.width || 2)),
      };
    })
    .filter((stroke) => stroke.points.length >= 2);
}

function buildImageKey(model: string, imageUrl: string) {
  const source = `${String(model || "").trim()}|${String(imageUrl || "").trim()}`;
  if (!source.replace("|", "").trim()) return "";
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return `img_${hash.toString(16)}`;
}

function getNodeImageSrc(node: GraphNode) {
  if (node.imageKey && imageAssetStore.has(node.imageKey)) {
    return imageAssetStore.get(node.imageKey) || "";
  }
  return node.imageUrl || "";
}

function applyImageAssetsToNodes() {
  state.nodes.forEach((node) => {
    if (!node.imageKey) return;
    const data = imageAssetStore.get(node.imageKey);
    if (data) {
      node.imageUrl = data;
    }
  });
}

async function cacheImageData(imageKey: string, imageUrl: string) {
  if (!imageKey || !imageUrl) return;
  if (imageAssetStore.has(imageKey)) return;
  const dataUrl = await tryFetchImageAsDataUrl(imageUrl);
  if (dataUrl) {
    imageAssetStore.set(imageKey, dataUrl);
  }
}

async function ensureNodeImagesStored() {
  const productNodes = state.nodes.filter((node) => node.nodeType === "productHotspot");
  for (const node of productNodes) {
    if (!node.imageUrl) continue;
    if (!node.imageKey) {
      node.imageKey = buildImageKey(node.productModel || node.label, node.imageUrl);
    }
    if (!node.imageKey || imageAssetStore.has(node.imageKey)) continue;
    const dataUrl = await tryFetchImageAsDataUrl(node.imageUrl);
    if (dataUrl) {
      imageAssetStore.set(node.imageKey, dataUrl);
      node.imageUrl = dataUrl;
    }
  }
}

function getUsedImagesFromState() {
  const images: Record<string, string> = {};
  state.nodes.forEach((node) => {
    if (!node.imageKey) return;
    const data = imageAssetStore.get(node.imageKey);
    if (data) {
      images[node.imageKey] = data;
    }
  });
  return images;
}

async function tryFetchImageAsDataUrl(url: string): Promise<string> {
  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return "";
    const blob = await resp.blob();
    const dataUrl = await blobToDataUrl(blob);
    return dataUrl;
  } catch {
    return "";
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片编码失败"));
    reader.readAsDataURL(blob);
  });
}

function setStatus(message: string, kind: "error" | "success" | "" = "") {
  const el = document.getElementById("statusText");
  if (!el) return;
  el.textContent = message;
  el.className = kind ? `status ${kind}` : "status";
}

async function showTemplateImageInfo(item: TemplateItem) {
  const key = getTemplateImageFingerprint(item.imageUrl, item.productModel);
  let info = templateImageInfoCache.get(key);
  if (!info) {
    const [size, bytes] = await Promise.all([
      readImageNaturalSize(item.imageUrl),
      readImageByteSize(item.imageUrl),
    ]);
    info = {
      width: size.width,
      height: size.height,
      kb: bytes > 0 ? Math.round((bytes / 1024) * 10) / 10 : null,
    };
    templateImageInfoCache.set(key, info);
  }

  const model = String(item.productModel || "").trim() || "未命名模板";
  const wh =
    info.width > 0 && info.height > 0 ? `${info.width} x ${info.height}px` : "未知尺寸";
  const kbText = info.kb != null ? `${info.kb}KB` : "未知大小";
  setStatus(`模板 ${model} | 尺寸 ${wh} | 大小 ${kbText}`, "success");
}

async function readImageNaturalSize(url: string): Promise<{ width: number; height: number }> {
  const src = String(url || "").trim();
  if (!src) return { width: 0, height: 0 };
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: Number(img.naturalWidth || 0), height: Number(img.naturalHeight || 0) });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = src;
  });
}

async function readImageByteSize(url: string): Promise<number> {
  const src = String(url || "").trim();
  if (!src) return 0;
  if (src.startsWith("data:")) {
    const comma = src.indexOf(",");
    if (comma < 0) return 0;
    const payload = src.slice(comma + 1);
    return Math.floor((payload.length * 3) / 4);
  }
  try {
    const resp = await fetch(src, { cache: "no-store" });
    if (!resp.ok) return 0;
    const blob = await resp.blob();
    return Number(blob.size || 0);
  } catch {
    return 0;
  }
}

function getCanvas() {
  return document.getElementById("canvas") as HTMLDivElement;
}

function getSelectionBox() {
  return document.getElementById("selectionBox") as HTMLDivElement;
}

function getScene() {
  return document.getElementById("scene") as HTMLDivElement;
}

function toWorldPoint(clientX: number, clientY: number) {
  const rect = getCanvas().getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  return {
    x: (sx - viewPanX) / viewScale,
    y: (sy - viewPanY) / viewScale,
  };
}

function applyViewportTransform() {
  const scene = getScene();
  if (!scene) return;
  scene.style.transform = `translate(${viewPanX}px, ${viewPanY}px) scale(${viewScale})`;
}

function setTemplateDrawerOpen(open: boolean) {
  const drawer = document.getElementById("templateDrawer");
  if (!drawer) return;
  drawer.classList.toggle("open", open);
  const btn = document.getElementById("loadTemplateLibraryBtn");
  btn?.classList.toggle("active", open);
}

function isTemplateDrawerOpen() {
  const drawer = document.getElementById("templateDrawer");
  if (!drawer) return false;
  return drawer.classList.contains("open");
}

function setToolsDrawerOpen(open: boolean) {
  const drawer = document.getElementById("toolsDrawer");
  if (!drawer) return;
  drawer.classList.toggle("open", open);
  const btn = document.getElementById("toolsBtn");
  btn?.classList.toggle("active", open);
  if (!open) {
    resetToolModes();
  }
}

function isToolsDrawerOpen() {
  const drawer = document.getElementById("toolsDrawer");
  if (!drawer) return false;
  return drawer.classList.contains("open");
}

function getNodeLayer() {
  return document.getElementById("nodeLayer") as HTMLDivElement;
}

function getEdgeLayer() {
  return document.getElementById("edgeLayer") as SVGSVGElement;
}

function getStrokeLayer() {
  return document.getElementById("strokeLayer") as SVGSVGElement;
}

function getButton(id: string) {
  return document.getElementById(id) as HTMLButtonElement;
}

function getContextMenu() {
  return document.getElementById("canvasContextMenu") as HTMLDivElement;
}

function getContextDeleteButton() {
  return document.getElementById("contextDeleteBtn") as HTMLButtonElement;
}

function getField(id: string) {
  return document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
}

function setInputValue(id: string, value: string) {
  const el = getField(id);
  el.value = value;
}

function renderHotspotsHtml(hotspots: Hotspot[], size: "" | "small" = "") {
  return hotspots
    .map((h) => {
      const cls = size ? `hotspot-dot ${size}` : "hotspot-dot";
      return `<span class="${cls}" title="${escapeHtml(h.name)}" style="left:${h.x}%;top:${h.y}%"></span>`;
    })
    .join("");
}

function getImageUrl(componentPic: unknown) {
  if (!componentPic || !String(componentPic).trim()) {
    return "";
  }
  let fileName = String(componentPic).trim();
  if (!fileName.includes(".")) {
    fileName = `${fileName}.png`;
  }
  const encodedFileName = encodeURIComponent(fileName);
  const url = new URL(`${IMAGE_BASE}${encodedFileName}`, window.location.origin);
  url.searchParams.set("v", IMAGE_CACHE_BUSTER);
  return url.toString();
}

function normalizeImageUrl(rawUrl: unknown) {
  if (!rawUrl || !String(rawUrl).trim()) {
    return "";
  }
  const source = String(rawUrl).trim();
  if (source.startsWith("data:") || source.startsWith("blob:")) {
    return source;
  }
  try {
    const url = new URL(source, window.location.origin);
    url.protocol = window.location.protocol;
    const parts = url.pathname.split("/").map((part, idx) => {
      if (idx === 0) return part;
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return encodeURIComponent(part);
      }
    });
    url.pathname = parts.join("/");
    url.searchParams.set("v", IMAGE_CACHE_BUSTER);
    return url.toString();
  } catch {
    return getImageUrl(rawUrl);
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${APP_URLS.apiBase}${path}`);
  const result = await response.json();
  if (!response.ok || !result || !result.success) {
    throw new Error((result && (result.error || result.message)) || "请求失败");
  }
  return result.data as T;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${APP_URLS.apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const result = await response.json();
  if (!response.ok || !result || !result.success) {
    throw new Error((result && (result.error || result.message)) || "请求失败");
  }
  return result.data as T;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
