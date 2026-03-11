import { API_PATHS, APP_URLS } from "../shared/appConstants";
import logoLargeUrl from "../../assets/logo-large.png";

const STORAGE_KEY = "quotation_addin_quote_preview_payload";
const EXPORT_PDF_URL = `${APP_URLS.apiBase}${API_PATHS.exportQuotePdf}`;

type GridRow = string[];
type MergeCell = { row: number; col: number; rowspan: number; colspan: number };
type QuoteSheetLayout = {
  rowHeights?: number[];
  colWidths?: number[];
  merges?: MergeCell[];
};

let quoteLogoDataUrlCache: string | null = null;

async function getQuoteLogoDataUrl(): Promise<string> {
  if (quoteLogoDataUrlCache) {
    return quoteLogoDataUrlCache;
  }
  const response = await fetch(logoLargeUrl, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`logo load failed: ${response.status}`);
  }
  const blob = await response.blob();
  quoteLogoDataUrlCache = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("logo read failed"));
    reader.readAsDataURL(blob);
  });
  return quoteLogoDataUrlCache;
}

function escapeHtml(text: unknown) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function defaultGrid(colCount = 7): GridRow[] {
  const count = Math.max(1, Number(colCount || 7));
  const rows: GridRow[] = Array.from({ length: 29 }, () => Array.from({ length: count }, () => ""));
  rows[0][0] = "湖南华通众智科技有限公司";
  rows[6][0] = "报价汇总表";
  if (count >= 7) {
    rows[7] = ["序号", "项目", "", "成本（元）", "单价（元）", "系数", "备注"];
  } else {
    rows[7] = ["序号", "项目", "", "单价（元）", "备注"];
  }
  rows[21][0] = "总计（元）";
  rows[22][0] = "备注";
  return rows;
}

function loadGrid(): GridRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const grid = parsed && Array.isArray(parsed.quoteSheetGrid) ? parsed.quoteSheetGrid : null;
    const mode = String(parsed?.quotePreviewMode || "").trim().toLowerCase();
    const inferredCols = Array.isArray(grid?.[0]) ? grid[0].length : 0;
    const colCount = mode === "preliminary" ? 5 : inferredCols >= 5 ? Math.min(7, inferredCols) : 7;
    if (!grid || !grid.length) return defaultGrid(colCount);
    const normalized = grid.map((row: unknown) => {
      const r = Array.isArray(row) ? row.slice(0, colCount).map((cell) => String(cell ?? "")) : [];
      while (r.length < colCount) r.push("");
      return r;
    });
    const hasAnyText = normalized.some((row: string[]) => row.some((cell) => String(cell || "").trim().length > 0));
    return hasAnyText ? normalized : defaultGrid(colCount);
  } catch (e) {
    console.error("读取报价汇总表预览数据失败", e);
    return defaultGrid();
  }
}

function getDefaultMergeConfig(colCount: number): MergeCell[] {
  if (colCount <= 5) {
    return [
      { row: 1, col: 1, rowspan: 1, colspan: 5 },
      { row: 2, col: 1, rowspan: 1, colspan: 2 },
      { row: 2, col: 3, rowspan: 1, colspan: 3 },
      { row: 3, col: 1, rowspan: 1, colspan: 2 },
      { row: 4, col: 1, rowspan: 1, colspan: 2 },
      { row: 5, col: 1, rowspan: 1, colspan: 2 },
      { row: 6, col: 1, rowspan: 1, colspan: 2 },
      { row: 7, col: 1, rowspan: 1, colspan: 5 },
      { row: 8, col: 2, rowspan: 1, colspan: 2 },
      ...Array.from({ length: 13 }, (_, i) => ({ row: 9 + i, col: 2, rowspan: 1, colspan: 2 })),
      { row: 22, col: 1, rowspan: 1, colspan: 3 },
      { row: 23, col: 1, rowspan: 7, colspan: 2 },
      ...Array.from({ length: 7 }, (_, i) => ({ row: 23 + i, col: 3, rowspan: 1, colspan: 3 })),
    ];
  }
  return [
    { row: 1, col: 1, rowspan: 1, colspan: 7 },
    { row: 2, col: 1, rowspan: 1, colspan: 2 },
    { row: 2, col: 3, rowspan: 1, colspan: 5 },
    { row: 3, col: 1, rowspan: 1, colspan: 2 },
    { row: 3, col: 3, rowspan: 1, colspan: 2 },
    { row: 3, col: 5, rowspan: 1, colspan: 2 },
    { row: 4, col: 1, rowspan: 1, colspan: 2 },
    { row: 4, col: 3, rowspan: 1, colspan: 2 },
    { row: 4, col: 5, rowspan: 1, colspan: 2 },
    { row: 5, col: 1, rowspan: 1, colspan: 2 },
    { row: 5, col: 3, rowspan: 1, colspan: 2 },
    { row: 5, col: 5, rowspan: 1, colspan: 2 },
    { row: 6, col: 1, rowspan: 1, colspan: 2 },
    { row: 6, col: 3, rowspan: 1, colspan: 2 },
    { row: 6, col: 5, rowspan: 1, colspan: 2 },
    { row: 7, col: 1, rowspan: 1, colspan: 7 },
    { row: 8, col: 2, rowspan: 1, colspan: 2 },
    ...Array.from({ length: 13 }, (_, i) => ({ row: 9 + i, col: 2, rowspan: 1, colspan: 2 })),
    { row: 22, col: 1, rowspan: 1, colspan: 3 },
    { row: 23, col: 1, rowspan: 7, colspan: 2 },
    ...Array.from({ length: 7 }, (_, i) => ({ row: 23 + i, col: 3, rowspan: 1, colspan: 5 })),
  ];
}

