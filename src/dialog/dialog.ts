/* global Office, document, window, console, URL, fetch, alert */
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { API_PATHS, APP_URLS } from "../shared/appConstants";
import { DIALOG_HTML_TEXT, DIALOG_TEXT } from "../shared/businessTextConstants";
import { buildEquipmentImageUrl } from "../shared/equipmentImagePath";
import type { DialogPreviewController, PreviewItem } from "../dialog-preview/types";
import {
  DialogApp,
  DialogAnnotationItem,
  DialogCategoryItem,
  DialogDetailItem,
  DialogProjectItem,
  DialogViewState,
} from "./dialogApp";

type ApiListResponse<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
};

let dialogRoot: Root | null = null;
const dialogViewState: DialogViewState = {
  currentMaterialPreset: "lfp",
  categoryTitle: "",
  projectTitle: "",
  detailTitle: "",
  annotationTitle: "",
  previewTitle: "",
  clearAllText: "",
  confirmSubmitText: "",
  categories: [],
  categoriesLoading: true,
  categoryError: "",
  projects: [],
  projectsLoading: false,
  projectError: "",
  details: [],
  detailsLoading: false,
  detailError: "",
  annotations: [],
  annotationsLoading: false,
  annotationError: "",
  detailBaseDescription: "-",
  hoveredPreviewId: null,
  selectedCategoryId: null,
  selectedProjectId: null,
};

function renderDialogApp() {
  if (!dialogRoot) return;
  dialogViewState.currentMaterialPreset = currentMaterialPreset as any;
  dialogViewState.selectedCategoryId = currentCategoryId;
  dialogViewState.selectedProjectId = currentProjectId;
  dialogRoot.render(
    React.createElement(DialogApp, {
      state: dialogViewState,
      handlers: {
        onMaterialPresetChange: (value: any) => {
          if (value === currentMaterialPreset) return;
          currentMaterialPreset = value;
          resetSelectionState({ preserveCategory: true });
          clearRightPanels();
          if (currentCategoryId && currentCategoryName) {
            void selectCategory(currentCategoryId, currentCategoryName);
          }
        },
        onCategoryClick: (id: any, name: string) => {
          void selectCategory(id, name);
        },
        onProjectClick: (id: any, name: string) => {
          const project = dialogViewState.projects.find((item) => String(item.id) === String(id));
          void selectProject(id, name, project?.imageUrl || "", project?.baseDescription || "");
        },
        onDetailToggle: (id: any, checked: boolean) => {
          const item = dialogViewState.details.find((x) => String(x.id) === String(id));
          if (!item) return;
          toggleDetail(
            id,
            item.name,
            resolveDetailPreviewImageUrl(id),
            resolveDetailLayer(id),
            checked
          );
        },
        onAnnotationToggle: (key: string, checked: boolean) => {
          const item = dialogViewState.annotations.find((x) => x.key === key);
          if (!item) return;
          const normalized = currentNormalizedAnnotations.find((x) => x.key === key);
          if (!normalized) return;
          toggleAnnotation(
            key,
            normalized.name,
            normalized.position_x,
            normalized.position_y,
            resolvePreviewItemImageUrl(normalized),
            normalized.assembly_group,
            checked
          );
        },
        onPreviewHoverChange: (previewId: string | null) => {
          currentHighlightedComponentId = previewId;
          updateListHoverState(previewId);
          syncPreviewScene();
        },
        onClearAll: clearAll,
        onConfirmSubmit: () => void confirmData(),
      },
    })
  );
  window.requestAnimationFrame(() => {
    resizeImageArea();
    void ensurePreviewController();
  });
}

// API 配置
const API_BASE = APP_URLS.apiBase;
const IMAGE_CACHE_BUSTER = Date.now().toString(36);
// 简单缓存
const cache = {
  categories: {} as Record<string, DialogCategoryItem[]>,
  projects: {} as Record<string, ApiListResponse<DialogProjectItem[]>>, // categoryId -> projects
  details: {} as Record<string, DialogDetailItem[]>, // projectId -> details
  annotations: {} as Record<string, DialogAnnotationItem[]>, // projectId -> annotations
  config: {} as Record<string, unknown>, // projectId -> config
};

