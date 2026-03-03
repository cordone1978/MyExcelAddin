/* global Office, Excel, document, window */

import { createQuotationSheet } from "../buildsheet";
import { insertComponentsToConfigSheet } from "../buildsheet/insertRows";
import { API_PATHS, APP_URLS } from "../shared/appConstants";
import { BUILDSHEET_TEXT } from "../shared/businessTextConstants";
import { SHEET_NAMES } from "../shared/sheetNames";

type Hotspot = {
  name: string;
  x: number;
  y: number;
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
  updatedAt: string;
};

type TemplateItem = {
  id: string;
  productModel: string;
  imageUrl: string;
  hotspots: Hotspot[];
};

const STORAGE_KEY = "quotation_addin_graph_editor_state_v1";
const TITLE_PREFIX_REGEX = /^([一二三四五六七八九十百零\d]+)[、.\s]*/;
const NODE_WIDTH = 180;
const NODE_HEIGHT = 88;
const PRODUCT_NODE_WIDTH = 220;
const PRODUCT_NODE_HEIGHT = 140;
const IMAGE_BASE = APP_URLS.imageBase;
const IMAGE_CACHE_BUSTER = Date.now().toString(36);

const state: GraphState = {
  nodes: [],
  edges: [],
  updatedAt: "",
};

let selectedNodeId = "";
let selectedEdgeId = "";
let connectMode = false;
let pendingConnectSourceId = "";
let saveTimer = 0;

let dragNodeId = "";
let dragOffsetX = 0;
let dragOffsetY = 0;

let templateLibrary: TemplateItem[] = [];
let productCatalogCache: Array<{ id: number; name: string }> | null = null;

const systemOptions = BUILDSHEET_TEXT.configSections.map((s) => s.replace(TITLE_PREFIX_REGEX, "").trim());

Office.onReady(() => {
  bindEvents();
  restoreState();
  ensureSystemOptions();
  renderAll();
  void loadTemplateLibraryFromQuoteSheet();
});

function bindEvents() {
  getButton("loadTemplateLibraryBtn").addEventListener("click", () => {
    void loadTemplateLibraryFromQuoteSheet();
  });
  getButton("importFromSheetBtn").addEventListener("click", () => {
    void importFromQuoteConfigSheet();
  });
  getButton("addNodeBtn").addEventListener("click", addNode);
  getButton("connectModeBtn").addEventListener("click", toggleConnectMode);
  getButton("deleteSelectedBtn").addEventListener("click", deleteSelected);
  getButton("clearAllBtn").addEventListener("click", clearAll);
  getButton("saveBtn").addEventListener("click", () => {
    saveState();
    setStatus("已保存到本地。", "success");
  });
  getButton("writeToSheetBtn").addEventListener("click", () => {
    void writeToQuoteConfigSheet();
  });
  getButton("applyNodeBtn").addEventListener("click", applySelectedNodeFields);

  const canvas = getCanvas();
  canvas.addEventListener("dragover", (evt) => {
    evt.preventDefault();
  });
  canvas.addEventListener("drop", (evt) => {
    evt.preventDefault();
    const templateId = evt.dataTransfer ? evt.dataTransfer.getData("text/plain") : "";
    if (!templateId) return;
    const template = templateLibrary.find((t) => t.id === templateId);
    if (!template) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(8, evt.clientX - rect.left - PRODUCT_NODE_WIDTH / 2);
    const y = Math.max(8, evt.clientY - rect.top - PRODUCT_NODE_HEIGHT / 2);
    addProductNodeFromTemplate(template, x, y);
  });

  canvas.addEventListener("click", (evt) => {
    if (evt.target === canvas || evt.target === getNodeLayer() || evt.target === getEdgeLayer()) {
      selectedNodeId = "";
      selectedEdgeId = "";
      pendingConnectSourceId = "";
      renderAll();
    }
  });

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
}