function getLayout(): QuoteSheetLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const layout = (parsed?.quoteSheetLayout || {}) as QuoteSheetLayout;
    return {
      rowHeights: Array.isArray(layout.rowHeights) ? layout.rowHeights.map((n) => Number(n || 0)) : [],
      colWidths: Array.isArray(layout.colWidths) ? layout.colWidths.map((n) => Number(n || 0)) : [],
      merges: Array.isArray(layout.merges) ? layout.merges : [],
    };
  } catch {
    return { rowHeights: [], colWidths: [], merges: [] };
  }
}

function buildMergeMaps(merges: MergeCell[] | undefined, colCount: number) {
  const starts = new Map<string, MergeCell>();
  const covered = new Set<string>();
  const sourceList = merges && merges.length ? merges : getDefaultMergeConfig(colCount);
  const mergeList = sourceList
    .map((m) => {
      const startCol = Math.max(1, Number(m.col || 1));
      if (startCol > colCount) return null;
      const endCol = Math.min(colCount, startCol + Math.max(1, Number(m.colspan || 1)) - 1);
      const colspan = endCol - startCol + 1;
      if (colspan <= 0) return null;
      return {
        row: Number(m.row || 1),
        col: startCol,
        rowspan: Math.max(1, Number(m.rowspan || 1)),
        colspan,
      } as MergeCell;
    })
    .filter(Boolean) as MergeCell[];
  mergeList.forEach((m) => {
    starts.set(`${m.row}:${m.col}`, m);
    for (let r = m.row; r < m.row + m.rowspan; r++) {
      for (let c = m.col; c < m.col + m.colspan; c++) {
        if (r === m.row && c === m.col) continue;
        covered.add(`${r}:${c}`);
      }
    }
  });
  return { starts, covered };
}

function cellClass(row: number, col: number, colCount: number) {
  const classes: string[] = [];
  if (row === 1 || row === 7 || row === 8 || row === 22) classes.push("bold");
  if (row === 1) classes.push("title", "center");
  if (row === 7 || row === 8 || row === 22) classes.push("center");
  const dataCenterCols = colCount === 5 ? new Set([1, 4]) : new Set([1, 4, 5, 6]);
  if ((row >= 9 && row <= 21 && dataCenterCols.has(col)) || (row >= 2 && row <= 6)) {
    classes.push("center");
  }
  if (row === 23 && col === 1) {
    classes.push("center");
  }
  if (row >= 23) classes.push("notes");
  return classes.join(" ");
}