// 数据存储
let currentCategoryId = null;
let currentCategoryName = null;
let currentProjectId = null;
let currentProjectName = null;
let currentProjectBaseDescription = "";
let currentMaterialPreset = "lfp";
let selectedDetails = new Map(); // 改用 Map，key=id, value={name, imageUrl, layer}
let selectedAnnotations = new Map(); // key=id, value={name, posX, posY, imageUrl, assemblyGroup}
let currentDetailRecords: any[] = [];
let currentNormalizedAnnotations: any[] = [];

// 预览相关变量
let previewController: DialogPreviewController | null = null;
let previewModuleLoading: Promise<void> | null = null;
let components = {}; // 存储所有组件数据 {id: {name, visible, layer, imageUrl, group}}
let currentHighlightedComponentId = null;
let currentBaseImageUrl = "";
const MAX_COMPOSITE_DATAURL_CHARS = 1200000; // 约 0.9MB 原始字节，避免 Excel 写入过大触发内部错误

function buildPreviewItems(): PreviewItem[] {
  return Object.values(components)
    .filter((comp: any) => comp && comp.visible)
    .sort((a: any, b: any) => Number(a.layer || 0) - Number(b.layer || 0))
    .map((comp: any) => ({
      id: String(comp.id),
      name: String(comp.name || comp.id || ""),
      group: comp.group === "annotation" ? "annotation" : "detail",
      imageUrl: comp.imageUrl || null,
      order: Number(comp.layer || 0),
      visible: true,
      assemblyGroup: comp.assemblyGroup ?? null,
    }));
}

function syncPreviewScene(placeholderMessage?: string) {
  if (!previewController) return;
  previewController.setScene({
    baseImageUrl: currentBaseImageUrl || null,
    items: buildPreviewItems(),
    placeholder: placeholderMessage || null,
    highlightedItemId: currentHighlightedComponentId || null,
  });
}

function updateListHoverState(hoveredId?: string | null) {
  dialogViewState.hoveredPreviewId = hoveredId ? String(hoveredId) : null;
  renderDialogApp();
}

function togglePreviewItemById(itemId: string) {
  const detailItem = dialogViewState.details.find((item) => String(item.id) === String(itemId));
  if (detailItem) {
    if (!detailItem.required) {
      toggleDetail(
        detailItem.id,
        detailItem.name,
        resolveDetailPreviewImageUrl(detailItem.id),
        resolveDetailLayer(detailItem.id),
        !detailItem.checked
      );
    }
    return;
  }
  const annotationItem = dialogViewState.annotations.find(
    (item) => String(item.key) === String(itemId)
  );
  if (annotationItem) {
    const normalized = currentNormalizedAnnotations.find(
      (item) => String(item.key) === String(itemId)
    );
    if (!normalized) return;
    toggleAnnotation(
      annotationItem.key,
      normalized.name,
      normalized.position_x,
      normalized.position_y,
      resolvePreviewItemImageUrl(normalized),
      normalized.assembly_group,
      !annotationItem.checked
    );
  }
}

function scheduleRender(highlightId) {
  currentHighlightedComponentId = highlightId ? String(highlightId) : null;
  syncPreviewScene();
}

async function ensurePreviewController() {
  if (previewController) return;
  if (previewModuleLoading) {
    await previewModuleLoading;
    return;
  }
  previewModuleLoading = (async () => {
    const previewMount = document.getElementById("previewStageMount");
    if (!previewMount) return;
    const module = await import(
      /* webpackChunkName: "dialog-preview" */
      "../dialog-preview/dialogPreviewController"
    );
    previewController = module.mountDialogPreview(previewMount, {
      onHoverItemId: (itemId) => updateListHoverState(itemId),
      onClickItemId: (itemId) => togglePreviewItemById(itemId),
    });
    resizeImageArea();
    syncPreviewScene(DIALOG_TEXT.selectProjectPlaceholder);
  })();
  try {
    await previewModuleLoading;
  } finally {
    previewModuleLoading = null;
  }
}

