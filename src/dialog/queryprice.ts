import { DIALOG_ACTIONS } from "../shared/dialogActions";
import { API_PATHS, APP_URLS, UI_DEFAULTS } from "../shared/appConstants";
import { DIALOG_TEXT, QUERYPRICE_HTML_TEXT } from "../shared/businessTextConstants";
/* global Office, console, document, window */

const API_BASE = APP_URLS.apiBase;

type PriceResult = {
  ItemName: string;
  ItemDesc: string;
  ItemType: string;
  ItemPrice: number;
  ItemUnit: string;
  OrderDate: string;
};

let selectedItem: PriceResult | null = null;
let selectedRowEl: HTMLDivElement | null = null;

Office.onReady(() => {
  applyStaticText();
  document.getElementById("searchBtn")?.addEventListener("click", handleSearch);
  document.getElementById("cancelBtn")?.addEventListener("click", handleCancel);
  document.getElementById("replaceBtn")?.addEventListener("click", handleReplace);
  document.getElementById("warningOkBtn")?.addEventListener("click", hideWarningModal);

  document.getElementById("mainKeyword")?.addEventListener("keypress", (e) => {
    if ((e as KeyboardEvent).key === "Enter") {
      void handleSearch();
    }
  });
  document.getElementById("secondKeyword")?.addEventListener("keypress", (e) => {
    if ((e as KeyboardEvent).key === "Enter") {
      void handleSearch();
    }
  });

  Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, (arg: Office.DialogParentMessageReceivedEventArgs) => {
    try {
      const payload = JSON.parse(arg?.message || "{}");
      if (payload?.action === DIALOG_ACTIONS.QUERYPRICE_WARNING) {
        showWarningModal(payload.message || UI_DEFAULTS.defaultWarningMessage);
      }
    } catch (error) {
      console.error(`${DIALOG_TEXT.handleParentMessageFailed}:`, error);
    }
  });

  (document.getElementById("mainKeyword") as HTMLInputElement | null)?.focus();
});

function applyStaticText() {
  document.title = QUERYPRICE_HTML_TEXT.title;
  setText("colName", QUERYPRICE_HTML_TEXT.colName);
  setText("colDesc", QUERYPRICE_HTML_TEXT.colDesc);
  setText("colType", QUERYPRICE_HTML_TEXT.colType);
  setText("colPrice", QUERYPRICE_HTML_TEXT.colPrice);
  setText("labelMainKeyword", QUERYPRICE_HTML_TEXT.labelMainKeyword);
  setText("labelSecondKeyword", QUERYPRICE_HTML_TEXT.labelSecondKeyword);
  setPlaceholder("mainKeyword", QUERYPRICE_HTML_TEXT.phMainKeyword);
  setPlaceholder("secondKeyword", QUERYPRICE_HTML_TEXT.phSecondKeyword);
  setText("cancelBtn", QUERYPRICE_HTML_TEXT.btnCancel);
  setText("searchBtn", QUERYPRICE_HTML_TEXT.btnSearch);
  setText("replaceBtn", QUERYPRICE_HTML_TEXT.btnReplace);
  setText("warningTitle", QUERYPRICE_HTML_TEXT.warningTitle);
  setText("warningOkBtn", QUERYPRICE_HTML_TEXT.btnOk);
  setActionButtonsEnabled(false);
}

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setPlaceholder(id: string, text: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.placeholder = text;
}

async function handleSearch() {
  const mainKeyword = (document.getElementById("mainKeyword") as HTMLInputElement | null)?.value?.trim() || "";
  const secondKeyword = (document.getElementById("secondKeyword") as HTMLInputElement | null)?.value?.trim() || "";

  if (!mainKeyword) {
    showPlaceholder(UI_DEFAULTS.defaultSearchPrompt);
    return;
  }

  try {
    const result = await searchPrices(mainKeyword, secondKeyword);
    displayResults(result);
  } catch (error) {
    console.error(`${DIALOG_TEXT.queryFailed}:`, error);
    showPlaceholder(`${DIALOG_TEXT.queryFailed}: ` + (error as Error).message);
  }
}

