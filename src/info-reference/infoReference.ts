/* global Office, console, document, window, URL, fetch, HTMLDivElement, HTMLTableSectionElement, HTMLTableElement */

import { API_PATHS, APP_URLS } from "../shared/appConstants";

type DeviceRow = {
  cToP: string[];
};

type DeviceItem = {
  id: string;
  systemName: string;
  deviceName: string;
  rows: DeviceRow[];
};

type DevicesPayload = {
  devices: DeviceItem[];
  columnWidths: number[];
};

type WarehouseStatRow = Record<string, unknown>;
type MetaInfoRow = {
  project_name: string;
  project_code: string;
  device_name: string;
  device_drawing_no: string;
  tag_no: string;
  order_qty: string;
  order_unit: string;
  surface_process: string;
  vendor_name: string;
};

let deviceItems: DeviceItem[] = [];
let warehouseRows: WarehouseStatRow[] = [];
let warehouseMetaBySheet: Record<string, MetaInfoRow> = {};
let quoteCostByComponent = new Map<string, number>();
let selectedDeviceIndex = -1;
let selectedWarehouseKey = "";
const INFO_REF_DEBUG_PREFIX = "[InfoReferenceDebug]";
const INFO_REF_REQUEST_DEVICES_MSG = "info_reference_request_devices";
const INFO_REF_DEVICES_MSG = "info_reference_devices";
const INFO_REF_ERROR_MSG = "info_reference_error";
const EXCLUDED_CATEGORIES = new Set(["标准件", "外购件"]);
// Quote table C..P columns with J/K, N, O/P removed.
const DISPLAY_COLUMN_INDEXES = [0, 1, 2, 3, 4, 5, 6, 9, 10];

function debugLog(step: string, extra?: unknown) {
  try {
    if (extra === undefined) {
      console.log(`${INFO_REF_DEBUG_PREFIX} ${step}`);
    } else {
      console.log(`${INFO_REF_DEBUG_PREFIX} ${step}`, extra);
    }
  } catch {
    // ignore log failures
  }
}

debugLog("module loaded");

Office.onReady(() => {
  debugLog("Office.onReady fired");
  void initialize();
});

async function initialize() {
  debugLog("initialize start");
  bindEvents();
  bindParentMessageEvents();
  await loadDevices();
  debugLog("initialize done");
}

function bindEvents() {
  const deviceList = getDeviceList();
  const warehouseList = getWarehouseList();

  bindListboxWheelSelection(warehouseList, "warehouse");
  bindListboxWheelSelection(deviceList, "device");
}

function bindListboxWheelSelection(list: HTMLDivElement, kind: "device" | "warehouse") {
  list.addEventListener(
    "wheel",
    (event) => {
      const warehouseKeys = getWarehouseKeys();
      const total = kind === "device" ? deviceItems.length : warehouseKeys.length;
      if (total <= 0) return;
      const current = Math.max(
        0,
        kind === "device"
          ? selectedDeviceIndex
          : warehouseKeys.findIndex((x) => x === selectedWarehouseKey)
      );
      const step = event.deltaY > 0 ? 1 : -1;
      const next = Math.max(0, Math.min(total - 1, current + step));
      if (next === current) {
        event.preventDefault();
        return;
      }
      if (kind === "device") {
        selectDeviceByIndex(next);
      } else {
        selectWarehouseKey(warehouseKeys[next] || "");
      }
      event.preventDefault();
    },
    { passive: false }
  );
}

async function loadDevices() {
  debugLog("loadDevices start");
  setStatus("正在读取报价配置表...");
  try {
    Office.context.ui.messageParent(
      JSON.stringify({
        type: INFO_REF_REQUEST_DEVICES_MSG,
      })
    );
    debugLog("request devices message sent to parent");
  } catch (error: any) {
    debugLog("failed to send request_devices message", error);
    setStatus(`读取设备失败：${String(error?.message || error)}`, true);
  }
}

function bindParentMessageEvents() {
  Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, (arg: any) => {
    try {
      const payload = JSON.parse(String(arg?.message || "{}"));
      debugLog("received parent message", payload?.type);
      if (payload?.type === INFO_REF_DEVICES_MSG) {
        const data = payload?.data;
        const normalized: DevicesPayload = Array.isArray(data)
          ? { devices: data as DeviceItem[], columnWidths: [] }
          : {
              devices: Array.isArray(data?.devices) ? (data.devices as DeviceItem[]) : [],
              columnWidths: Array.isArray(data?.columnWidths)
                ? (data.columnWidths as number[])
                : [],
            };
        deviceItems = normalized.devices;
        applyQuoteTableColumnWidths(normalized.columnWidths);
        applyDbTableColumnWidths(normalized.columnWidths);
        renderDeviceList(deviceItems);
        if (!deviceItems.length) {
          setStatus("报价配置表未识别到设备。", true);
          return;
        }
        selectDeviceByIndex(0);
        return;
      }
      if (payload?.type === INFO_REF_ERROR_MSG) {
        setStatus(`读取设备失败：${String(payload?.message || "未知错误")}`, true);
      }
    } catch (error: any) {
      debugLog("failed to parse parent message", error);
      setStatus(`读取设备失败：${String(error?.message || error)}`, true);
    }
  });
}

