import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./devmodifyv2.css";
import { DIALOG_ACTIONS } from "../shared/dialogActions";
import { sendToParent, onParentMessage } from "../shared/dialogBridge";
import { API_PATHS, APP_URLS, CRAFTING_CONSTANTS } from "../shared/appConstants";

/* global Office */

type DevModifyV2Init = {
  deviceName?: string;
  currentPrice?: number;
  materials?: Array<{ name: string; price?: number }>;
  selectedMaterial?: string;
  materialPrice?: number | null;
  desc?: string;
  type?: string;
  unit?: string;
  brand?: string;
  whatKind?: string;
  priceKeyword?: string;
  baseDesc?: string;
  craftItems?: Array<{ id: number; name: string; unit?: string; price?: number; quantity?: string }>;
  previewLayers?: Array<{
    id: string;
    name: string;
    imageUrl: string;
    order: number;
    highlighted?: boolean;
  }>;
};

type PriceRow = {
  ItemName: string;
  ItemDesc: string;
  ItemType: string;
  ItemPrice: number;
  ItemUnit: string;
};

function DevModifyV2App() {
  const [initData, setInitData] = useState<DevModifyV2Init>({});
  const [currentMaterial, setCurrentMaterial] = useState("");
  const [currentMaterialValue, setCurrentMaterialValue] = useState<number | null>(null);
  const [currentDesc, setCurrentDesc] = useState("");
  const [currentType, setCurrentType] = useState("");
  const [currentUnit, setCurrentUnit] = useState("");
  const [currentBrand, setCurrentBrand] = useState("");
  const [currentWhatKind, setCurrentWhatKind] = useState("");
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [priceKeyword, setPriceKeyword] = useState("");
  const [baseDesc, setBaseDesc] = useState("");
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [priceRows, setPriceRows] = useState<PriceRow[]>([]);
  const [craftItems, setCraftItems] = useState<Array<{ id: number; name: string; unit: string; price: number; quantity: string }>>([]);

  useEffect(() => {
    document.title = "更改设备-新版";
    waitForOfficeReady(() => {
      sendToParent({ action: DIALOG_ACTIONS.DEVMODIFY_READY });
      onParentMessage((payload: any) => {
        try {
          if (payload?.action !== DIALOG_ACTIONS.INIT || !payload.data) return;
          const data = payload.data as DevModifyV2Init;
          setInitData(data);
          setCurrentMaterial(data.selectedMaterial || "");
          setCurrentMaterialValue(typeof data.materialPrice === "number" ? data.materialPrice : null);
          setCurrentDesc(data.desc || "");
          setCurrentType(data.type || "");
          setCurrentUnit(data.unit || "");
          setCurrentBrand(data.brand || "");
          setCurrentWhatKind(data.whatKind || "");
          setBasePrice(typeof data.currentPrice === "number" ? data.currentPrice : null);
          setPriceKeyword(data.priceKeyword || data.deviceName || "");
          setBaseDesc(data.baseDesc || data.desc || "");
          setCraftItems(
            (data.craftItems || []).map((item) => ({
              id: Number(item.id || 0),
              name: String(item.name || ""),
              unit: String(item.unit || "㎡"),
              price: Number(item.price || 0),
              quantity: String(item.quantity || ""),
            }))
          );
        } catch (error) {
          console.error("handle init failed", error);
        }
      });
    });
  }, []);

  const isOutsourced = currentWhatKind === CRAFTING_CONSTANTS.outsourcedKind;
  const materialOptions = initData.materials || [];
  const materialMap = useMemo(() => new Map(materialOptions.map((item) => [item.name, Number(item.price || 0)])), [materialOptions]);

  useEffect(() => {
    if (currentMaterial) {
      setCurrentMaterialValue(materialMap.get(currentMaterial) ?? currentMaterialValue);
    }
  }, [currentMaterial, materialMap]);

  const craftTotal = craftItems.reduce((sum, item) => sum + (parseNumber(item.quantity) || 0) * Number(item.price || 0), 0);
  const refreshedPrice = (currentMaterialValue || 0) + craftTotal;

  async function searchPriceList() {
    const keyword = priceKeyword.trim();
    if (!keyword) return;
    try {
      const response = await fetch(`${APP_URLS.apiBase}${API_PATHS.priceSearch}?keyword=${encodeURIComponent(keyword)}`);
      const result = await response.json();
      setPriceRows(result.success ? (result.data || []) : []);
    } catch (error) {
      console.error("price search failed", error);
      setPriceRows([]);
    }
  }

  function submit() {
    sendToParent({
      action: DIALOG_ACTIONS.DEVMODIFY_SUBMIT,
      whatKind: currentWhatKind,
      currentPrice: basePrice,
      refreshedPrice: isOutsourced ? basePrice : refreshedPrice,
      desc: isOutsourced ? currentDesc : buildCraftDescription(baseDesc, craftItems),
      type: currentType,
      material: currentMaterial,
      brand: currentBrand,
      unit: currentUnit,
    });
  }

  return (
    <div className="dialog-shell">
      <div className="panel ui-surface">
        <div className="panel-header">
          <h2 className="title">{String(initData.deviceName || "").trim() || "主体"}</h2>
        </div>

        <div className="form-grid">
          <div className="label">当前价格</div>
          <div className="value">{formatPrice(basePrice)}</div>

          <div className="label">材质变更</div>
          <select className="input ui-input" value={currentMaterial} onChange={(e) => { setCurrentMaterial(e.target.value); setCurrentMaterialValue(materialMap.get(e.target.value) ?? null); }}>
            <option value="">请选择...</option>
            {materialOptions.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>

          <div className="label">材料价格</div>
          <div className="value">{formatPrice(currentMaterialValue)}</div>

          <div className="label">更新后价格</div>
          <div className="value emphasis">{formatPrice(isOutsourced ? basePrice : refreshedPrice)}</div>
        </div>

        <div className="actions">
          <button className="btn ui-btn ui-btn--primary" onClick={submit}>更新价格</button>
          <button className="btn ui-btn ui-btn--secondary" onClick={() => sendToParent({ action: DIALOG_ACTIONS.DEVMODIFY_CANCEL })}>取消</button>
        </div>
      </div>

      <div className="preview ui-surface">
        <div className="preview-frame ui-preview-surface">
          <div className="stage-plane ui-preview-stage-plane" aria-hidden="true"></div>
          <div className="preview-layers">
            {(initData.previewLayers || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((layer) => (
              <img key={layer.id} src={layer.imageUrl} alt={layer.name || ""} className={`preview-layer${layer.highlighted ? " highlighted" : " muted"}`} />
            ))}
          </div>
          {!(initData.previewLayers || []).length ? <div className="placeholder">暂无图片</div> : null}
        </div>
      </div>

      <div className="craft-panel ui-surface">
        <div className="craft-title">新版工艺映射</div>
        {!isOutsourced ? (
          <div className="craft-table">
            <div className="craft-row header dynamic">
              <div className="craft-cell">工艺</div>
              <div className="craft-cell">数量/面积</div>
              <div className="craft-cell">单价</div>
              <div className="craft-cell total">小计</div>
            </div>
            {craftItems.length ? craftItems.map((item, index) => {
              const qty = parseNumber(item.quantity) || 0;
              const total = qty * Number(item.price || 0);
              return (
                <div className="craft-row dynamic" key={`${item.id}-${index}`}>
                  <div className="craft-cell label">{item.name}<div className="craft-cell unit">{item.unit}</div></div>
                  <div className="craft-cell">
                    <input className="input ui-input" type="text" value={item.quantity} onChange={(e) => {
                      const value = e.target.value;
                      setCraftItems((prev) => prev.map((row, i) => i === index ? { ...row, quantity: value } : row));
                    }} />
                  </div>
                  <div className="craft-cell total">{formatPrice(item.price)}</div>
                  <div className="craft-cell total">{total.toFixed(2)}</div>
                </div>
              );
            }) : <div className="craft-empty">当前组件没有配置工艺映射。</div>}
          </div>
        ) : (
          <div className="craft-empty">
            当前为外购件，仍按查询价格方式处理。
            <div className="craft-empty-action">
              <button className="btn ui-btn ui-btn--secondary" onClick={() => { setPriceModalOpen(true); void searchPriceList(); }}>查询价格</button>
            </div>
          </div>
        )}
        {!isOutsourced ? (
          <div className="craft-summary">
            <div>总计价（元）</div>
            <div className="craft-sum">{craftTotal.toFixed(2)}</div>
          </div>
        ) : null}
      </div>

      <div className={`modal-mask ui-modal-backdrop ${priceModalOpen ? "" : "hidden"}`}>
        <div className="modal ui-modal-card ui-modal-card--wide">
          <div className="modal-header ui-modal-header">
            <div className="modal-title ui-modal-title">外购件价格查询</div>
            <button className="icon-btn ui-icon-btn" onClick={() => setPriceModalOpen(false)}>x</button>
          </div>
          <div className="modal-body ui-modal-body">
            <div className="search-row">
              <input className="input ui-input" type="text" value={priceKeyword} placeholder="输入关键词..." onChange={(e) => setPriceKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void searchPriceList(); }} />
              <button className="btn ui-btn ui-btn--primary" onClick={() => void searchPriceList()}>查询</button>
            </div>
            <div className="result-list">
              {priceRows.map((row, index) => (
                <div
                  key={`${row.ItemName}-${index}`}
                  className="result-item"
                  onClick={() => {
                    setCurrentDesc(row.ItemDesc || "");
                    setCurrentType(row.ItemType || "");
                    setCurrentUnit(row.ItemUnit || "");
                    setCurrentBrand(extractInfo(row.ItemDesc || "", ["品牌", "品牌：", "品牌:"]));
                    setCurrentMaterial(extractInfo(row.ItemDesc || "", ["材质", "材质：", "材质:"]));
                    setBasePrice(parseNumber(row.ItemPrice));
                    setPriceModalOpen(false);
                  }}
                >
                  <div>{row.ItemName || ""}</div>
                  <div>{row.ItemDesc || ""}</div>
                  <div>{row.ItemType || ""}</div>
                  <div>{row.ItemPrice || ""}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return String(Number(value).toFixed(2));
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractInfo(text: string, keywords: string[]): string {
  if (!text) return "";
  for (const keyword of keywords) {
    const pos = text.indexOf(keyword);
    if (pos >= 0) {
      const remaining = text.substring(pos + keyword.length).replace(/^[:：\s]+/, "");
      const match = remaining.match(/^[^;；，,。\s]+/);
      if (match) return match[0].trim();
    }
  }
  return "";
}

function buildCraftDescription(baseDesc: string, craftItems: Array<{ name: string; quantity: string }>) {
  const active = craftItems
    .filter((item) => (parseNumber(item.quantity) || 0) > 0)
    .map((item) => item.name)
    .filter(Boolean);
  const head = String(baseDesc || "").trim();
  if (!active.length) return head;
  return `${head}${head ? "；" : ""}工艺：${active.join("；")}`;
}

function waitForOfficeReady(callback: () => void) {
  const officeRef = (globalThis as any).Office;
  if (officeRef?.onReady) {
    officeRef.onReady(() => {
      callback();
    });
    return;
  }
  window.setTimeout(() => waitForOfficeReady(callback), 50);
}

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(<DevModifyV2App />);