async function searchPrices(mainKeyword: string, secondKeyword: string): Promise<PriceResult[]> {
  const url = new URL(`${API_BASE}${API_PATHS.priceSearch}`, window.location.origin);
  url.searchParams.set("keyword", mainKeyword);

  const response = await fetch(url.toString());
  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || result.message || UI_DEFAULTS.defaultQueryFailMessage);
  }

  let data: PriceResult[] = result.data || [];

  if (secondKeyword && data.length > 0) {
    const secondLower = secondKeyword.toLowerCase();
    data = data.filter((item) => (item.ItemDesc || "").toLowerCase().includes(secondLower));
  }

  return data;
}

function displayResults(results: PriceResult[]) {
  const resultList = document.getElementById("resultList");
  if (!resultList) return;

  if (results.length === 0) {
    setActionButtonsEnabled(false);
    showPlaceholder(UI_DEFAULTS.defaultNoResultMessage);
    return;
  }

  resultList.innerHTML = "";
  selectedItem = null;
  selectedRowEl = null;
  setActionButtonsEnabled(false);

  results.forEach((item) => {
    const row = document.createElement("div");
    row.className = "result-row";

    row.innerHTML = `
      <div class="result-cell name" title="${escapeHtml(item.ItemName || "")}">${escapeHtml(item.ItemName || "-")}</div>
      <div class="result-cell desc" title="${escapeHtml(item.ItemDesc || "")}">${escapeHtml(item.ItemDesc || "-")}</div>
      <div class="result-cell type" title="${escapeHtml(item.ItemType || "")}">${escapeHtml(item.ItemType || "-")}</div>
      <div class="result-cell price" title="${formatPrice(item.ItemPrice)}">${formatPrice(item.ItemPrice)}</div>
    `;

    row.addEventListener("click", () => selectRow(item, row));
    resultList.appendChild(row);
  });
}

function selectRow(item: PriceResult, row: HTMLDivElement) {
  selectedItem = item;
  if (selectedRowEl) {
    selectedRowEl.classList.remove("selected");
  }
  selectedRowEl = row;
  selectedRowEl.classList.add("selected");
  setActionButtonsEnabled(true);
}

function handleReplace() {
  sendSelectedToParent();
}

function sendSelectedToParent() {
  if (!selectedItem) {
    showWarningModal(UI_DEFAULTS.defaultSelectPriceMessage);
    return;
  }
  const item = selectedItem;
  const brand = extractBrand(item.ItemDesc || "");
  const material = extractMaterial(item.ItemDesc || "");
  const cleanedDesc = cleanDescription(item.ItemDesc || "");

  Office.context.ui.messageParent(
    JSON.stringify({
      action: DIALOG_ACTIONS.QUERYPRICE_REPLACE,
      data: {
        name: item.ItemName || "",
        desc: cleanedDesc,
        type: item.ItemType || "",
        brand,
        material,
        unit: item.ItemUnit || "",
        price: item.ItemPrice || 0,
      },
    })
  );
}

function cleanDescription(fullDesc: string): string {
  return fullDesc.trim();
}

function extractBrand(text: string): string {
  return extractInfo(text, DIALOG_TEXT.brandKeywords);
}

function extractMaterial(text: string): string {
  return extractInfo(text, DIALOG_TEXT.materialKeywords);
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

function formatPrice(price: number | string | null | undefined): string {
  if (price === null || price === undefined || price === "") return "-";
  const num = typeof price === "number" ? price : parseFloat(String(price));
  if (Number.isNaN(num)) return "-";
  return num.toFixed(2);
}

function showPlaceholder(message: string) {
  const resultList = document.getElementById("resultList");
  if (!resultList) return;

  resultList.innerHTML = `
    <div class="placeholder">
      <div style="font-size: 24px; margin-bottom: 8px;">${UI_DEFAULTS.defaultSearchIcon}</div>
      <div>${escapeHtml(message)}</div>
    </div>
  `;
  setActionButtonsEnabled(false);
}

function setActionButtonsEnabled(enabled: boolean) {
  const replaceBtn = document.getElementById("replaceBtn") as HTMLButtonElement | null;
  if (replaceBtn) replaceBtn.disabled = !enabled;
}

function handleCancel() {
  Office.context.ui.messageParent(JSON.stringify({ action: DIALOG_ACTIONS.QUERYPRICE_CANCEL }));
}

function showWarningModal(message: string) {
  const text = document.getElementById("warningText");
  const mask = document.getElementById("warningModal");
  if (!text || !mask) return;

  text.textContent = message;
  mask.classList.remove("hidden");
}

function hideWarningModal() {
  const mask = document.getElementById("warningModal");
  if (!mask) return;

  mask.classList.add("hidden");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