async function loadTemplateLibraryFromQuoteSheet() {
  try {
    setStatus("正在加载模板库...", "");
    const models = await readProductModelCandidates();
    if (models.length === 0) {
      templateLibrary = [];
      renderTemplateLibrary();
      setStatus("未在报价配置表识别到产品名称。", "error");
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

        let imageUrl = normalizeImageUrl(
          String(annotations && annotations[0] && annotations[0].image_url ? annotations[0].image_url : "")
        );
        if (!imageUrl) {
          const configRows = await apiGet<Array<{ component_pic?: string }>>(`${API_PATHS.config}/${productId}`);
          const rowWithPic = (configRows || []).find((r) => String(r && r.component_pic ? r.component_pic : "").trim() !== "");
          imageUrl = getImageUrl(rowWithPic && rowWithPic.component_pic ? rowWithPic.component_pic : "");
        }
        imageUrl = await requestTempImageUrl(String(product && product.product_model ? product.product_model : model), imageUrl);
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

    templateLibrary = items;
    renderTemplateLibrary();
    if (templateLibrary.length === 0) {
      setStatus(`未匹配到产品模板。候选名称 ${models.length} 个，未匹配 ${unresolvedCount} 个。`, "error");
      return;
    }
    setStatus(`模板库加载完成，共 ${templateLibrary.length} 个产品（未匹配 ${unresolvedCount} 个）。`, "success");
  } catch (error) {
    setStatus((error as Error).message || "模板库加载失败。", "error");
  }
}

async function readProductModelCandidates() {
  return Excel.run(async (context) => {
    const configSheet = context.workbook.worksheets.getItemOrNullObject(SHEET_NAMES.quoteConfig);
    configSheet.load("name");

    const configUsed = configSheet.getRange("A:C").getUsedRangeOrNullObject(false);
    configUsed.load(["values", "isNullObject"]);

    await context.sync();
    const models = new Set<string>();
    const headerSerial = String(BUILDSHEET_TEXT.configHeaders[0] || "").trim();

    if (!configSheet.isNullObject && !configUsed.isNullObject) {
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
    empty.textContent = "暂无模板。请先在报价配置表录入产品，然后点击“加载模板库”。";
    listEl.appendChild(empty);
    return;
  }

  templateLibrary.forEach((item) => {
    const card = document.createElement("div");
    card.className = "template-item";
    card.draggable = true;
    card.innerHTML = `
      <div class="template-title">${escapeHtml(item.productModel)}</div>
      <div class="template-thumb">
        ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.productModel)}" />` : ""}
        ${renderHotspotsHtml(item.hotspots, "small")}
      </div>
      <div class="template-meta">热点数：${item.hotspots.length}</div>
    `;

    card.addEventListener("dragstart", (evt) => {
      card.classList.add("dragging");
      if (evt.dataTransfer) {
        evt.dataTransfer.setData("text/plain", item.id);
        evt.dataTransfer.setDragImage(card, 60, 30);
      }
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });
    card.addEventListener("dblclick", () => {
      addProductNodeFromTemplate(item, 40, 40);
    });

    listEl.appendChild(card);
  });
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

function addNode() {
  const index = state.nodes.length + 1;
  const node: GraphNode = {
    id: `node_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    nodeType: "module",
    label: `模块${index}`,
    systemName: systemOptions[0] || "未分类",
    componentDesc: "",
    componentType: "",
    componentMaterial: "",
    componentBrand: "",
    componentUnit: "台",
    componentQuantity: 1,
    componentUnitPrice: 0,
    productModel: "",
    imageUrl: "",
    hotspots: [],
    x: 60 + (index % 5) * 36,
    y: 60 + (index % 4) * 30,
  };
  state.nodes.push(node);
  selectedNodeId = node.id;
  selectedEdgeId = "";
  pendingConnectSourceId = "";
  applyNodeToForm(node);
  renderAll();
  scheduleSave();
}

function addProductNodeFromTemplate(item: TemplateItem, x: number, y: number) {
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
    hotspots: item.hotspots,
    x,
    y,
  };
  state.nodes.push(node);
  selectedNodeId = node.id;
  selectedEdgeId = "";
  applyNodeToForm(node);
  renderAll();
  scheduleSave();
  void attachTempImageForNode(node.id, item.productModel, item.imageUrl);
}

async function attachTempImageForNode(nodeId: string, productModel: string, sourceImageUrl: string) {
  if (!sourceImageUrl) return;
  try {
    const tempUrl = await requestTempImageUrl(productModel, sourceImageUrl);
    if (!tempUrl) return;
    const node = findNode(nodeId);
    if (!node) return;
    node.imageUrl = normalizeImageUrl(tempUrl);
    renderAll();
    scheduleSave();
  } catch {
    // ignore temp image generation failure and keep original image url
  }
}

async function requestTempImageUrl(productModel: string, sourceImageUrl: string) {
  if (!sourceImageUrl) return "";
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
  pendingConnectSourceId = "";
  getButton("connectModeBtn").textContent = `连线模式：${connectMode ? "开" : "关"}`;
  setStatus(connectMode ? "连线模式已开启：请先点源节点，再点目标节点。" : "连线模式已关闭。", "success");
}

function deleteSelected() {
  if (selectedEdgeId) {
    state.edges = state.edges.filter((e) => e.id !== selectedEdgeId);
    selectedEdgeId = "";
    renderAll();
    scheduleSave();
    return;
  }
  if (selectedNodeId) {
    const id = selectedNodeId;
    state.nodes = state.nodes.filter((n) => n.id !== id);
    state.edges = state.edges.filter((e) => e.source !== id && e.target !== id);
    selectedNodeId = "";
    selectedEdgeId = "";
    pendingConnectSourceId = "";
    renderAll();
    scheduleSave();
  }
}

function clearAll() {
  state.nodes = [];
  state.edges = [];
  selectedNodeId = "";
  selectedEdgeId = "";
  pendingConnectSourceId = "";
  renderAll();
  scheduleSave();
  setStatus("已清空画布。", "success");
}

function restoreState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as GraphState;
    state.nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    state.edges = Array.isArray(parsed.edges) ? parsed.edges : [];
    state.updatedAt = String(parsed.updatedAt || "");
  } catch {
    setStatus("本地数据解析失败，已忽略旧数据。", "error");
  }
}

