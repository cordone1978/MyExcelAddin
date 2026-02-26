import { API_PATHS, APP_URLS } from "../shared/appConstants";

const STORAGE_KEY = "quotation_addin_quote_preview_payload";
const EXPORT_PDF_URL = `${APP_URLS.apiBase}${API_PATHS.exportQuotePdf}`;

type GridRow = string[];
type MergeCell = { row: number; col: number; rowspan: number; colspan: number };
type QuoteSheetLayout = {
  rowHeights?: number[];
  colWidths?: number[];
  merges?: MergeCell[];
};

function escapeHtml(text: unknown) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function defaultGrid(): GridRow[] {
  const rows: GridRow[] = Array.from({ length: 29 }, () => ["", "", "", ""]);
  rows[0][0] = "湖南华通众智科技有限公司";
  rows[6][0] = "报价汇总表";
  rows[7] = ["序号", "项目", "单价（元）", "备注"];
  rows[21][0] = "总计（元）";
  rows[22][0] = "备注";
  return rows;
}

function loadGrid(): GridRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const grid = parsed && Array.isArray(parsed.quoteSheetGrid) ? parsed.quoteSheetGrid : null;
    if (!grid || !grid.length) return defaultGrid();
    const normalized = grid.map((row: unknown) => {
      const r = Array.isArray(row) ? row.slice(0, 4).map((cell) => String(cell ?? "")) : [];
      while (r.length < 4) r.push("");
      return r;
    });
    const hasAnyText = normalized.some((row: string[]) => row.some((cell) => String(cell || "").trim().length > 0));
    return hasAnyText ? normalized : defaultGrid();
  } catch (e) {
    console.error("读取报价汇总表预览数据失败", e);
    return defaultGrid();
  }
}

function getDefaultMergeConfig(): MergeCell[] {
  return [
    { row: 1, col: 1, rowspan: 1, colspan: 4 },
    { row: 2, col: 2, rowspan: 1, colspan: 3 },
    { row: 7, col: 1, rowspan: 1, colspan: 4 },
    { row: 22, col: 1, rowspan: 1, colspan: 2 },
    { row: 23, col: 1, rowspan: 7, colspan: 1 },
    { row: 23, col: 2, rowspan: 1, colspan: 3 },
    { row: 24, col: 2, rowspan: 1, colspan: 3 },
    { row: 25, col: 2, rowspan: 1, colspan: 3 },
    { row: 26, col: 2, rowspan: 1, colspan: 3 },
    { row: 27, col: 2, rowspan: 1, colspan: 3 },
    { row: 28, col: 2, rowspan: 1, colspan: 3 },
    { row: 29, col: 2, rowspan: 1, colspan: 3 },
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

function buildMergeMaps(merges?: MergeCell[]) {
  const starts = new Map<string, MergeCell>();
  const covered = new Set<string>();
  const mergeList = merges && merges.length ? merges : getDefaultMergeConfig();
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

function cellClass(row: number, col: number) {
  const classes: string[] = [];
  if (row === 1 || row === 7 || row === 8 || row === 22) classes.push("bold");
  if (row === 1) classes.push("title", "center");
  if (row === 7 || row === 8 || row === 22) classes.push("center");
  if ((row >= 9 && row <= 21 && (col === 1 || col === 3)) || (row >= 2 && row <= 6 && col !== 2 && col !== 4)) {
    classes.push("center");
  }
  if (row >= 23) classes.push("notes");
  return classes.join(" ");
}

function renderGrid() {
  const grid = loadGrid();
  const layout = getLayout();
  const table = document.getElementById("quoteSheet") as HTMLTableElement | null;
  if (!table) return;

  const mergeMaps = buildMergeMaps(layout.merges);
  const colWidths = (layout.colWidths || []).slice(0, 4);
  let html = "";
  if (colWidths.length) {
    html += "<colgroup>";
    for (let c = 0; c < 4; c++) {
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
    for (let c = 1; c <= 4; c++) {
      const key = `${r}:${c}`;
      if (mergeMaps.covered.has(key)) continue;
      const merge = mergeMaps.starts.get(key);
      const attrs: string[] = [];
      if (merge && merge.rowspan > 1) attrs.push(`rowspan="${merge.rowspan}"`);
      if (merge && merge.colspan > 1) attrs.push(`colspan="${merge.colspan}"`);
      const cls = cellClass(r, c);
      if (cls) attrs.push(`class="${cls}"`);
      const text = grid[r - 1]?.[c - 1] || "";
      html += `<td ${attrs.join(" ")}>${escapeHtml(text)}</td>`;
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
      const response = await fetch(EXPORT_PDF_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: docTitle,
          html: "<!DOCTYPE html>" + document.documentElement.outerHTML,
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

function init() {
  renderGrid();
  bindExportMenu();
}

init();
