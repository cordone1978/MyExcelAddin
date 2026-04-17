import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./queryprice.css";
import { DIALOG_ACTIONS } from "../shared/dialogActions";
import { sendToParent, onParentMessage } from "../shared/dialogBridge";
import { API_PATHS, APP_URLS, UI_DEFAULTS } from "../shared/appConstants";
import { DIALOG_TEXT, QUERYPRICE_HTML_TEXT } from "../shared/businessTextConstants";
import { extractBrand, extractMaterial, formatPriceDecimal } from "../shared/dialogTextUtils";

/* global Office */

const API_BASE = APP_URLS.apiBase;

type PriceResult = {
  ItemName: string;
  ItemDesc: string;
  ItemType: string;
  ItemPrice: number;
  ItemUnit: string;
  OrderDate: string;
};

function QueryPriceApp() {
  const [mainKeyword, setMainKeyword] = useState("");
  const [secondKeyword, setSecondKeyword] = useState("");
  const [results, setResults] = useState<PriceResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [placeholder, setPlaceholder] = useState(UI_DEFAULTS.defaultSearchPrompt);
  const [warning, setWarning] = useState("");

  useEffect(() => {
    document.title = QUERYPRICE_HTML_TEXT.title;
    const unsubscribe = onParentMessage((payload: any) => {
      try {
        if (payload?.action === DIALOG_ACTIONS.QUERYPRICE_WARNING) {
          setWarning(String(payload.message || UI_DEFAULTS.defaultWarningMessage));
        }
      } catch (error) {
        console.error(`${DIALOG_TEXT.handleParentMessageFailed}:`, error);
      }
    });

    const initialKeyword = new URLSearchParams(window.location.search).get("keyword") || "";
    if (initialKeyword.trim()) {
      setMainKeyword(initialKeyword.trim());
      void handleSearch(initialKeyword.trim(), secondKeyword);
    }
    return unsubscribe;
  }, []);

  async function handleSearch(keyword = mainKeyword, second = secondKeyword) {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) {
      setResults([]);
      setSelectedIndex(-1);
      setPlaceholder(UI_DEFAULTS.defaultSearchPrompt);
      return;
    }

    try {
      const data = await searchPrices(normalizedKeyword, second.trim());
      setResults(data);
      setSelectedIndex(-1);
      setPlaceholder(data.length ? "" : UI_DEFAULTS.defaultNoResultMessage);
    } catch (error) {
      console.error(`${DIALOG_TEXT.queryFailed}:`, error);
      setResults([]);
      setSelectedIndex(-1);
      setPlaceholder(`${DIALOG_TEXT.queryFailed}: ${(error as Error).message}`);
    }
  }

  function handleReplace() {
    const selectedItem = results[selectedIndex];
    if (!selectedItem) {
      setWarning(UI_DEFAULTS.defaultSelectPriceMessage);
      return;
    }
    const brand = extractBrand(selectedItem.ItemDesc || "", DIALOG_TEXT.brandKeywords);
    const material = extractMaterial(selectedItem.ItemDesc || "", DIALOG_TEXT.materialKeywords);
    sendToParent({
      action: DIALOG_ACTIONS.QUERYPRICE_REPLACE,
      data: {
        name: selectedItem.ItemName || "",
        desc: (selectedItem.ItemDesc || "").trim(),
        type: selectedItem.ItemType || "",
        brand,
        material,
        unit: selectedItem.ItemUnit || "",
        price: selectedItem.ItemPrice || 0,
      },
    });
  }

  return (
    <div className="dialog-shell">
      <div className="result-panel ui-surface ui-surface--solid">
        <div className="result-table">
          <div className="result-row header">
            <div className="result-cell name">{QUERYPRICE_HTML_TEXT.colName}</div>
            <div className="result-cell desc">{QUERYPRICE_HTML_TEXT.colDesc}</div>
            <div className="result-cell type">{QUERYPRICE_HTML_TEXT.colType}</div>
            <div className="result-cell price">{QUERYPRICE_HTML_TEXT.colPrice}</div>
          </div>
          <div className="result-list">
            {results.length ? (
              results.map((item, index) => (
                <div key={`${item.ItemName}-${index}`} className={`result-row ${index === selectedIndex ? "selected" : ""}`} onClick={() => setSelectedIndex(index)}>
                  <div className="result-cell name" title={item.ItemName || ""}>{item.ItemName || "-"}</div>
                  <div className="result-cell desc" title={item.ItemDesc || ""}>{item.ItemDesc || "-"}</div>
                  <div className="result-cell type" title={item.ItemType || ""}>{item.ItemType || "-"}</div>
                  <div className="result-cell price" title={formatPriceDecimal(item.ItemPrice)}>{formatPriceDecimal(item.ItemPrice)}</div>
                </div>
              ))
            ) : (
              <div className="placeholder">
                <div className="placeholder-content">
                  <div className="placeholder-icon">{UI_DEFAULTS.defaultSearchIcon}</div>
                  <div>{placeholder}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="search-panel ui-surface">
        <div className="input-group">
          <label htmlFor="mainKeyword">{QUERYPRICE_HTML_TEXT.labelMainKeyword}</label>
          <input
            id="mainKeyword"
            className="input ui-input"
            type="text"
            placeholder={QUERYPRICE_HTML_TEXT.phMainKeyword}
            value={mainKeyword}
            onChange={(e) => setMainKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleSearch();
              }
            }}
          />
        </div>
        <div className="input-group">
          <label htmlFor="secondKeyword">{QUERYPRICE_HTML_TEXT.labelSecondKeyword}</label>
          <input
            id="secondKeyword"
            className="input ui-input"
            type="text"
            placeholder={QUERYPRICE_HTML_TEXT.phSecondKeyword}
            value={secondKeyword}
            onChange={(e) => setSecondKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleSearch();
              }
            }}
          />
        </div>
        <div className="actions">
          <button className="btn ui-btn ui-btn--secondary" onClick={() => sendToParent({ action: DIALOG_ACTIONS.QUERYPRICE_CANCEL })}>
            {QUERYPRICE_HTML_TEXT.btnCancel}
          </button>
          <button className="btn ui-btn ui-btn--primary" onClick={() => void handleSearch()}>
            {QUERYPRICE_HTML_TEXT.btnSearch}
          </button>
          <button className="btn ui-btn ui-btn--primary" disabled={selectedIndex < 0} onClick={handleReplace}>
            {QUERYPRICE_HTML_TEXT.btnReplace}
          </button>
        </div>
      </div>

      <div className={`warning-mask ui-modal-backdrop ${warning ? "" : "hidden"}`} role="dialog" aria-modal="true">
        <div className="warning-card ui-modal-card">
          <div className="warning-title ui-modal-title">{QUERYPRICE_HTML_TEXT.warningTitle}</div>
          <div className="warning-text ui-modal-message">{warning}</div>
          <div className="warning-actions">
            <button className="btn ui-btn ui-btn--primary" onClick={() => setWarning("")}>
              {QUERYPRICE_HTML_TEXT.btnOk}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

async function searchPrices(mainKeyword: string, secondKeyword: string): Promise<PriceResult[]> {
  const url = new URL(`${API_BASE}${API_PATHS.priceSearch}`, window.location.origin);
  url.searchParams.set("keyword", mainKeyword);
  const response = await fetch(url.toString());
  const result = await response.json();
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || result?.message || UI_DEFAULTS.defaultQueryFailMessage);
  }
  let data: PriceResult[] = result.data || [];
  if (secondKeyword && data.length > 0) {
    const secondLower = secondKeyword.toLowerCase();
    data = data.filter((item) => (item.ItemDesc || "").toLowerCase().includes(secondLower));
  }
  return data;
}

Office.onReady(() => {
  const root = document.getElementById("root");
  if (!root) return;
  createRoot(root).render(<QueryPriceApp />);
});