function saveState() {
  state.updatedAt = new Date().toISOString();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function scheduleSave() {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
  }
  saveTimer = window.setTimeout(() => {
    saveState();
    setStatus("已自动保存。", "success");
  }, 600);
}

function renderAll() {
  renderEdges();
  renderNodes();
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
    const sourceX = source.x + sourceW;
    const sourceY = source.y + sourceH / 2;
    const targetX = target.x;
    const targetY = target.y + targetH / 2;
    line.setAttribute("x1", String(sourceX));
    line.setAttribute("y1", String(sourceY));
    line.setAttribute("x2", String(targetX));
    line.setAttribute("y2", String(targetY));
    line.setAttribute("class", `edge-line${selectedEdgeId === edge.id ? " selected" : ""}`);
    line.addEventListener("click", (evt) => {
      evt.stopPropagation();
      selectedEdgeId = edge.id;
      selectedNodeId = "";
      renderAll();
    });
    edgeLayer.appendChild(line);
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
    el.className = `graph-node${productClass}${selectedNodeId === node.id ? " selected" : ""}`;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.dataset.nodeId = node.id;

    if (node.nodeType === "productHotspot") {
      el.innerHTML = `
        <div class="node-image-wrap">
          ${node.imageUrl ? `<img class="node-image" src="${escapeHtml(node.imageUrl)}" alt="${escapeHtml(node.label)}" />` : ""}
          ${renderHotspotsHtml(node.hotspots)}
        </div>
        <div class="node-title">${escapeHtml(node.label)}</div>
        <div class="node-meta">热点：${node.hotspots.length}</div>
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
      if (connectMode) {
        handleConnectClick(node.id);
        return;
      }
      selectedNodeId = node.id;
      selectedEdgeId = "";
      applyNodeToForm(node);
      renderAll();
    });

    el.addEventListener("pointerdown", (evt) => {
      if (connectMode) return;
      dragNodeId = node.id;
      dragOffsetX = evt.clientX - node.x;
      dragOffsetY = evt.clientY - node.y;
      (evt.target as HTMLElement).setPointerCapture?.(evt.pointerId);
    });

    nodeLayer.appendChild(el);
  });
}

function handleConnectClick(nodeId: string) {
  selectedNodeId = nodeId;
  selectedEdgeId = "";
  if (!pendingConnectSourceId) {
    pendingConnectSourceId = nodeId;
    setStatus("已选中源节点，请点击目标节点完成连线。", "success");
    renderAll();
    return;
  }
  if (pendingConnectSourceId === nodeId) {
    pendingConnectSourceId = "";
    setStatus("已取消连线。", "success");
    renderAll();
    return;
  }
  const exists = state.edges.some((e) => e.source === pendingConnectSourceId && e.target === nodeId);
  if (!exists) {
    state.edges.push({
      id: `edge_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      source: pendingConnectSourceId,
      target: nodeId,
    });
    scheduleSave();
  }
  pendingConnectSourceId = "";
  setStatus("连线已创建。", "success");
  renderAll();
}