async function handleDeviceChanged() {
  const idx = selectedDeviceIndex;
  const item = idx >= 0 ? deviceItems[idx] : null;
  if (!item) {
    renderQuoteRows([]);
    renderWarehouseList([]);
    renderDbDetail([]);
    renderDbMeta(null);
    return;
  }

  renderQuoteRows(item.rows);
  setStatus(`已选择设备：${item.deviceName}，正在查询仓库匹配...`);
  try {
    const result = await searchWarehouseByKeyword(item.deviceName);
    warehouseRows = result.rows;
    warehouseMetaBySheet = result.metaBySheet;
    renderWarehouseList(result.rows);
    const keys = getWarehouseKeys();
    if (keys.length > 0) {
      selectWarehouseKey(keys[0]);
    } else {
      selectedWarehouseKey = "";
      renderDbDetailForSelected();
    }
    if (result.rows.length === 0) setStatus("仓库中未找到匹配数据。");
  } catch (error: any) {
    renderWarehouseList([]);
    renderDbDetail([]);
    renderDbMeta(null);
    setStatus(`仓库查询失败：${String(error?.message || error)}`, true);
  }
}

function renderDeviceList(items: DeviceItem[]) {
  const list = getDeviceList();
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = `<div class="listbox-placeholder">暂无设备</div>`;
    return;
  }
  items.forEach((item, idx) => {
    const div = document.createElement("div");
    div.className = "listbox-item";
    div.textContent = item.deviceName;
    div.dataset.id = item.id;
    div.onclick = () => selectDeviceByIndex(idx);
    list.appendChild(div);
  });
  refreshDeviceSelectionUI();
}

function renderWarehouseList(rows: Array<Record<string, unknown>>) {
  const list = getWarehouseList();
  list.innerHTML = "";
  const sheetNames = Array.from(
    new Set(
      rows
        .map((row) => pickText(row, ["sheet_name"]))
        .map((x) => x.trim())
        .filter(Boolean)
    )
  );
  if (!sheetNames.length) {
    list.innerHTML = `<div class="listbox-placeholder">暂无历史相关产品</div>`;
    return;
  }
  sheetNames.forEach((sheetName) => {
    const div = document.createElement("div");
    div.className = "listbox-item";
    div.dataset.key = sheetName;
    div.textContent = buildWarehouseGroupLabel(sheetName);
    div.onclick = () => selectWarehouseKey(sheetName);
    list.appendChild(div);
  });
  refreshWarehouseSelectionUI();
}

function renderQuoteRows(rows: DeviceRow[]) {
  const tbody = document.querySelector("#quoteTable tbody") as HTMLTableSectionElement;
  tbody.innerHTML = "";
  quoteCostByComponent = buildQuoteCostMap(rows);
  let costTotalSum = 0;
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = DISPLAY_COLUMN_INDEXES.map(
      (i) => `<td>${escapeHtml(formatNumericText(row.cToP[i]))}</td>`
    ).join("");
    tbody.appendChild(tr);
    costTotalSum += parseNumber(row.cToP[10]);
  });
  if (rows.length) {
    const sumTr = document.createElement("tr");
    sumTr.className = "sum-row";
    sumTr.innerHTML = `
      <td colspan="8">成本合计汇总</td>
      <td class="sum-price">${escapeHtml(formatNumericText(costTotalSum))}</td>
    `;
    tbody.appendChild(sumTr);
  }
}

function applyQuoteTableColumnWidths(widths: number[]) {
  applyTableColumnWidths("quoteTable", widths);
}

function applyDbTableColumnWidths(widths: number[]) {
  applyTableColumnWidths("dbDetailTable", widths);
}