function resizeImageArea() {
  const imageContainer = document.getElementById("imageContainer");
  const rightPanel = imageContainer ? imageContainer.parentElement : null;
  if (!imageContainer || !rightPanel) return;

  const titleEl = rightPanel.querySelector(".panel-title");
  const actionsEl = rightPanel.querySelector(".action-buttons");
  const titleHeight = titleEl instanceof HTMLElement ? titleEl.offsetHeight : 0;
  const actionsHeight = actionsEl instanceof HTMLElement ? actionsEl.offsetHeight : 0;

  const availableHeight = Math.max(200, rightPanel.clientHeight - titleHeight - actionsHeight - 12);
  const availableWidth = Math.max(200, rightPanel.clientWidth);
  const size = Math.min(availableWidth, availableHeight);

  imageContainer.style.width = `${size}px`;
  imageContainer.style.height = `${size}px`;

  previewController?.resize({ width: size, height: size });
  syncPreviewScene();
}

// 初始化
Office.onReady(() => {
  const rootEl = document.getElementById("root");
  if (rootEl && !dialogRoot) {
    dialogRoot = createRoot(rootEl);
  }
  applyStaticText();
  window.addEventListener("resize", resizeImageArea);
  showCanvasPlaceholder(DIALOG_TEXT.selectProjectPlaceholder);
  renderDialogApp();
  loadCategories();
});

function buildApiUrl(path: string) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (currentMaterialPreset) {
    url.searchParams.set("industryType", currentMaterialPreset);
  }
  return `${url.pathname}${url.search}`;
}

function resetSelectionState(options?: { preserveCategory?: boolean }) {
  if (!options?.preserveCategory) {
    currentCategoryId = null;
    currentCategoryName = null;
    dialogViewState.selectedCategoryId = null;
  }
  currentProjectId = null;
  currentProjectName = null;
  currentProjectBaseDescription = "";
  selectedDetails.clear();
  selectedAnnotations.clear();
  dialogViewState.selectedProjectId = null;
  updateListHoverState(null);
  renderDialogApp();
}

function applyStaticText() {
  document.title = DIALOG_HTML_TEXT.title;
  setText("categoryTitle", DIALOG_HTML_TEXT.categoryTitle);
  setText("projectTitle", DIALOG_HTML_TEXT.projectTitle);
  setText("detailTitle", DIALOG_HTML_TEXT.detailTitle);
  setText("annotationTitle", DIALOG_HTML_TEXT.annotationTitle);
  setText("previewTitle", DIALOG_HTML_TEXT.previewTitle);
  setText("categoryLoadingText", DIALOG_TEXT.loading);
  setText("clearAllBtn", DIALOG_HTML_TEXT.clearAll);
  setText("confirmSubmitBtn", DIALOG_HTML_TEXT.confirmSubmit);
}

function setText(id: string, text: string) {
  if (id === "categoryTitle") dialogViewState.categoryTitle = text;
  if (id === "projectTitle") dialogViewState.projectTitle = text;
  if (id === "detailTitle") dialogViewState.detailTitle = text;
  if (id === "annotationTitle") dialogViewState.annotationTitle = text;
  if (id === "previewTitle") dialogViewState.previewTitle = text;
  if (id === "clearAllBtn") dialogViewState.clearAllText = text;
  if (id === "confirmSubmitBtn") dialogViewState.confirmSubmitText = text;
  renderDialogApp();
}