function onPointerMove(evt: PointerEvent) {
  if (!dragNodeId) return;
  const node = findNode(dragNodeId);
  if (!node) return;

  const canvasRect = getCanvas().getBoundingClientRect();
  const nodeW = node.nodeType === "productHotspot" ? PRODUCT_NODE_WIDTH : NODE_WIDTH;
  const nodeH = node.nodeType === "productHotspot" ? PRODUCT_NODE_HEIGHT : NODE_HEIGHT;

  node.x = Math.max(4, Math.min(canvasRect.width - nodeW - 4, evt.clientX - dragOffsetX));
  node.y = Math.max(4, Math.min(canvasRect.height - nodeH - 4, evt.clientY - dragOffsetY));
  renderAll();
}

function onPointerUp() {
  if (!dragNodeId) return;
  dragNodeId = "";
  scheduleSave();
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

function applySelectedNodeFields() {
  const node = findNode(selectedNodeId);
  if (!node) {
    setStatus("请先选中一个模块。", "error");
    return;
  }
  node.label = getInputValue("fieldLabel") || node.label;
  node.systemName = getInputValue("fieldSystem") || node.systemName;
  node.componentDesc = getInputValue("fieldDesc");
  node.componentType = getInputValue("fieldType");
  node.componentMaterial = getInputValue("fieldMaterial");
  node.componentBrand = getInputValue("fieldBrand");
  node.componentUnit = getInputValue("fieldUnit") || "台";
  node.componentQuantity = Math.max(1, Math.round(Number(getInputValue("fieldQty")) || 1));
  node.componentUnitPrice = Math.max(0, Math.round(Number(getInputValue("fieldPrice")) || 0));
  renderAll();
  scheduleSave();
  setStatus("模块属性已更新。", "success");
}

async function importFromQuoteConfigSheet() {
  try {
    setStatus("正在读取报价配置表...", "");
    const modules = await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getItemOrNullObject(SHEET_NAMES.quoteConfig);
      sheet.load("name");
      const used = sheet.getRange("A:P").getUsedRangeOrNullObject(false);
      used.load(["values", "isNullObject", "rowIndex"]);
      await context.sync();

      if (sheet.isNullObject || used.isNullObject) {
        throw new Error("报价配置表不存在或为空，请先生成并填写配置表。");
      }

      const values = used.values || [];
      const rows = [] as Array<{ systemName: string; deviceName: string; componentCount: number; totalPrice: number }>;
      const moduleMap = new Map<string, { systemName: string; deviceName: string; componentCount: number; totalPrice: number }>();
      let currentSystem = "";
      let currentDevice = "";
      const headerSerial = String(BUILDSHEET_TEXT.configHeaders[0] || "").trim();

      values.forEach((item) => {
        const colA = String(item && item[0] ? item[0] : "").trim();
        const colB = String(item && item[1] ? item[1] : "").trim();
        const colC = String(item && item[2] ? item[2] : "").trim();
        const colP = item ? item[15] : 0;

        if (/^[一二三四五六七八九十百零]+$/.test(colA) && colB) {
          currentSystem = colB;
          currentDevice = "";
          return;
        }
        if (colA === headerSerial) {
          currentDevice = "";
          return;
        }
        if (!currentSystem) {
          return;
        }
        if (colB) {
          currentDevice = colB;
        }
        if (!currentDevice || !colC) {
          return;
        }

        const key = `${currentSystem}__${currentDevice}`;
        const exists = moduleMap.get(key);
        if (!exists) {
          moduleMap.set(key, {
            systemName: currentSystem,
            deviceName: currentDevice,
            componentCount: 1,
            totalPrice: parseNumber(colP),
          });
          return;
        }
        exists.componentCount += 1;
        exists.totalPrice += parseNumber(colP);
      });

      for (const item of moduleMap.values()) {
        rows.push(item);
      }
      return rows;
    });

    if (modules.length === 0) {
      throw new Error("未识别到可生成的模块，请确认配置表中已存在设备与组件数据。");
    }

    state.nodes = modules.map((item, i) => {
      const x = 40 + (i % 4) * 230;
      const y = 40 + Math.floor(i / 4) * 130;
      const systemName = item.systemName.replace(TITLE_PREFIX_REGEX, "").trim() || "未分类";
      return {
        id: `node_${Date.now()}_${i}`,
        nodeType: "module",
        label: item.deviceName,
        systemName,
        componentDesc: `组件数: ${item.componentCount}`,
        componentType: "",
        componentMaterial: "",
        componentBrand: "",
        componentUnit: "套",
        componentQuantity: 1,
        componentUnitPrice: Math.max(0, Math.round(item.totalPrice)),
        productModel: item.deviceName,
        imageUrl: "",
        hotspots: [],
        x,
        y,
      } as GraphNode;
    });
    state.edges = [];
    selectedNodeId = "";
    selectedEdgeId = "";
    pendingConnectSourceId = "";
    renderAll();
    scheduleSave();
    setStatus(`已从配置表生成 ${state.nodes.length} 个模块。`, "success");
  } catch (error) {
    setStatus((error as Error).message || "读取配置表失败。", "error");
  }
}

