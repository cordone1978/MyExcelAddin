import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./devmodify.css";
import { DIALOG_ACTIONS } from "../shared/dialogActions";
import { sendToParent, onParentMessage } from "../shared/dialogBridge";
import { API_PATHS, APP_URLS, CRAFTING_CONSTANTS } from "../shared/appConstants";
import { CRAFTMODIFY_TEXT, DEVMODIFY_TEXT } from "../shared/businessTextConstants";
import { DEVMODIFY_HTML_TEXT } from "../shared/dialogHtmlTextConstants";

/* global Office */

type DevModifyInit = {
  deviceName?: string;
  currentPrice?: number;
  materials?: Array<{ name: string; price?: number }>;
  selectedMaterial?: string;
  materialPrice?: number | null;
  craftPrice?: number | null;
  desc?: string;
  type?: string;
  unit?: string;
  brand?: string;
  whatKind?: string;
  isPriceChanged?: boolean;
  priceKeyword?: string;
  craftUnitOptions?: Array<{ label: string; price: number; craftType: string }>;
  craftAreas?: Array<{ area: number | null; type: string | null }>;
  baseDesc?: string;
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

function DevModifyApp() {
  const [initData, setInitData] = useState<DevModifyInit>({});
  const [currentMaterial, setCurrentMaterial] = useState("");
  const [currentMaterialValue, setCurrentMaterialValue] = useState<number | null>(null);
  const [currentDesc, setCurrentDesc] = useState("");
  const [currentType, setCurrentType] = useState("");
  const [currentUnit, setCurrentUnit] = useState("");
  const [currentBrand, setCurrentBrand] = useState("");
  const [currentWhatKind, setCurrentWhatKind] = useState("");
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [craftPrice, setCraftPrice] = useState<number | null>(null);
  const [isPriceChanged, setIsPriceChanged] = useState(false);
  const [priceKeyword, setPriceKeyword] = useState("");
  const [baseDesc, setBaseDesc] = useState("");
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [priceRows, setPriceRows] = useState<PriceRow[]>([]);
  const [craftAreas, setCraftAreas] = useState<Array<{ area: string; type: string }>>(
    Array.from({ length: CRAFTING_CONSTANTS.craftAreaSlots }, () => ({ area: "", type: "" }))
  );

  useEffect(() => {
    document.title = DEVMODIFY_HTML_TEXT.title;
    sendToParent({ action: DIALOG_ACTIONS.DEVMODIFY_READY });
    onParentMessage((payload: any) => {
      try {
        if (payload?.action === DIALOG_ACTIONS.INIT && payload.data) {
          const data = payload.data as DevModifyInit;
          setInitData(data);
          setCurrentMaterial(data.selectedMaterial || "");
          setCurrentMaterialValue(typeof data.materialPrice === "number" ? data.materialPrice : null);
          setCurrentDesc(data.desc || "");
          setCurrentType(data.type || "");
          setCurrentUnit(data.unit || "");
          setCurrentBrand(data.brand || "");
          setCurrentWhatKind(data.whatKind || "");
          setBasePrice(typeof data.currentPrice === "number" ? data.currentPrice : null);
          setCraftPrice(typeof data.craftPrice === "number" ? data.craftPrice : null);
          setIsPriceChanged(Boolean(data.isPriceChanged));
          setPriceKeyword(data.priceKeyword || data.deviceName || "");
          setBaseDesc(data.baseDesc || data.desc || "");
          const areas = data.craftAreas || [];
          setCraftAreas(Array.from({ length: CRAFTING_CONSTANTS.craftAreaSlots }, (_, index) => ({
            area: areas[index]?.area == null ? "" : String(areas[index].area),
            type: areas[index]?.type || "",
          })));
        }
        if (payload?.action === DIALOG_ACTIONS.CRAFTMODIFY_RESULT && payload.data) {
          if (typeof payload.data.craftPrice === "number") setCraftPrice(payload.data.craftPrice);
          if (typeof payload.data.desc === "string") setCurrentDesc(payload.data.desc);
        }
      } catch (error) {
        console.error(DEVMODIFY_TEXT.initDataHandleFailed, error);
      }
    });
  }, []);

  const isOutsourced = currentWhatKind === CRAFTING_CONSTANTS.outsourcedKind;
  const materialOptions = initData.materials || [];
  const craftUnitOptions = initData.craftUnitOptions || [];
  const materialMap = useMemo(() => new Map(materialOptions.map((item) => [item.name, Number(item.price || 0)])), [materialOptions]);
  const craftUnitPriceMap = useMemo(() => new Map(craftUnitOptions.map((item) => [item.label, Number(item.price || 0)])), [craftUnitOptions]);

  useEffect(() => {
    if (currentMaterial) {
      setCurrentMaterialValue(materialMap.get(currentMaterial) ?? currentMaterialValue);
    }
  }, [currentMaterial, materialMap]);

  const rowTotals = craftAreas.map((item) => {
    const area = parseNumber(item.area) || 0;
    const unitPrice = craftUnitPriceMap.get(item.type || "") || 0;
    return area * unitPrice;
  });
  const craftTotal = rowTotals.reduce((sum, n) => sum + n, 0);
  useEffect(() => {
    if (!isOutsourced) setCraftPrice(craftTotal);
  }, [craftTotal, isOutsourced]);

  const refreshedPrice = (() => {
    const material = currentMaterialValue;
    if (material === null && craftPrice === null) return basePrice;
    return (material || 0) + (craftPrice || 0);
  })();

  async function searchPriceList() {
    const keyword = priceKeyword.trim();
    if (!keyword) return;
    try {
      const response = await fetch(`${APP_URLS.apiBase}${API_PATHS.priceSearch}?keyword=${encodeURIComponent(keyword)}`);
      const result = await response.json();
      setPriceRows(result.success ? (result.data || []) : []);
    } catch (error) {
      console.error(`${DEVMODIFY_TEXT.priceSearchFailed}:`, error);
      setPriceRows([]);
    }
  }

  function submit() {
    const payload = {
      action: DIALOG_ACTIONS.DEVMODIFY_SUBMIT,
      deviceName: initData.deviceName || "",
      currentPrice: basePrice,
      desc: isOutsourced ? currentDesc : buildCraftingDescription(baseDesc, craftAreas, rowTotals),
      type: currentType,
      unit: currentUnit,
      brand: currentBrand,
      whatKind: currentWhatKind,
      material: isOutsourced ? currentMaterial : currentMaterial,
      materialPrice: currentMaterialValue,
      craftPrice,
      refreshedPrice,
      isPriceChanged,
    };
    sendToParent(payload);
  }

  return (
    <div className="dialog-shell">
      <div className="panel ui-surface">
        <div className="panel-header">
          <h2 className="title">{String(initData.deviceName || "").trim() || DEVMODIFY_HTML_TEXT.panelTitle}</h2>
          <div className="device-name">{initData.deviceName || "-"}</div>
        </div>

        <div className="form-grid">
          <div className="label">{DEVMODIFY_HTML_TEXT.currentPriceLabel}</div>
          <div className="value">{formatPrice(basePrice)}</div>

          {!isOutsourced ? (
            <>
              <div className="label">{DEVMODIFY_HTML_TEXT.materialLabel}</div>
              <select className="input ui-input" value={currentMaterial} onChange={(e) => { setCurrentMaterial(e.target.value); setCurrentMaterialValue(materialMap.get(e.target.value) ?? null); }}>
                <option value="">{DEVMODIFY_TEXT.selectPlaceholder}</option>
                {materialOptions.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>

              <div className="label">{DEVMODIFY_HTML_TEXT.materialPriceLabel}</div>
              <div className="value">{formatPrice(currentMaterialValue)}</div>

              <div className="label">{DEVMODIFY_TEXT.craftProcessLabel}</div>
              <div className="value">{formatPrice(craftPrice)}</div>

              <div className="label">{DEVMODIFY_HTML_TEXT.refreshedLabel}</div>
              <div className="value emphasis">{formatPrice(refreshedPrice)}</div>
            </>
          ) : (
            <>
              <div className="label">{DEVMODIFY_TEXT.outsourcedPriceLabel}</div>
              <button className="text-btn" onClick={() => { setPriceModalOpen(true); void searchPriceList(); }}>{DEVMODIFY_TEXT.clickToQuery}</button>
            </>
          )}
        </div>

        <div className="actions">
          <button className="btn ui-btn ui-btn--primary" onClick={submit}>{DEVMODIFY_HTML_TEXT.submitBtn}</button>
          <button className="btn ui-btn ui-btn--secondary" onClick={() => sendToParent({ action: DIALOG_ACTIONS.DEVMODIFY_CANCEL })}>{DEVMODIFY_HTML_TEXT.cancelBtn}</button>
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
          {!(initData.previewLayers || []).length ? <div className="placeholder">{DEVMODIFY_HTML_TEXT.imagePlaceholder}</div> : null}
        </div>
      </div>

      <div className={`craft-panel ui-surface ${isOutsourced ? "is-hidden" : ""}`}>
        <div className="craft-title">{DEVMODIFY_HTML_TEXT.craftTitle}</div>
        <div className="craft-table">
          <div className="craft-row header">
            <div className="craft-cell label"></div>
            <div className="craft-cell">{DEVMODIFY_HTML_TEXT.areaHeader}</div>
            <div className="craft-cell">{DEVMODIFY_HTML_TEXT.unitPriceHeader}</div>
            <div className="craft-cell total">{DEVMODIFY_HTML_TEXT.totalHeader}</div>
          </div>
          {[
            DEVMODIFY_HTML_TEXT.innerLabel1,
            DEVMODIFY_HTML_TEXT.innerLabel2,
            DEVMODIFY_HTML_TEXT.innerLabel3,
            DEVMODIFY_HTML_TEXT.outerLabel1,
            DEVMODIFY_HTML_TEXT.outerLabel2,
            DEVMODIFY_HTML_TEXT.outerLabel3,
          ].map((label, index) => (
            <div className="craft-row" key={label}>
              <div className="craft-cell label">{label}</div>
              <div className="craft-cell">
                <input className="input ui-input" type="text" value={craftAreas[index]?.area || ""} onChange={(e) => setCraftAreas((prev) => prev.map((item, i) => i === index ? { ...item, area: e.target.value } : item))} />
              </div>
              <div className="craft-cell">
                <select className="input ui-input" value={craftAreas[index]?.type || ""} onChange={(e) => setCraftAreas((prev) => prev.map((item, i) => i === index ? { ...item, type: e.target.value } : item))}>
                  <option value="">{DEVMODIFY_TEXT.selectPlaceholder}</option>
                  {craftUnitOptions.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}
                </select>
              </div>
              <div className="craft-cell total">{rowTotals[index].toFixed(2)}</div>
            </div>
          ))}
        </div>

        <div className="craft-summary">
          <div>{DEVMODIFY_HTML_TEXT.craftSummaryLabel}</div>
          <div className="craft-sum">{craftTotal.toFixed(2)}</div>
        </div>
      </div>

      <div className={`modal-mask ui-modal-backdrop ${priceModalOpen ? "" : "hidden"}`}>
        <div className="modal ui-modal-card ui-modal-card--wide">
          <div className="modal-header ui-modal-header">
            <div className="modal-title ui-modal-title">{DEVMODIFY_HTML_TEXT.priceModalTitle}</div>
            <button className="icon-btn ui-icon-btn" onClick={() => setPriceModalOpen(false)}>x</button>
          </div>
          <div className="modal-body ui-modal-body">
            <div className="search-row">
              <input className="input ui-input" type="text" value={priceKeyword} placeholder={DEVMODIFY_HTML_TEXT.priceKeywordPlaceholder} onChange={(e) => setPriceKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void searchPriceList(); }} />
              <button className="btn ui-btn ui-btn--primary" onClick={() => void searchPriceList()}>{DEVMODIFY_HTML_TEXT.searchPriceBtn}</button>
            </div>
            <div className="result-list">
              <div className="result-item header">
                {DEVMODIFY_TEXT.priceTableHeaders.map((header) => (
                  <div key={header}>{header}</div>
                ))}
              </div>
              {priceRows.map((row, index) => (
                <div
                  key={`${row.ItemName}-${index}`}
                  className="result-item"
                  onClick={() => {
                    setCurrentDesc(row.ItemDesc || "");
                    setCurrentType(row.ItemType || "");
                    setCurrentUnit(row.ItemUnit || "");
                    setCurrentBrand(extractBrand(row.ItemDesc || ""));
                    setCurrentMaterial(extractMaterial(row.ItemDesc || ""));
                    setBasePrice(parseNumber(row.ItemPrice));
                    setCraftPrice(null);
                    setIsPriceChanged(true);
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

function formatPrice(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return String(Math.round(value));
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractBrand(text: string): string {
  return extractInfo(text, DEVMODIFY_TEXT.brandKeywords);
}

function extractMaterial(text: string): string {
  return extractInfo(text, DEVMODIFY_TEXT.materialKeywords);
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

function buildCraftingDescription(baseDesc: string, craftAreas: Array<{ area: string; type: string }>, rowTotals: number[]) {
  const innerTypes = collectCraftTypes(craftAreas, rowTotals, 0, 3);
  const outerTypes = collectCraftTypes(craftAreas, rowTotals, 3, 6);
  let result = removeSegment(baseDesc || "", CRAFTMODIFY_TEXT.innerPrefix);
  result = removeSegment(result, CRAFTMODIFY_TEXT.outerPrefix);
  result = result.replace(/[；，]\s*$/, "").trim();
  if (innerTypes.length > 0) result = appendSegment(result, `${CRAFTMODIFY_TEXT.innerLabel}${innerTypes.join(CRAFTMODIFY_TEXT.semicolon)}`);
  if (outerTypes.length > 0) result = appendSegment(result, `${CRAFTMODIFY_TEXT.outerLabel}${outerTypes.join(CRAFTMODIFY_TEXT.semicolon)}`);
  return result;
}

function collectCraftTypes(craftAreas: Array<{ area: string; type: string }>, rowTotals: number[], start: number, end: number) {
  const types: string[] = [];
  for (let i = start; i < end; i++) {
    if ((rowTotals[i] || 0) <= 0 || !craftAreas[i]?.type) continue;
    const craftType = extractCraftType(craftAreas[i].type);
    if (craftType && !types.includes(craftType)) types.push(craftType);
  }
  return types;
}

function extractCraftType(label: string): string {
  if (!label) return "";
  const splitIndex = label.indexOf(CRAFTING_CONSTANTS.craftTypeSeparator);
  if (splitIndex > 0) return label.slice(0, splitIndex).trim();
  const priceIndex = label.indexOf(CRAFTING_CONSTANTS.rmbSymbol);
  if (priceIndex > 0) return label.slice(0, priceIndex).trim();
  return label.trim();
}

function removeSegment(text: string, key: string): string {
  const index = text.indexOf(key);
  if (index < 0) return text;
  const endIndex = text.indexOf(CRAFTMODIFY_TEXT.semicolon, index);
  if (endIndex < 0) return text.slice(0, index).trim();
  return (text.slice(0, index) + text.slice(endIndex + 1)).trim();
}

function appendSegment(text: string, segment: string): string {
  if (!text) return segment;
  return `${text}${CRAFTMODIFY_TEXT.comma}${segment}`;
}

Office.onReady(() => {
  const root = document.getElementById("root");
  if (!root) return;
  createRoot(root).render(<DevModifyApp />);
});