// 1. 加载产品类型（带缓存）
async function loadCategories(options?: {
  preserveCategoryId?: number | null;
  preserveCategoryName?: string | null;
}) {
  dialogViewState.categoriesLoading = true;
  dialogViewState.categoryError = "";
  renderDialogApp();
  if (cache.categories.default) {
    displayCategories(cache.categories.default, options);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}${API_PATHS.categories}`);
    const result = await response.json();

    if (result.success) {
      cache.categories.default = result.data; // 缓存
      displayCategories(result.data, options);
    } else {
      console.error(`${DIALOG_TEXT.loadCategoryFailed}:`, result.error || result.message);
      showError(
        `${DIALOG_TEXT.loadCategoryFailed}: ` +
          (result.error || result.message || DIALOG_TEXT.unknownError)
      );
    }
  } catch (error) {
    console.error(`${DIALOG_TEXT.loadCategoryFailed}:`, error);
    const message = error instanceof Error ? error.message : String(error);
    showError(`${DIALOG_TEXT.dbConnectFailed}: ${message}`);
  }
}

// 2. 显示产品类型列表
function displayCategories(
  categories,
  options?: { preserveCategoryId?: number | null; preserveCategoryName?: string | null }
) {
  dialogViewState.categoriesLoading = false;
  dialogViewState.categoryError = "";
  dialogViewState.categories = (categories || []).map((category: any) => ({
    id: category.id,
    name: category.name,
  })) as DialogCategoryItem[];

  if (categories.length === 0) {
    resetSelectionState();
    dialogViewState.projects = [];
    clearRightPanels();
    renderDialogApp();
    return;
  }

  const preservedCategory = (categories || []).find(
    (category) =>
      (options?.preserveCategoryId && Number(category.id) === Number(options.preserveCategoryId)) ||
      (options?.preserveCategoryName &&
        String(category.name || "").trim() === String(options.preserveCategoryName || "").trim())
  );

  if (preservedCategory) {
    void selectCategory(preservedCategory.id, preservedCategory.name);
    return;
  }

  dialogViewState.projects = [];
  clearRightPanels();
  renderDialogApp();
}

// 3. 选择产品类型 → 加载产品型号
async function selectCategory(categoryId, categoryName) {
  currentCategoryId = categoryId;
  currentCategoryName = categoryName;
  currentProjectId = null;
  currentProjectName = null;
  currentProjectBaseDescription = "";
  selectedDetails.clear();
  selectedAnnotations.clear();
  dialogViewState.selectedCategoryId = categoryId;
  dialogViewState.selectedProjectId = null;

  // 加载产品型号列表（带缓存）
  dialogViewState.projectsLoading = true;
  dialogViewState.projectError = "";
  dialogViewState.projects = [];
  renderDialogApp();

  try {
    // 检查缓存
    const cacheKey = `${currentMaterialPreset}:${categoryId}`;
    let result = cache.projects[cacheKey];
    if (!result) {
      const response = await fetch(buildApiUrl(`${API_PATHS.projects}/${categoryId}`));
      const data = await response.json();
      if (data.success) {
        result = data;
        cache.projects[cacheKey] = data; // 缓存
      }
    }

    if (result && result.success) {
      displayProjects(result.data);
    } else {
      console.error(`${DIALOG_TEXT.loadProjectFailed}:`, result?.error || result?.message);
      dialogViewState.projectsLoading = false;
      dialogViewState.projectError = `${DIALOG_TEXT.loadProjectFailed}: ${result?.error || result?.message || DIALOG_TEXT.unknownError}`;
      renderDialogApp();
    }
  } catch (error) {
    console.error(`${DIALOG_TEXT.loadProjectFailed}:`, error);
    dialogViewState.projectsLoading = false;
    const message = error instanceof Error ? error.message : String(error);
    dialogViewState.projectError = `${DIALOG_TEXT.loadFailed}: ${message}`;
    renderDialogApp();
  }

  clearRightPanels();
}

// 4. 显示产品型号列表
function displayProjects(projects) {
  dialogViewState.projectsLoading = false;
  dialogViewState.projectError = "";
  dialogViewState.projects = (projects || []).map((project: any) => ({
    id: project.id,
    name: project.name,
    imageUrl: project.image_url,
    baseDescription: project.base_description,
  })) as DialogProjectItem[];

  renderDialogApp();
}

// 5. 选择产品型号 → 加载组件详情
async function selectProject(projectId, projectName, imageUrl, baseDescription) {
  if (!currentCategoryId) return;

  currentProjectId = projectId;
  currentProjectName = projectName;
  currentProjectBaseDescription = String(baseDescription || "");
  selectedDetails.clear();
  selectedAnnotations.clear();
  setDetailBaseDescription(currentProjectBaseDescription);
  dialogViewState.selectedProjectId = projectId;
  dialogViewState.detailsLoading = true;
  dialogViewState.annotationsLoading = true;
  dialogViewState.detailError = "";
  dialogViewState.annotationError = "";
  dialogViewState.details = [];
  dialogViewState.annotations = [];
  renderDialogApp();

  // 显示加载状态
  showCanvasPlaceholder(DIALOG_TEXT.selectProductPlaceholder);
  Object.keys(components).forEach((id) => removeComponentFromCanvas(id));
  selectedDetails.clear();
  selectedAnnotations.clear();
  scheduleRender(currentHighlightedComponentId);

  try {
    // 并行加载详细信息和标注
    const [detailsRes, annotationsRes, configRes] = await Promise.all([
      fetch(buildApiUrl(`${API_PATHS.details}/${projectId}`)),
      fetch(buildApiUrl(`${API_PATHS.annotations}/${projectId}`)),
      fetch(buildApiUrl(`${API_PATHS.config}/${projectId}`)),
    ]);

    const detailsResult = await detailsRes.json();
    const annotationsResult = await annotationsRes.json();
    const configResult = await configRes.json();

    if (detailsResult.success) {
      displayDetails(detailsResult.data);
    } else {
      console.error(`${DIALOG_TEXT.loadDetailsFailed}:`, detailsResult);
      dialogViewState.detailsLoading = false;
      dialogViewState.detailError = DIALOG_TEXT.loadComponentFailed;
    }

    if (annotationsResult.success) {
      displayAnnotations(annotationsResult.data);
    } else {
      console.error(`${DIALOG_TEXT.loadAnnotationsFailed}:`, annotationsResult);
      dialogViewState.annotationsLoading = false;
      dialogViewState.annotationError = DIALOG_TEXT.loadAccessoryFailed;
    }

    // 尝试从配置中获取图片
    if (configResult.success && configResult.data && configResult.data.length > 0) {
      // 查找有component_pic的记录
      const componentsWithPic = configResult.data.filter(
        (item) => item.component_pic && item.component_pic.trim() !== ""
      );

      if (componentsWithPic.length > 0) {
        // 优先使用component_sn=1的组件图片
        const mainComponent =
          componentsWithPic.find((comp) => comp.component_sn === 1) || componentsWithPic[0];
        const realImageUrl =
          normalizeImageUrl(mainComponent.image_url) || getImageUrl(mainComponent.component_pic);
        if (realImageUrl) {
          displayImage(realImageUrl);
        } else {
          displayPlaceholderImage(projectName);
        }
      } else {
        displayPlaceholderImage(projectName);
      }
    } else {
      displayPlaceholderImage(projectName);
    }
  } catch (error) {
    console.error(`${DIALOG_TEXT.loadProjectDetailFailed}:`, error);
    dialogViewState.detailsLoading = false;
    dialogViewState.annotationsLoading = false;
    dialogViewState.detailError = DIALOG_TEXT.loadFailed;
    dialogViewState.annotationError = DIALOG_TEXT.loadFailed;
    renderDialogApp();
    displayPlaceholderImage(projectName);
  }
}

// 新增：图片路径处理函数
function getImageUrl(componentPic) {
  const url = buildEquipmentImageUrl(componentPic);
  if (!url) return null;
  const normalized = new URL(url, window.location.origin);
  normalized.searchParams.set("v", IMAGE_CACHE_BUSTER);
  return normalized.toString();
}

// 统一处理后端返回的 image_url（协议、中文编码）
function normalizeImageUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl, window.location.origin);
    // 强制与当前页面一致的协议（https）
    url.protocol = window.location.protocol;
    // 仅编码路径中的文件名部分
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
  } catch (e) {
    return getImageUrl(rawUrl);
  }
}

function resolvePreviewItemImageUrl(item) {
  if (item?.image_url) {
    return normalizeImageUrl(item.image_url);
  }
  if (item?.component_pic) {
    return getImageUrl(item.component_pic);
  }
  return null;
}

function resolveDetailRecord(detailId) {
  return (currentDetailRecords || []).find((item) => String(item.id) === String(detailId)) || null;
}

function resolveDetailPreviewImageUrl(detailId) {
  const record = resolveDetailRecord(detailId);
  return record ? resolvePreviewItemImageUrl(record) : null;
}

function resolveDetailLayer(detailId) {
  const record = resolveDetailRecord(detailId);
  return record ? Number(record.component_sn || 0) : 0;
}

function addPreviewSelection(targetMap, itemId, previewData, layerOrder, group = "detail") {
  targetMap.set(itemId, previewData);
  addComponentToCanvas(
    itemId,
    previewData.name,
    previewData.imageUrl,
    layerOrder,
    group,
    previewData.assemblyGroup
  );
}

function removePreviewSelection(targetMap, itemId) {
  targetMap.delete(itemId);
  removeComponentFromCanvas(itemId);
}

// 6. 显示组件信息（多选，必选项自动选中）
function displayDetails(details) {
  currentDetailRecords = details || [];
  dialogViewState.detailsLoading = false;
  dialogViewState.detailError = "";

  if (details.length === 0) {
    dialogViewState.details = [];
    renderDialogApp();
    return;
  }
  dialogViewState.details = details.map((detail, index) => {
    const imageUrl = resolvePreviewItemImageUrl(detail);
    if (detail.is_required === 1) {
      addPreviewSelection(
        selectedDetails,
        detail.id,
        {
          name: detail.name,
          imageUrl: imageUrl,
          layer: detail.component_sn || index,
        },
        detail.component_sn || index,
        "detail"
      );
    }
    return {
      id: detail.id,
      name: detail.name,
      checked: detail.is_required === 1 || selectedDetails.has(detail.id),
      required: detail.is_required === 1,
      previewId: String(detail.id),
    } as DialogDetailItem;
  });
  renderDialogApp();
}

// 7. 显示配件信息（多选）
function displayAnnotations(annotations) {
  dialogViewState.annotationsLoading = false;
  dialogViewState.annotationError = "";

  if (annotations.length === 0) {
    dialogViewState.annotations = [];
    currentNormalizedAnnotations = [];
    renderDialogApp();
    return;
  }

  const normalized = normalizeAnnotations(annotations);
  currentNormalizedAnnotations = normalized;

  if (normalized.length === 0) {
    dialogViewState.annotations = [];
    renderDialogApp();
    return;
  }
  dialogViewState.annotations = normalized.map((annotation) => ({
    key: annotation.key,
    name: annotation.name,
    checked: selectedAnnotations.has(annotation.key),
    previewId: String(annotation.key),
  })) as DialogAnnotationItem[];
  renderDialogApp();
}

// 合并重复的标注项（按名称），优先保留有图片/坐标的记录
function normalizeAnnotations(annotations) {
  const map = new Map();
  annotations.forEach((anno) => {
    const groupKey = Number(anno.assembly_group || 0);
    const idKey = String(anno.id || "").trim();
    const key =
      groupKey > 0
        ? `group_${groupKey}`
        : idKey ||
          ((anno.name || "").trim()
            ? `${(anno.name || "").trim()}_${groupKey}`
            : `__idx_${map.size}`);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...anno, key, assembly_group: groupKey });
      return;
    }

    const existingAssemblyValue = Number(existing.is_Assembly || 0);
    const candidateAssemblyValue = Number(anno.is_Assembly || 0);
    if (
      groupKey > 0 &&
      candidateAssemblyValue > 0 &&
      (existingAssemblyValue <= 0 || candidateAssemblyValue < existingAssemblyValue)
    ) {
      existing.id = anno.id;
      existing.name = anno.name;
      existing.is_Assembly = anno.is_Assembly;
    }

    const existingHasImage = !!(existing.image_url || existing.component_pic);
    const candidateHasImage = !!(anno.image_url || anno.component_pic);
    if (!existingHasImage && candidateHasImage) {
      existing.image_url = anno.image_url;
      existing.component_pic = anno.component_pic;
      existing.id = anno.id;
    }

    if (
      (existing.position_x === null ||
        existing.position_x === undefined ||
        existing.position_x === "") &&
      anno.position_x !== null &&
      anno.position_x !== undefined &&
      anno.position_x !== ""
    ) {
      existing.position_x = anno.position_x;
    }

    if (
      (existing.position_y === null ||
        existing.position_y === undefined ||
        existing.position_y === "") &&
      anno.position_y !== null &&
      anno.position_y !== undefined &&
      anno.position_y !== ""
    ) {
      existing.position_y = anno.position_y;
    }

    if (!existing.assembly_group && groupKey > 0) {
      existing.assembly_group = groupKey;
    }
  });
  return Array.from(map.values());
}

// 8. 切换组件选择
function toggleDetail(detailId, detailName, imageUrl, layer, isChecked) {
  if (isChecked) {
    addPreviewSelection(
      selectedDetails,
      detailId,
      {
        name: detailName,
        imageUrl: imageUrl,
        layer: layer,
      },
      layer,
      "detail"
    );
  } else {
    removePreviewSelection(selectedDetails, detailId);
  }

  // 防抖渲染
  dialogViewState.details = dialogViewState.details.map((item) =>
    String(item.id) === String(detailId) ? { ...item, checked: isChecked || item.required } : item
  );
  renderDialogApp();
  scheduleRender(currentHighlightedComponentId);
}

// 9. 预览相关函数
function addComponentToCanvas(
  componentId,
  componentName,
  imageUrl,
  layer,
  group = "detail",
  assemblyGroup = null
) {
  if (!imageUrl) return;
  const existing = components[componentId] || {};
  components[componentId] = {
    ...existing,
    id: componentId,
    name: componentName,
    imageUrl,
    layer,
    visible: true,
    group,
    assemblyGroup,
  };
  scheduleRender(currentHighlightedComponentId);
}

function removeComponentFromCanvas(componentId) {
  delete components[componentId];
  scheduleRender(currentHighlightedComponentId);
}

function showCanvasPlaceholder(message) {
  currentBaseImageUrl = "";
  syncPreviewScene(message);
}

// 11. 显示占位图片
function displayPlaceholderImage(projectName) {
  currentBaseImageUrl = "";
  syncPreviewScene(`${projectName} ${DIALOG_TEXT.noProductImage}`);
}

// 12. 显示图片（用于产品主图）
function displayImage(imageUrl) {
  currentBaseImageUrl = imageUrl || "";
  syncPreviewScene();
}

// 12. 切换配件信息
function toggleAnnotation(
  annotationKey,
  annotationName,
  posX,
  posY,
  imageUrl,
  assemblyGroup,
  isChecked
) {
  if (isChecked) {
    addPreviewSelection(
      selectedAnnotations,
      annotationKey,
      {
        name: annotationName,
        posX,
        posY,
        imageUrl,
        assemblyGroup: Number(assemblyGroup || 0),
      },
      posX || 0,
      "annotation"
    );
  } else {
    removePreviewSelection(selectedAnnotations, annotationKey);
  }

  dialogViewState.annotations = dialogViewState.annotations.map((item) =>
    String(item.key) === String(annotationKey) ? { ...item, checked: isChecked } : item
  );
  renderDialogApp();
  scheduleRender(currentHighlightedComponentId);
}

function setDetailBaseDescription(text) {
  const normalized = String(text || "").trim();
  dialogViewState.detailBaseDescription = normalized || "-";
  renderDialogApp();
}

// 13. 清空右侧面板
function clearRightPanels() {
  dialogViewState.details = [];
  dialogViewState.annotations = [];
  dialogViewState.detailsLoading = false;
  dialogViewState.annotationsLoading = false;
  dialogViewState.detailError = "";
  dialogViewState.annotationError = "";
  setDetailBaseDescription("");
  components = {};
  currentHighlightedComponentId = null;
  showCanvasPlaceholder(DIALOG_TEXT.selectProductPlaceholder);
  renderDialogApp();
}

// 17. 清除全部
function clearAll() {
  currentCategoryId = null;
  currentCategoryName = null;
  currentProjectId = null;
  currentProjectName = null;
  currentProjectBaseDescription = "";
  selectedDetails.clear();
  selectedAnnotations.clear();

  dialogViewState.selectedCategoryId = null;
  dialogViewState.selectedProjectId = null;
  dialogViewState.projects = [];
  clearRightPanels();
  renderDialogApp();
}

// 18. 显示错误
function showError(message) {
  dialogViewState.categoriesLoading = false;
  dialogViewState.categoryError = message;
  renderDialogApp();
}

function exportCompositeImageDataUrl() {
  return previewController?.exportCompositeImageDataUrl(MAX_COMPOSITE_DATAURL_CHARS) || null;
}

// 19. 确认提交
async function confirmData() {
  if (!currentCategoryId || !currentProjectId) {
    console.warn(DIALOG_TEXT.needSelectCategoryAndProject);
    alert(DIALOG_TEXT.needSelectCategoryAndProject);
    return;
  }

  if (selectedDetails.size === 0) {
    console.warn(DIALOG_TEXT.needSelectAtLeastOneDetail);
    alert(DIALOG_TEXT.needSelectAtLeastOneDetail);
    return;
  }

  // 获取合成图片（如果有）
  let compositeImageBase64 = null;
  try {
    compositeImageBase64 = exportCompositeImageDataUrl();
    if (compositeImageBase64) {
      console.log(`${DIALOG_TEXT.exportedCompositeImage}:`, compositeImageBase64.length);
    }
  } catch (error) {
    console.error(`${DIALOG_TEXT.exportCompositeImageFailed}:`, error);
  }

  const result = {
    categoryId: currentCategoryId,
    category: currentCategoryName,
    projectId: currentProjectId,
    project: currentProjectName,
    materialPreset: currentMaterialPreset,
    details: Array.from(selectedDetails.entries()).map(([id, data]) => ({ id, name: data.name })),
    annotations: Array.from(selectedAnnotations.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      assemblyGroup: Number(data.assemblyGroup || 0),
    })),
    compositeImage: compositeImageBase64, // 添加合成图片
  };

  // 由 taskpane 统一持久化到 _graph_store_dev，避免对同一次提交重复写入/覆盖。

  console.log(`${DIALOG_TEXT.submitData}:`, {
    [DIALOG_TEXT.summaryCategory]: result.category,
    [DIALOG_TEXT.summaryProject]: result.project,
    [DIALOG_TEXT.summarySelectedDetailCount]: result.details.length + DIALOG_TEXT.countSuffix,
    [DIALOG_TEXT.summarySelectedAnnotationCount]:
      result.annotations.length + DIALOG_TEXT.countSuffix,
    [DIALOG_TEXT.summaryHasCompositeImage]: !!compositeImageBase64,
  });

  // 发送给父窗口
  Office.context.ui.messageParent(JSON.stringify(result));
}

// 暴露函数到全局作用域，供 HTML onclick 使用
(window as any).confirmData = confirmData;
(window as any).clearAll = clearAll;