async function writeToQuoteConfigSheet() {
  try {
    if (state.nodes.length === 0) {
      throw new Error("当前没有模块，无法写入。");
    }
    setStatus("正在写入报价配置表，请稍候...", "");
    await ensureQuoteTemplate();
    const sectionRows = await getSectionRows();
    const grouped = buildComponentsGroupedBySystem();

    let insertedCount = 0;
    let skippedSystems = 0;

    for (const [systemName, components] of grouped.entries()) {
      const row = findSectionRowByName(sectionRows, systemName);
      if (!row) {
        skippedSystems += 1;
        continue;
      }
      await focusSectionRow(row);
      await insertComponentsToConfigSheet(systemName, "流程图模块", components, systemName);
      insertedCount += components.length;
    }

    if (insertedCount === 0) {
      throw new Error("未找到可写入的系统分区，请先检查系统名称是否与模板一致。");
    }

    if (skippedSystems > 0) {
      setStatus(`写入完成，已插入 ${insertedCount} 行；有 ${skippedSystems} 个系统未匹配模板分区。`, "success");
      return;
    }
    setStatus(`写入完成，已插入 ${insertedCount} 行。`, "success");
  } catch (error) {
    setStatus((error as Error).message || "写入失败。", "error");
  }
}

async function ensureQuoteTemplate() {
  const hasConfig = await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItemOrNullObject(SHEET_NAMES.quoteConfig);
    sheet.load("name");
    await context.sync();
    return !sheet.isNullObject;
  });

  if (!hasConfig) {
    await createQuotationSheet();
  }
}

