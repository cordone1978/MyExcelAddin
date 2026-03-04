/* global Office, Excel, document, fetch */

import { API_PATHS, APP_URLS } from "../shared/appConstants";
import { BUILDSHEET_TEXT } from "../shared/businessTextConstants";
import { SHEET_NAMES } from "../shared/sheetNames";

type DeviceRow = {
  systemName: string;
  deviceName: string;
  componentName: string;
  componentDesc: string;
  componentType: string;
  componentMaterial: string;
  componentBrand: string;
  quantity: string;
  unitPrice: string;
};

type DeviceItem = {
  id: string;
  systemName: string;
  deviceName: string;
  rows: DeviceRow[];
};

let deviceItems: DeviceItem[] = [];
let warehouseRows: Array<Record<string, unknown>> = [];

Office.onReady(() => {
  void initialize();
});

async function initialize() {
  bindEvents();
  await loadDevices();
}

function bindEvents() {
  getDeviceList().addEventListener("change", () => {
    void handleDeviceChanged();
  });
  getWarehouseList().addEventListener("change", () => {
    renderDbDetailForSelected();
  });
}

async function loadDevices() {
  try {
    setStatus("正在读取报价配置表...");
    deviceItems = await readDevicesFromQuoteConfigSheet();
    renderDeviceList(deviceItems);
    if (!deviceItems.length) {
      setStatus("报价配置表未识别到设备。", true);
      return;
    }
    getDeviceList().selectedIndex = 0;
    await handleDeviceChanged();
  } catch (error: any) {
    setStatus(`读取设备失败：${String(error?.message || error)}`, true);
  }
}

async function handleDeviceChanged() {
  const idx = getDeviceList().selectedIndex;
  const item = idx >= 0 ? deviceItems[idx] : null;
  if (!item) {
    renderQuoteRows([]);
    renderWarehouseList([]);
    renderDbDetail({});
    return;
  }

  renderQuoteRows(item.rows);
  setStatus(`已选择设备：${item.deviceName}，正在查询仓库匹配...`);
  try {
    const rows = await searchWarehouseByKeyword(item.deviceName);
    warehouseRows = rows;
    renderWarehouseList(rows);
    if (rows.length > 0) {
      getWarehouseList().selectedIndex = 0;
      renderDbDetailForSelected();
      setStatus(`匹配到仓库数据 ${rows.length} 条。`);
    } else {
      renderDbDetail({});
      setStatus("仓库中未找到匹配数据。");
    }
  } catch (error: any) {
    renderWarehouseList([]);
    renderDbDetail({});
    setStatus(`仓库查询失败：${String(error?.message || error)}`, true);
  }
}

function renderDeviceList(items: DeviceItem[]) {
  const list = getDeviceList();
  list.innerHTML = "";
  const countByName = new Map<string, number>();
  items.forEach((item) => {
    countByName.set(item.deviceName, (countByName.get(item.deviceName) || 0) + 1);
  });
  items.forEach((item) => {
    const option = document.createElement("option");
    const duplicated = (countByName.get(item.deviceName) || 0) > 1;
    option.textContent = duplicated ? `${item.deviceName}（${item.systemName}）` : item.deviceName;
    option.value = item.id;
    list.appendChild(option);
  });
}

function renderWarehouseList(rows: Array<Record<string, unknown>>) {
  const list = getWarehouseList();
  list.innerHTML = "";
  rows.forEach((row, idx) => {
    const option = document.createElement("option");
    option.textContent = buildWarehouseDisplayName(row, idx);
    option.value = String(idx);
    list.appendChild(option);
  });
}

function renderQuoteRows(rows: DeviceRow[]) {
  const tbody = document.querySelector("#quoteTable tbody") as HTMLTableSectionElement;
  tbody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.systemName)}</td>
      <td>${escapeHtml(row.deviceName)}</td>
      <td>${escapeHtml(row.componentName)}</td>
      <td>${escapeHtml(row.componentDesc)}</td>
      <td>${escapeHtml(row.componentType)}</td>
      <td>${escapeHtml(row.componentMaterial)}</td>
      <td>${escapeHtml(row.componentBrand)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.unitPrice)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderDbDetailForSelected() {
  const list = getWarehouseList();
  const idx = Number(list.value || "-1");
  const row = idx >= 0 && idx < warehouseRows.length ? warehouseRows[idx] : {};
  renderDbDetail(row);
}

function renderDbDetail(row: Record<string, unknown>) {
  const tbody = document.querySelector("#dbDetailTable tbody") as HTMLTableSectionElement;
  tbody.innerHTML = "";
  const entries = Object.entries(row || {});
  if (!entries.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>提示</td><td>暂无匹配明细</td>`;
    tbody.appendChild(tr);
    return;
  }

  entries.forEach(([key, value]) => {
    const text = value == null ? "" : String(value);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(key)}</td><td>${escapeHtml(text)}</td>`;
    tbody.appendChild(tr);
  });
}

async function readDevicesFromQuoteConfigSheet(): Promise<DeviceItem[]> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItemOrNullObject(SHEET_NAMES.quoteConfig);
    sheet.load("name,isNullObject");
    const used = sheet.getRange("A:P").getUsedRangeOrNullObject(false);
    used.load("values,isNullObject");
    await context.sync();
    if (sheet.isNullObject || used.isNullObject) {
      return [];
    }

    const values = used.values || [];
    const headerSerial = String(BUILDSHEET_TEXT.configHeaders[0] || "").trim();
    const sectionRegex = /^[一二三四五六七八九十百零]+$/;
    let currentSystem = "";
    let currentDevice = "";
    const map = new Map<string, DeviceItem>();

    values.forEach((row) => {
      const a = String(row?.[0] || "").trim();
      const b = String(row?.[1] || "").trim();
      const c = String(row?.[2] || "").trim();
      if (sectionRegex.test(a) && b) {
        currentSystem = b;
        currentDevice = "";
        return;
      }
      if (a === headerSerial) {
        currentDevice = "";
        return;
      }
      if (!currentSystem) return;
      if (b) currentDevice = b;
      if (!currentDevice || !c) return;

      const key = `${currentSystem}||${currentDevice}`;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          systemName: currentSystem,
          deviceName: currentDevice,
          rows: [],
        });
      }

      map.get(key).rows.push({
        systemName: currentSystem,
        deviceName: currentDevice,
        componentName: c,
        componentDesc: String(row?.[3] || "").trim(),
        componentType: String(row?.[4] || "").trim(),
        componentMaterial: String(row?.[5] || "").trim(),
        componentBrand: String(row?.[6] || "").trim(),
        quantity: String(row?.[8] || "").trim(),
        unitPrice: String(row?.[10] || "").trim(),
      });
    });

    return Array.from(map.values());
  });
}

async function searchWarehouseByKeyword(keyword: string) {
  const url = new URL(`${APP_URLS.apiBase}${API_PATHS.warehouseCleanSearch}`, window.location.origin);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("limit", "150");
  const response = await fetch(url.toString(), { method: "GET" });
  const result = await response.json();
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || result?.message || "仓库查询失败");
  }
  return Array.isArray(result.data) ? (result.data as Array<Record<string, unknown>>) : [];
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

function getDeviceList() {
  return document.getElementById("deviceList") as HTMLSelectElement;
}

function getWarehouseList() {
  return document.getElementById("warehouseList") as HTMLSelectElement;
}

function setStatus(message: string, isError = false) {
  const el = document.getElementById("status");
  if (!el) return;
  el.className = isError ? "status error" : "status";
  el.textContent = message;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