async function renderGrid() {
  const grid = loadGrid();
  const layout = getLayout();
  const table = document.getElementById("quoteSheet") as HTMLTableElement | null;
  if (!table) return;
  const row1Height = Number(layout.rowHeights?.[0] || 0);
  const logoHeightPx = row1Height > 0 ? Math.max(8, Math.round(row1Height / 2)) : 24;
  let logoDataUrl = "";
  try {
    logoDataUrl = await getQuoteLogoDataUrl();
  } catch (error) {
    console.warn("加载报价Logo失败，预览将不显示Logo。", error);
  }

  const colCount = Math.max(1, Number(grid?.[0]?.length || 7));
  const mergeMaps = buildMergeMaps(layout.merges, colCount);
  const colWidths = (layout.colWidths || []).slice(0, colCount);
  let html = "";
  if (colWidths.length) {
    html += "<colgroup>";
    for (let c = 0; c < colCount; c++) {
      const width = Number(colWidths[c] || 0);
      const px = width > 0 ? Math.max(20, Math.round(width)) : 80;
      html += `<col style="width:${px}px" />`;
    }
    html += "</colgroup>";
  }
  for (let r = 1; r <= Math.min(29, grid.length); r++) {
    const rowHeight = Number(layout.rowHeights?.[r - 1] || 0);
    const rowStyle = rowHeight > 0 ? ` style="height:${Math.round(rowHeight)}px"` : "";
    html += `<tr class="quote-row-${r}"${rowStyle}>`;
    for (let c = 1; c <= colCount; c++) {
      const key = `${r}:${c}`;
      if (mergeMaps.covered.has(key)) continue;
      const merge = mergeMaps.starts.get(key);
      const attrs: string[] = [];
      if (merge && merge.rowspan > 1) attrs.push(`rowspan="${merge.rowspan}"`);
      if (merge && merge.colspan > 1) attrs.push(`colspan="${merge.colspan}"`);
      const cls = cellClass(r, c, colCount);
      if (cls) attrs.push(`class="${cls}"`);
      const text = grid[r - 1]?.[c - 1] || "";
      if (r === 1 && c === 1 && logoDataUrl) {
        html += `<td ${attrs.join(" ")}><div class="title-cell"><img class="title-logo" src="${logoDataUrl}" alt="logo" style="height:${logoHeightPx}px" /><span class="title-text">${escapeHtml(text)}</span></div></td>`;
      } else {
        html += `<td ${attrs.join(" ")}>${escapeHtml(text)}</td>`;
      }
    }
    html += "</tr>";
  }
  table.innerHTML = html;
  document.title = (grid[6]?.[0] || "报价汇总表").trim() || "报价汇总表";
}

function bindExportMenu() {
  const menu = document.getElementById("contextMenu") as HTMLDivElement | null;
  const exportBtn = document.getElementById("exportPdfBtn") as HTMLButtonElement | null;
  if (!menu || !exportBtn) return;

  const hideMenu = () => {
    menu.style.display = "none";
  };

  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.style.display = "block";
  });
  document.addEventListener("click", hideMenu);
  document.addEventListener("scroll", hideMenu, true);
  window.addEventListener("resize", hideMenu);

  exportBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    hideMenu();
    try {
      const docTitle = (document.title || "报价汇总表").trim() || "报价汇总表";
      const exportHtml = await buildExportHtmlWithInlineStyles();
      const response = await fetch(EXPORT_PDF_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: docTitle,
          html: exportHtml,
        }),
      });

      if (!response.ok) {
        let message = "导出PDF失败";
        try {
          const data = await response.json();
          message = data?.error || data?.message || message;
        } catch {
          // ignore non-json errors
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${docTitle}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      exportBtn.textContent = err?.message || "导出PDF失败";
      setTimeout(() => {
        exportBtn.textContent = "导出为PDF";
      }, 2000);
    }
  });
}

async function buildExportHtmlWithInlineStyles(): Promise<string> {
  const htmlEl = document.documentElement.cloneNode(true) as HTMLElement;
  const clonedHead = htmlEl.querySelector("head");
  if (!clonedHead) {
    return "<!DOCTYPE html>" + document.documentElement.outerHTML;
  }

  const inlineCssParts: string[] = [];
  const styleNodes = Array.from(document.querySelectorAll("style"));
  styleNodes.forEach((node) => {
    const css = String(node.textContent || "").trim();
    if (css) inlineCssParts.push(css);
  });

  const linkNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
  for (const link of linkNodes) {
    const href = String(link.getAttribute("href") || "").trim();
    if (!href) continue;
    try {
      const cssUrl = new URL(href, window.location.href).toString();
      const resp = await fetch(cssUrl, { cache: "no-store" });
      if (!resp.ok) continue;
      const cssText = String(await resp.text() || "").trim();
      if (cssText) inlineCssParts.push(cssText);
    } catch {
      // ignore CSS fetch failures and continue with available styles
    }
  }

  Array.from(clonedHead.querySelectorAll('link[rel="stylesheet"]')).forEach((node) => node.remove());
  if (inlineCssParts.length) {
    const style = document.createElement("style");
    style.textContent = inlineCssParts.join("\n\n");
    clonedHead.appendChild(style);
  }
  return "<!DOCTYPE html>" + htmlEl.outerHTML;
}

async function init() {
  await renderGrid();
  bindExportMenu();
}

void init();