async function getSectionRows() {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItemOrNullObject(SHEET_NAMES.quoteConfig);
    sheet.load("name");
    const used = sheet.getRange("A:B").getUsedRangeOrNullObject(false);
    used.load(["values", "rowIndex", "rowCount", "isNullObject"]);
    await context.sync();
    if (sheet.isNullObject || used.isNullObject) {
      return [] as Array<{ name: string; row: number }>;
    }
    const rows: Array<{ name: string; row: number }> = [];
    const values = used.values || [];
    const offset = used.rowIndex;
    values.forEach((item, idx) => {
      const aText = String(item && item[0] ? item[0] : "").trim();
      const bText = String(item && item[1] ? item[1] : "").trim();
      if (!/^[一二三四五六七八九十百零]+$/.test(aText) || !bText) return;
      rows.push({ name: bText, row: offset + idx + 1 });
    });
    return rows;
  });
}

function findSectionRowByName(rows: Array<{ name: string; row: number }>, systemName: string): number {
  const target = normalizeSystemName(systemName);
  if (!target) return 0;
  for (const row of rows) {
    const current = normalizeSystemName(row.name);
    if (current === target || current.includes(target) || target.includes(current)) {
      return row.row;
    }
  }
  return 0;
}

function normalizeSystemName(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/[、，,（）().\s]/g, "")
    .replace(/系统部分/g, "系统")
    .replace(/筛分除磁包装/g, "粉分除尘包装")
    .replace(/除尘器系统/g, "除尘系统");
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

async function focusSectionRow(row: number) {
  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(SHEET_NAMES.quoteConfig);
    sheet.activate();
    sheet.getRange(`A${row}`).select();
    await context.sync();
  });
}

function buildComponentsGroupedBySystem() {
  const upstreamByTarget = new Map<string, string[]>();
  state.edges.forEach((edge) => {
    const source = findNode(edge.source);
    if (!source) return;
    const items = upstreamByTarget.get(edge.target) || [];
    items.push(source.label);
    upstreamByTarget.set(edge.target, items);
  });

  const grouped = new Map<string, any[]>();
  const sorted = [...state.nodes].sort((a, b) => {
    const bySystem = normalizeSystemName(a.systemName).localeCompare(normalizeSystemName(b.systemName), "zh");
    if (bySystem !== 0) return bySystem;
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  sorted.forEach((node) => {
    if (node.nodeType === "productHotspot") return;

    const key = node.systemName || "未分类";
    const list = grouped.get(key) || [];
    const upstream = upstreamByTarget.get(node.id) || [];
    const relationDesc = upstream.length > 0 ? `上游: ${upstream.join("、")}` : "";
    const mergedDesc = [node.componentDesc, relationDesc].filter(Boolean).join(" | ");
    list.push({
      component_name: node.label,
      component_desc: mergedDesc,
      component_type: node.componentType,
      component_material: node.componentMaterial,
      component_brand: node.componentBrand,
      component_quantity: node.componentQuantity,
      component_unit: node.componentUnit,
      component_unitprice: node.componentUnitPrice,
      is_Assembly: 1,
    });
    grouped.set(key, list);
  });

  return grouped;
}

function findNode(id: string) {
  return state.nodes.find((n) => n.id === id);
}

function setStatus(message: string, kind: "error" | "success" | "" = "") {
  const el = document.getElementById("statusText");
  if (!el) return;
  el.textContent = message;
  el.className = kind ? `status ${kind}` : "status";
}

function getCanvas() {
  return document.getElementById("canvas") as HTMLDivElement;
}

function getNodeLayer() {
  return document.getElementById("nodeLayer") as HTMLDivElement;
}

function getEdgeLayer() {
  return document.getElementById("edgeLayer") as SVGSVGElement;
}

function getButton(id: string) {
  return document.getElementById(id) as HTMLButtonElement;
}

function getField(id: string) {
  return document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
}

function setInputValue(id: string, value: string) {
  const el = getField(id);
  el.value = value;
}

function getInputValue(id: string) {
  const el = getField(id);
  return String(el.value || "").trim();
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
  try {
    const url = new URL(String(rawUrl), window.location.origin);
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