function applyTableColumnWidths(tableId: string, widths: number[]) {
  const table = document.getElementById(tableId) as HTMLTableElement | null;
  if (!table) return;
  let colgroup = table.querySelector("colgroup");
  if (!colgroup) {
    colgroup = document.createElement("colgroup");
    table.insertBefore(colgroup, table.firstChild);
  }
  colgroup.innerHTML = "";
  const totalColumns = DISPLAY_COLUMN_INDEXES.length;
  const normalized = DISPLAY_COLUMN_INDEXES.map((sourceIdx) => {
    const i = Number(sourceIdx);
    const n = Number(widths?.[i] || 0);
    return n > 0 ? n : 1;
  });
  const sum = normalized.reduce((acc, n) => acc + n, 0) || totalColumns;
  for (let i = 0; i < totalColumns; i += 1) {
    const col = document.createElement("col");
    const pct = (normalized[i] / sum) * 100;
    col.style.width = `${pct}%`;
    colgroup.appendChild(col);
  }
}

function renderDbDetailForSelected() {
  const selectedKey = String(selectedWarehouseKey || "").trim();
  if (!warehouseRows.length) {
    renderDbDetail([]);
    renderDbMeta(null);
    return;
  }
  if (!selectedKey) {
    const prepared = prepareHistoryRows(warehouseRows);
    renderDbDetail(prepared);
    renderDbMeta(resolveMetaForRows(prepared));
    return;
  }
  const filtered = warehouseRows.filter((row) => buildWarehouseGroupKey(row) === selectedKey);
  const prepared = prepareHistoryRows(filtered.length ? filtered : warehouseRows);
  renderDbDetail(prepared);
  renderDbMeta(resolveMetaForRows(prepared));
}

type DbDisplayRow = {
  componentName: string;
  contentSpec: string;
  model: string;
  material: string;
  brand: string;
  componentQuantity: string;
  componentUnit: string;
  quantity: string;
  unit: string;
  costUnitPrice: string;
  costTotal: string;
  total: string;
  unitPrice: string;
  grandTotal: string;
};

const DB_DETAIL_COLUMN_COUNT = 9;

type DbDisplayRowLegacy = {
  category: string;
  name: string;
  desc: string;
  model: string;
  material: string;
  brand: string;
  quantity: string;
  unit: string;
  price: string;
};

