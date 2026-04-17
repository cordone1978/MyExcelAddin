import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./infoReference.css";
import { API_PATHS, APP_URLS } from "../shared/appConstants";
import { sendToParent, onParentMessage } from "../shared/dialogBridge";

/* global Office */

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

type DbDisplayRow = {
  componentName: string;
  contentSpec: string;
  model: string;
  material: string;
  brand: string;
  componentQuantity: string;
  componentUnit: string;
  costUnitPrice: string;
  costTotal: string;
};

const INFO_REF_REQUEST_DEVICES_MSG = "info_reference_request_devices";
const INFO_REF_DEVICES_MSG = "info_reference_devices";
const INFO_REF_ERROR_MSG = "info_reference_error";
const EXCLUDED_CATEGORIES = new Set(["标准件", "外购件"]);
const DISPLAY_COLUMN_INDEXES = [0, 1, 2, 3, 4, 5, 6, 9, 10];

function InfoReferenceApp() {
  const [deviceItems, setDeviceItems] = useState<DeviceItem[]>([]);
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const [warehouseRows, setWarehouseRows] = useState<WarehouseStatRow[]>([]);
  const [warehouseMetaBySheet, setWarehouseMetaBySheet] = useState<Record<string, MetaInfoRow>>({});
  const [quoteCostByComponent, setQuoteCostByComponent] = useState<Map<string, number>>(new Map());
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState(-1);
  const [selectedWarehouseKey, setSelectedWarehouseKey] = useState("");

  useEffect(() => {
    const unsubscribe = onParentMessage((payload: any) => {
      try {
        if (payload?.type === INFO_REF_DEVICES_MSG) {
          const data = payload?.data;
          const normalized: DevicesPayload = Array.isArray(data)
            ? { devices: data as DeviceItem[], columnWidths: [] }
            : {
                devices: Array.isArray(data?.devices) ? (data.devices as DeviceItem[]) : [],
                columnWidths: Array.isArray(data?.columnWidths) ? (data.columnWidths as number[]) : [],
              };
          setDeviceItems(normalized.devices);
          setColumnWidths(normalized.columnWidths);
          if (normalized.devices.length) {
            setSelectedDeviceIndex(0);
          }
        } else if (payload?.type === INFO_REF_ERROR_MSG) {
          console.error(payload?.message || "读取设备失败");
        }
      } catch (error) {
        console.error("读取设备失败", error);
      }
    });

    sendToParent({ type: INFO_REF_REQUEST_DEVICES_MSG });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const current = selectedDeviceIndex >= 0 ? deviceItems[selectedDeviceIndex] : null;
    if (!current) {
      setWarehouseRows([]);
      setWarehouseMetaBySheet({});
      setQuoteCostByComponent(new Map());
      setSelectedWarehouseKey("");
      return;
    }
    setQuoteCostByComponent(buildQuoteCostMap(current.rows));
    void (async () => {
      try {
        const result = await searchWarehouseByKeyword(current.deviceName);
        setWarehouseRows(result.rows);
        setWarehouseMetaBySheet(result.metaBySheet);
        const keys = getWarehouseKeys(result.rows);
        setSelectedWarehouseKey(keys[0] || "");
      } catch (error) {
        console.error("仓库查询失败", error);
        setWarehouseRows([]);
        setWarehouseMetaBySheet({});
        setSelectedWarehouseKey("");
      }
    })();
  }, [selectedDeviceIndex, deviceItems]);

  const selectedDevice = selectedDeviceIndex >= 0 ? deviceItems[selectedDeviceIndex] : null;
  const warehouseKeys = useMemo(() => getWarehouseKeys(warehouseRows), [warehouseRows]);
  const historyRows = useMemo(() => {
    const filtered = selectedWarehouseKey ? warehouseRows.filter((row) => buildWarehouseGroupKey(row) === selectedWarehouseKey) : warehouseRows;
    return prepareHistoryRows(filtered.length ? filtered : warehouseRows);
  }, [warehouseRows, selectedWarehouseKey]);
  const normalizedHistoryRows = useMemo(() => historyRows.map(normalizeWarehouseRow).filter((x) => !!x.componentName || !!x.contentSpec || !!x.model || !!x.material || !!x.brand), [historyRows]);
  const historyMeta = useMemo(() => resolveMetaForRows(historyRows, warehouseMetaBySheet), [historyRows, warehouseMetaBySheet]);
  const quoteRows = selectedDevice?.rows || [];

  function handleDeviceWheel(deltaY: number) {
    if (!deviceItems.length) return;
    const step = deltaY > 0 ? 1 : -1;
    setSelectedDeviceIndex((prev) => Math.max(0, Math.min(deviceItems.length - 1, (prev < 0 ? 0 : prev) + step)));
  }

  function handleWarehouseWheel(deltaY: number) {
    if (!warehouseKeys.length) return;
    const current = Math.max(0, warehouseKeys.findIndex((x) => x === selectedWarehouseKey));
    const step = deltaY > 0 ? 1 : -1;
    const next = Math.max(0, Math.min(warehouseKeys.length - 1, current + step));
    setSelectedWarehouseKey(warehouseKeys[next] || "");
  }

  return (
    <div className="shell">
      <div className="left">
        <section className="panel grow">
          <div className="left-group">
            <h3>报价配置表设备</h3>
            <div className="listbox ui-listbox" onWheel={(e) => { e.preventDefault(); handleDeviceWheel(e.deltaY); }}>
              {deviceItems.length ? deviceItems.map((item, idx) => (
                <div key={item.id} className={`listbox-item ui-listbox-item ${idx === selectedDeviceIndex ? "selected is-selected" : ""}`} onClick={() => setSelectedDeviceIndex(idx)}>
                  {item.deviceName}
                </div>
              )) : <div className="listbox-placeholder">暂无设备</div>}
            </div>
          </div>
        </section>
        <section className="panel grow">
          <div className="left-group">
            <h3>历史相关产品</h3>
            <div className="listbox ui-listbox" onWheel={(e) => { e.preventDefault(); handleWarehouseWheel(e.deltaY); }}>
              {warehouseKeys.length ? warehouseKeys.map((key) => (
                <div key={key} className={`listbox-item ui-listbox-item ${selectedWarehouseKey === key ? "selected is-selected" : ""}`} onClick={() => setSelectedWarehouseKey(key)}>
                  {buildWarehouseGroupLabel(key, warehouseMetaBySheet)}
                </div>
              )) : <div className="listbox-placeholder">暂无历史相关产品</div>}
            </div>
          </div>
        </section>
      </div>
      <div className="right">
        <section className="panel grow">
          <h3>报价配置表明细</h3>
          <div className="table-wrap">
            <table className="grid" id="quoteTable">
              <TableColGroup columnWidths={columnWidths} />
              <thead>
                <tr>
                  <th>组件名称</th>
                  <th>内容及规格</th>
                  <th>型号</th>
                  <th>主体材质</th>
                  <th>品牌</th>
                  <th>组件数量</th>
                  <th>单位</th>
                  <th>成本单价（元）</th>
                  <th>成本合计（元）</th>
                </tr>
              </thead>
              <tbody>
                {quoteRows.map((row, idx) => {
                  const costTotal = parseNumber(row.cToP[10]) > 0 ? row.cToP[10] : row.cToP[11];
                  const displayValues = [...row.cToP];
                  displayValues[10] = costTotal || "";
                  return (
                    <tr key={`quote-${idx}`}>
                      {DISPLAY_COLUMN_INDEXES.map((i) => <td key={i}>{formatNumericText(displayValues[i])}</td>)}
                    </tr>
                  );
                })}
                {quoteRows.length ? (
                  <tr className="sum-row">
                    <td colSpan={8}>成本合计汇总</td>
                    <td className="sum-price">{formatNumericText(quoteRows.reduce((sum, row) => sum + (parseNumber(row.cToP[10]) > 0 ? parseNumber(row.cToP[10]) : parseNumber(row.cToP[11])), 0))}</td>
                  </tr>
                ) : (
                  <tr><td colSpan={9}>暂无明细</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel grow">
          <h3>历史数据库明细</h3>
          <div className="table-wrap">
            <table className="grid" id="dbDetailTable">
              <TableColGroup columnWidths={columnWidths} />
              <thead>
                <tr>
                  <th>组件名称</th>
                  <th>内容及规格</th>
                  <th>型号</th>
                  <th>主体材质</th>
                  <th>品牌</th>
                  <th>组件数量</th>
                  <th>单位</th>
                  <th>成本单价（元）</th>
                  <th>成本合计（元）</th>
                </tr>
              </thead>
              <tbody>
                {normalizedHistoryRows.length ? normalizedHistoryRows.map((row, idx) => {
                  const componentKey = normalizeKey(row.componentName);
                  const quoteCost = quoteCostByComponent.get(componentKey);
                  const delta = buildDeltaChip(quoteCost, parseNumber(row.costTotal));
                  return (
                    <tr key={`db-${idx}`}>
                      <td>{formatNumericText(row.componentName)}</td>
                      <td>{formatNumericText(row.contentSpec)}</td>
                      <td>{formatNumericText(row.model)}</td>
                      <td>{formatNumericText(row.material)}</td>
                      <td>{formatNumericText(row.brand)}</td>
                      <td>{formatNumericText(row.componentQuantity)}</td>
                      <td>{formatNumericText(row.componentUnit)}</td>
                      <td>{formatNumericText(row.costUnitPrice)}</td>
                      <td>
                        <span className="cost-with-delta">
                          <span className="cost-value">{formatNumericText(row.costTotal)}</span>
                          {delta ? <span className={`delta-chip ui-chip ui-chip--${delta.kind === "flat" ? "warning" : delta.kind === "up" ? "danger" : "success"} ${delta.kind}`}>{delta.label}</span> : null}
                        </span>
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={9}>暂无匹配明细</td></tr>}
                {normalizedHistoryRows.length ? (
                  <tr className="sum-row">
                    <td colSpan={8}>成本合计汇总</td>
                    <td className="sum-price">{formatNumericText(normalizedHistoryRows.reduce((sum, row) => sum + parseNumber(row.costTotal), 0))}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="meta-box">
            {historyMeta ? (
              <div className="meta-grid">
                {[
                  ["项目名称", historyMeta.project_name],
                  ["项目编号", historyMeta.project_code],
                  ["设备名称", historyMeta.device_name],
                  ["设备图号", historyMeta.device_drawing_no],
                  ["位号", historyMeta.tag_no],
                  ["订单数量", historyMeta.order_qty],
                  ["数量单位", historyMeta.order_unit],
                  ["表面处理", historyMeta.surface_process],
                ].map(([label, value]) => (
                  <div key={label} className="meta-item"><b>{label}:</b>{String(value || "-")}</div>
                ))}
              </div>
            ) : (
              <div className="meta-item">暂无相关产品元信息</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function TableColGroup({ columnWidths }: { columnWidths: number[] }) {
  const normalized = DISPLAY_COLUMN_INDEXES.map((sourceIdx) => {
    const n = Number(columnWidths?.[sourceIdx] || 0);
    return n > 0 ? n : 1;
  });
  const sum = normalized.reduce((acc, n) => acc + n, 0) || normalized.length;
  return (
    <colgroup>
      {normalized.map((width, idx) => <col key={idx} style={{ width: `${(width / sum) * 100}%` }} />)}
    </colgroup>
  );
}

function searchWarehouseByKeyword(keyword: string) {
  const url = new URL(`${APP_URLS.apiBase}${API_PATHS.warehouseCleanSearch}`, window.location.origin);
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("limit", "20");
  url.searchParams.set("detailLimit", "2500");
  return fetch(url.toString(), { method: "GET" })
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || result?.message || "仓库统计查询失败");
      }
      return {
        rows: Array.isArray(result.data) ? (result.data as Array<Record<string, unknown>>) : [],
        metaBySheet: (result?.metaBySheet || {}) as Record<string, MetaInfoRow>,
      };
    });
}

function pickText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = String((row as any)?.[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function getWarehouseKeys(rows: WarehouseStatRow[]) {
  return Array.from(new Set(rows.map((row) => pickText(row, ["sheet_name"])).map((x) => x.trim()).filter(Boolean)));
}

function buildWarehouseGroupKey(row: Record<string, unknown>) {
  return pickText(row, ["project_code"]) || pickText(row, ["sheet_name"]) || pickText(row, ["key_param"]) || "";
}

function buildWarehouseGroupLabel(sheetName: string, metaBySheet: Record<string, MetaInfoRow>) {
  const meta = metaBySheet[String(sheetName || "").trim()];
  return String(meta?.project_code || "").trim() || String(sheetName || "").trim();
}

function normalizeWarehouseRow(row: Record<string, unknown>): DbDisplayRow {
  const rawAmount = parseNumber(pickText(row, ["category_amount"]));
  const costTotal = rawAmount > 0 ? pickText(row, ["category_amount"]) : pickText(row, ["sheet_total_amount"]);
  return {
    componentName: pickText(row, ["category_name", "component_name", "name"]),
    contentSpec: pickText(row, ["content_spec", "内容及规格"]),
    model: pickText(row, ["model_name", "型号"]),
    material: pickText(row, ["material_name", "主体材质"]),
    brand: pickText(row, ["brand_name", "品牌"]),
    componentQuantity: formatNumericText(pickText(row, ["quantity_value"])),
    componentUnit: pickText(row, ["component_unit", "单位", "unit", "ItemUnit", "item_unit"]) || "",
    costUnitPrice: "",
    costTotal: formatNumericText(costTotal),
  };
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

  const target = visibleRows.find((row) => parseInt(pickText(row, ["row_index"]), 10) === 1) || visibleRows[0];
  const currentAmount = parseNumber(pickText(target, ["category_amount"]));
  (target as Record<string, unknown>).category_amount = String(currentAmount + hiddenAmount);
  return visibleRows;
}

function resolveMetaForRows(rows: WarehouseStatRow[], metaBySheet: Record<string, MetaInfoRow>) {
  if (!rows.length) return null;
  const sheetName = pickText(rows[0], ["sheet_name"]);
  return sheetName ? metaBySheet[sheetName] || null : null;
}

function parseNumber(raw: unknown) {
  const text = String(raw == null ? "" : raw).replace(/,/g, "").trim();
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
  return String(text == null ? "" : text).trim().replace(/\s+/g, "");
}

function buildQuoteCostMap(rows: DeviceRow[]) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = normalizeKey(row?.cToP?.[0] || "");
    if (!key) return;
    const amount = parseNumber(row?.cToP?.[10]) > 0 ? parseNumber(row?.cToP?.[10]) : parseNumber(row?.cToP?.[11]);
    map.set(key, (map.get(key) || 0) + amount);
  });
  return map;
}

function buildDeltaChip(base: number | undefined, current: number) {
  if (base == null || !Number.isFinite(base) || base <= 0) return null;
  const ratio = (current - base) / base;
  const pct = Math.round(Math.abs(ratio) * 100);
  if (pct === 0) return { kind: "flat", label: "--" };
  if (ratio > 0) return { kind: "up", label: `上涨${pct}%` };
  return { kind: "down", label: `下降${pct}%` };
}

Office.onReady(() => {
  const root = document.getElementById("root");
  if (!root) return;
  createRoot(root).render(<InfoReferenceApp />);
});