function renderDbDetail(rows: Array<Record<string, unknown>>) {
  const tbody = document.querySelector("#dbDetailTable tbody") as HTMLTableSectionElement;
  tbody.innerHTML = "";

  const normalized = rows
    .map(normalizeWarehouseRow)
    .filter((x) => !!x.componentName || !!x.contentSpec || !!x.model || !!x.material || !!x.brand);
  if (!normalized.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="${DB_DETAIL_COLUMN_COUNT}">暂无匹配明细</td>`;
    tbody.appendChild(tr);
    return;
  }

  normalized.forEach((row) => {
    const componentKey = normalizeKey(row.componentName);
    const quoteCost = quoteCostByComponent.get(componentKey);
    const deltaHtml = buildDeltaChipHtml(quoteCost, parseNumber(row.costTotal));
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(formatNumericText(row.componentName))}</td>
      <td>${escapeHtml(formatNumericText(row.contentSpec))}</td>
      <td>${escapeHtml(formatNumericText(row.model))}</td>
      <td>${escapeHtml(formatNumericText(row.material))}</td>
      <td>${escapeHtml(formatNumericText(row.brand))}</td>
      <td>${escapeHtml(formatNumericText(row.componentQuantity))}</td>
      <td>${escapeHtml(formatNumericText(row.componentUnit))}</td>
      <td>${escapeHtml(formatNumericText(row.costUnitPrice))}</td>
      <td>
        <span class="cost-with-delta">
          <span class="cost-value">${escapeHtml(formatNumericText(row.costTotal))}</span>
          ${deltaHtml}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const dbCostTotalSum = normalized.reduce((sum, row) => sum + parseNumber(row.costTotal), 0);
  const sumTr = document.createElement("tr");
  sumTr.className = "sum-row";
  sumTr.innerHTML = `
    <td colspan="8">成本合计汇总</td>
    <td class="sum-price">${escapeHtml(formatNumericText(dbCostTotalSum))}</td>
  `;
  tbody.appendChild(sumTr);
}

function normalizeWarehouseRow(row: Record<string, unknown>): DbDisplayRow {
  const legacy = normalizeWarehouseRowLegacy(row);
  const costTotal = pickText(row, ["category_amount", "sheet_total_amount"]) || legacy.price;
  const componentName =
    pickText(row, ["category_name", "component_name", "name"]) || legacy.category || legacy.name;
  const componentQuantity = pickText(row, ["quantity_value"]);
  const componentUnit =
    pickText(row, ["component_unit", "单位", "unit", "ItemUnit", "item_unit"]) || "";
  return {
    componentName,
    contentSpec: pickText(row, ["content_spec"]) || legacy.desc,
    model: pickText(row, ["model_name"]) || legacy.model,
    material: pickText(row, ["material_name"]) || legacy.material,
    brand: pickText(row, ["brand_name"]) || legacy.brand,
    componentQuantity: formatNumericText(componentQuantity),
    componentUnit,
    quantity: legacy.quantity,
    unit: legacy.unit,
    costUnitPrice: "",
    costTotal: formatNumericText(costTotal),
    total: formatNumericText(costTotal),
    unitPrice: "",
    grandTotal: "",
  };
}

function normalizeWarehouseRowLegacy(row: Record<string, unknown>): DbDisplayRowLegacy {
  return {
    category:
      pickText(row, [
        "分类",
        "category",
        "category_name",
        "Category",
        "产品类型",
        "type_name",
        "system_name",
        "系统",
      ]) || "未分类",
    name: pickText(row, [
      "ItemName",
      "item_name",
      "product_model",
      "product_name",
      "name",
      "material_name",
    ]),
    desc: pickText(row, [
      "ItemDesc",
      "item_desc",
      "desc",
      "description",
      "规格",
      "规格描述",
      "内容及规格",
    ]),
    model: pickText(row, ["型号", "model", "item_model", "type", "ItemType", "item_type"]),
    material: pickText(row, ["主体材质", "材质", "material", "main_material"]),
    brand: pickText(row, ["品牌", "brand", "manufacturer", "制造商", "maker"]),
    quantity: pickText(row, ["数量", "qty", "quantity", "count"]),
    unit: pickText(row, ["单位", "unit", "ItemUnit", "item_unit"]),
    price: pickText(row, ["单价", "price", "ItemPrice", "item_price", "成本单价", "cost_price"]),
  };
}

function pickText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = String((row as any)?.[key] || "").trim();
    if (value) return value;
  }
  return "";
}

async function searchWarehouseByKeyword(keyword: string) {
  const url = new URL(
    `${APP_URLS.apiBase}${API_PATHS.warehouseCleanSearch}`,
    window.location.origin
  );
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("limit", "20");
  url.searchParams.set("detailLimit", "2500");
  const response = await fetch(url.toString(), { method: "GET" });
  const result = await response.json();
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || result?.message || "仓库统计查询失败");
  }
  const rows = Array.isArray(result.data) ? (result.data as Array<Record<string, unknown>>) : [];
  const metaBySheet = (result?.metaBySheet || {}) as Record<string, MetaInfoRow>;
  return { rows, metaBySheet };
}

function buildWarehouseDisplayName(row: Record<string, unknown>, idx: number) {
  const preferredKeys = [
    "ItemName",
    "item_name",
    "product_model",
    "product_name",
    "name",
    "material_name",
  ];
  for (const key of preferredKeys) {
    const value = String((row as any)?.[key] || "").trim();
    if (value) return value;
  }
  const firstText = Object.values(row).find((v) => typeof v === "string" && String(v).trim());
  if (firstText) return String(firstText);
  return `匹配项 ${idx + 1}`;
}

function buildWarehouseGroupKey(row: Record<string, unknown>) {
  const projectCode = pickText(row, ["project_code"]);
  if (projectCode) return projectCode;
  const sheetName = pickText(row, ["sheet_name"]);
  if (sheetName) return sheetName;
  const keyParam = pickText(row, ["key_param"]);
  if (keyParam) return keyParam;
  return buildWarehouseDisplayName(row, 0);
}

function buildWarehouseGroupLabel(sheetName: string) {
  const normalizedSheetName = String(sheetName || "").trim();
  if (!normalizedSheetName) return "";
  const meta = warehouseMetaBySheet[normalizedSheetName];
  const projectCode = String(meta?.project_code || "").trim();
  return projectCode || normalizedSheetName;
}

function prepareHistoryRows(rows: WarehouseStatRow[]) {
  const cloned = rows.map((row) => ({ ...row }));
  let hiddenAmount = 0;
  const visibleRows: WarehouseStatRow[] = [];

  cloned.forEach((row) => {
    const categoryName = pickText(row, ["category_name", "分类"]).trim();
    if (EXCLUDED_CATEGORIES.has(categoryName)) {
      hiddenAmount += parseNumber(pickText(row, ["category_amount"]));
      return;
    }
    visibleRows.push(row);
  });

  if (!visibleRows.length) return [];
  if (hiddenAmount === 0) return visibleRows;

  const target =
    visibleRows.find((row) => parseInt(pickText(row, ["row_index"]), 10) === 1) || visibleRows[0];
  const currentAmount = parseNumber(pickText(target, ["category_amount"]));
  (target as Record<string, unknown>).category_amount = String(currentAmount + hiddenAmount);
  return visibleRows;
}

function parseNumber(raw: unknown) {
  const text = String(raw == null ? "" : raw)
    .replace(/,/g, "")
    .trim();
  if (!text) return 0;
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

function formatNumericText(raw: unknown) {
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return "";
  const compact = text.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(compact)) {
    return text;
  }
  const n = Number(compact);
  if (!Number.isFinite(n)) return text;
  const truncated = n < 0 ? Math.ceil(n) : Math.floor(n);
  return String(truncated);
}

function normalizeKey(text: unknown) {
  return String(text == null ? "" : text)
    .trim()
    .replace(/\s+/g, "");
}

function buildQuoteCostMap(rows: DeviceRow[]) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = normalizeKey(row?.cToP?.[0] || "");
    if (!key) return;
    const amount = parseNumber(row?.cToP?.[10]);
    map.set(key, (map.get(key) || 0) + amount);
  });
  return map;
}

function buildDeltaChipHtml(base: number | undefined, current: number) {
  if (base == null || !Number.isFinite(base) || base <= 0) {
    return "";
  }
  const ratio = (current - base) / base;
  const pct = Math.round(Math.abs(ratio) * 100);
  if (pct === 0) {
    return `<span class="delta-chip flat">--</span>`;
  }
  if (ratio > 0) {
    return `<span class="delta-chip up">上涨${pct}%</span>`;
  }
  return `<span class="delta-chip down">下降${pct}%</span>`;
}

function resolveMetaForRows(rows: WarehouseStatRow[]) {
  if (!rows.length) return null;
  const sheetName = pickText(rows[0], ["sheet_name"]);
  if (!sheetName) return null;
  return warehouseMetaBySheet[sheetName] || null;
}

function renderDbMeta(meta: MetaInfoRow | null) {
  const box = document.getElementById("dbMetaBox");
  if (!box) return;
  if (!meta) {
    box.innerHTML = `<div class="meta-item">暂无相关产品元信息</div>`;
    return;
  }
  const fields: Array<[string, string]> = [
    ["项目名称", meta.project_name],
    ["项目编号", meta.project_code],
    ["设备名称", meta.device_name],
    ["设备图号", meta.device_drawing_no],
    ["位号", meta.tag_no],
    ["订单数量", meta.order_qty],
    ["数量单位", meta.order_unit],
    ["表面处理", meta.surface_process],
  ];
  box.innerHTML = `
    <div class="meta-grid">
      ${fields
        .map(
          ([label, value]) =>
            `<div class="meta-item"><b>${escapeHtml(label)}:</b>${escapeHtml(String(value || "-"))}</div>`
        )
        .join("")}
    </div>
  `;
}

function getDeviceList() {
  return document.getElementById("deviceList") as HTMLDivElement;
}

function getWarehouseList() {
  return document.getElementById("warehouseList") as HTMLDivElement;
}

function getWarehouseKeys() {
  return Array.from(
    new Set(
      warehouseRows
        .map((row) => pickText(row, ["sheet_name"]))
        .map((x) => x.trim())
        .filter(Boolean)
    )
  );
}

function selectDeviceByIndex(index: number) {
  selectedDeviceIndex = index >= 0 && index < deviceItems.length ? index : -1;
  refreshDeviceSelectionUI();
  void handleDeviceChanged();
}

function selectWarehouseKey(key: string) {
  selectedWarehouseKey = String(key || "").trim();
  refreshWarehouseSelectionUI();
  renderDbDetailForSelected();
}

function refreshDeviceSelectionUI() {
  const list = getDeviceList();
  Array.from(list.querySelectorAll(".listbox-item")).forEach((node, idx) => {
    const isSelected = idx === selectedDeviceIndex;
    node.classList.toggle("selected", isSelected);
    if (isSelected) {
      (node as HTMLDivElement).scrollIntoView({ block: "nearest" });
    }
  });
}

function refreshWarehouseSelectionUI() {
  const list = getWarehouseList();
  Array.from(list.querySelectorAll(".listbox-item")).forEach((node) => {
    const key = String((node as HTMLDivElement).dataset.key || "").trim();
    const isSelected = key === selectedWarehouseKey;
    node.classList.toggle("selected", isSelected);
    if (isSelected) {
      (node as HTMLDivElement).scrollIntoView({ block: "nearest" });
    }
  });
}

function setStatus(message: string, isError = false) {
  // Status bar removed by UX request; keep as no-op.
  void message;
  void isError;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
