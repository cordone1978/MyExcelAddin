/* global Excel, console, fetch, btoa */

import {
  BUILDSHEET_COLUMNS,
  BUILDSHEET_RANGES,
  BUILDSHEET_STYLE,
} from "../shared/buildsheetConstants";
import { BUILDSHEET_TEXT } from "../shared/businessTextConstants";
import { SHEET_NAMES } from "../shared/sheetNames";

interface SystemItem {
  id: number;
  name: string;
}

const RELATED_GRAPH_SHEET_NAMES = ["_graph_store", "_graph_store_dev"];
const QUOTE_COMPANY_LOGO_NAME = "quote-company-logo";
let quoteCompanyLogoBase64Cache: string | null = null;

async function fetchImageAsBase64(url: string): Promise<string> {
  if (quoteCompanyLogoBase64Cache) {
    return quoteCompanyLogoBase64Cache;
  }
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load image: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }
  quoteCompanyLogoBase64Cache = btoa(binary);
  return quoteCompanyLogoBase64Cache;
}

async function addCompanyLogoToQuoteSheet(
  context: Excel.RequestContext,
  sheet: Excel.Worksheet
): Promise<void> {
  const logoBase64 = await fetchImageAsBase64("/assets/logo-large.png");
  const titleRange = sheet.getRange("A1:H1");
  titleRange.load("left,top,height,width");
  await context.sync();

  const shape = sheet.shapes.addImage(logoBase64);
  shape.name = QUOTE_COMPANY_LOGO_NAME;
  shape.lockAspectRatio = true;
  const logoHeight = Math.max(8, titleRange.height / 2);
  shape.height = logoHeight;
  shape.left = titleRange.left;
  // 左对齐 + 在合并标题单元格内垂直居中
  shape.top = titleRange.top + Math.max(0, (titleRange.height - logoHeight) / 2);
}

function buildConfigSectionTotalFormula(
  titleRow: number,
  labelColumn: string,
  sumColumn: string,
  labelText: string
): string {
  const labelCol = String(labelColumn || "O").toUpperCase();
  const sumCol = String(sumColumn || "P").toUpperCase();
  const text = String(labelText || "总价");
  return `=IF($${labelCol}${titleRow}<>"${text}","",LET(s,ROW()+2,n,IFERROR(AGGREGATE(15,6,ROW($${labelCol}$1:$${labelCol}$9978)/(ROW($${labelCol}$1:$${labelCol}$9978)>=s)/($${labelCol}$1:$${labelCol}$9978="${text}"),1),0),e,IF(n=0,LOOKUP(2,1/($B$1:$B$9978<>""),ROW($B$1:$B$9978)),n-1),IF(e<s,0,SUM(INDEX($${sumCol}:$${sumCol},s):INDEX($${sumCol}:$${sumCol},e)))))`;
}

function splitSectionTitle(rawTitle: string): { ordinal: string; text: string } {
  const title = String(rawTitle || "").trim();
  const match = title.match(/^([一二三四五六七八九十百零\d]+)[、.\s]*(.*)$/);
  if (!match) {
    return { ordinal: "", text: title };
  }
  return {
    ordinal: String(match[1] || "").trim(),
    text: String(match[2] || "").trim(),
  };
}

export async function createQuotationSheet(systems?: SystemItem[]) {
  try {
    await Excel.run(async (context) => {
      await cleanupRelatedHiddenSheets(context);
      await buildQuotationSheet(context, systems);
      await buildConfigSheet(context);
      await buildEasypartsSheet(context);
    });
  } catch (error) {
    console.error(error);
  }
}

export async function createQuotationSummarySheet(systems?: SystemItem[]) {
  try {
    await Excel.run(async (context) => {
      await cleanupRelatedHiddenSheets(context);
      await buildQuotationSheet(context, systems);
    });
  } catch (error) {
    console.error(error);
  }
}

async function cleanupRelatedHiddenSheets(context: Excel.RequestContext) {
  const candidates = RELATED_GRAPH_SHEET_NAMES.map((name) =>
    context.workbook.worksheets.getItemOrNullObject(name)
  );
  candidates.forEach((sheet) => sheet.load("name,isNullObject,visibility"));
  await context.sync();

  candidates.forEach((sheet) => {
    if (sheet.isNullObject) return;
    // 生成新模板时，图形缓存sheet无论可见状态都清空，避免模板抽屉残留旧图片。
    sheet.delete();
  });
  await context.sync();
}

async function buildQuotationSheet(context: Excel.RequestContext, systems?: SystemItem[]) {
  const sheetName = SHEET_NAMES.quoteSummary;
  const existing = context.workbook.worksheets.getItemOrNullObject(sheetName);
  existing.load("name");
  await context.sync();
  if (!existing.isNullObject) {
    existing.delete();
    await context.sync();
  }

  const sheet = context.workbook.worksheets.add(sheetName);
  sheet.activate();
  sheet.showGridlines = false;
  context.application.suspendScreenUpdatingUntilNextSync();

  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").values = [[BUILDSHEET_TEXT.companyName]];
  sheet.getRange("A1").format.font.bold = true;
  sheet.getRange("A1").format.font.size = 24;
  sheet.getRange("A1").format.horizontalAlignment = "Center";
  sheet.getRange("A1").format.verticalAlignment = "Center";

  sheet.getRange("A2:H6").values = BUILDSHEET_TEXT.quoteInfoRows;
  for (let row = 2; row <= 6; row += 1) {
    sheet.getRange(`A${row}:B${row}`).merge();
    if (row === 2) {
      sheet.getRange("C2:H2").merge();
    } else {
      sheet.getRange(`C${row}:E${row}`).merge();
      sheet.getRange(`F${row}:G${row}`).merge();
    }
  }
  sheet.getRange("A2:H6").format.horizontalAlignment = "Center";
  sheet.getRange("A2:H6").format.verticalAlignment = "Center";

  sheet.getRange("A7:H7").merge();
  sheet.getRange("A7").values = [[BUILDSHEET_TEXT.quoteTitle]];
  sheet.getRange("A7").format.font.bold = true;
  sheet.getRange("A7").format.horizontalAlignment = "Center";

  sheet.getRange(BUILDSHEET_RANGES.quoteHeader).values = [BUILDSHEET_TEXT.quoteHeader];
  sheet.getRange(BUILDSHEET_RANGES.quoteHeader).format.font.bold = true;
  sheet.getRange(BUILDSHEET_RANGES.quoteHeader).format.horizontalAlignment = "Center";
  sheet.getRange(BUILDSHEET_RANGES.quoteHeader).format.verticalAlignment = "Center";

  const defaultItems = BUILDSHEET_TEXT.quoteDefaultItems;
  const items =
    systems && systems.length > 0
      ? systems.slice(0, 13).map((s, i) => [i + 1, s.name || "", "", "", "", "", "", ""])
      : defaultItems;

  sheet.getRange(BUILDSHEET_RANGES.quoteItems).values = items;
  for (let row = 8; row <= 21; row += 1) {
    sheet.getRange(`B${row}:C${row}`).merge();
  }
  sheet.getRange("A9:A21").format.horizontalAlignment = "Center";
  sheet.getRange("D9:G21").format.horizontalAlignment = "Center";

  sheet.getRange("A22:D22").merge();
  sheet.getRange("A22").values = [[BUILDSHEET_TEXT.totalLabel]];
  sheet.getRange("E22").values = [[""]];
  sheet.getRange("A22:H22").format.font.bold = true;
  sheet.getRange("A22:H22").format.horizontalAlignment = "Center";

  sheet.getRange("A23:B29").merge();
  sheet.getRange("A23").values = [[BUILDSHEET_TEXT.remarkLabel]];
  sheet.getRange("A23").format.horizontalAlignment = "Center";
  sheet.getRange("A23").format.verticalAlignment = "Center";

  const notes = BUILDSHEET_TEXT.quoteNotes;

  notes.forEach((text, idx) => {
    const row = 23 + idx;
    sheet.getRange(`C${row}:H${row}`).merge();
    sheet.getRange(`C${row}`).values = [[text]];
  });

  sheet.getRange(BUILDSHEET_RANGES.quoteNotes).format.wrapText = true;
  sheet.getRange(BUILDSHEET_RANGES.quoteNotes).format.verticalAlignment = "Center";

  sheet.getRange(BUILDSHEET_RANGES.quoteMain).format.font.name = BUILDSHEET_STYLE.fontName;
  sheet.getRange(BUILDSHEET_RANGES.quoteMain).format.font.size = BUILDSHEET_STYLE.fontSize;
  // 统一字体后，重新覆盖标题字号，避免被上面的全局设置冲掉。
  sheet.getRange("A1").format.font.size = 24;
  sheet.getRange("A7").format.font.size = 14;

  const borderRange = sheet.getRange(BUILDSHEET_RANGES.quoteMain).format.borders;
  borderRange.getItem("InsideHorizontal").style = "Continuous";
  borderRange.getItem("InsideVertical").style = "Continuous";
  borderRange.getItem("EdgeTop").style = "Continuous";
  borderRange.getItem("EdgeBottom").style = "Continuous";
  borderRange.getItem("EdgeLeft").style = "Continuous";
  borderRange.getItem("EdgeRight").style = "Continuous";

  sheet.getRange("A:A").format.rowHeight = BUILDSHEET_STYLE.defaultRowHeight;
  sheet.getRange("1:1").format.rowHeight = BUILDSHEET_STYLE.defaultRowHeight * 3;
  sheet.getRange(BUILDSHEET_RANGES.quoteMain).format.autofitColumns();

  sheet.getRange("A:A").format.columnWidth = BUILDSHEET_COLUMNS.quote.A;
  sheet.getRange("B:B").format.columnWidth = BUILDSHEET_COLUMNS.quote.B;
  sheet.getRange("C:C").format.columnWidth = BUILDSHEET_COLUMNS.quote.C;
  sheet.getRange("D:D").format.columnWidth = BUILDSHEET_COLUMNS.quote.D;
  sheet.getRange("E:E").format.columnWidth = BUILDSHEET_COLUMNS.quote.E;
  sheet.getRange("F:F").format.columnWidth = BUILDSHEET_COLUMNS.quote.F;
  sheet.getRange("G:G").format.columnWidth = BUILDSHEET_COLUMNS.quote.G;
  sheet.getRange("H:H").format.columnWidth = BUILDSHEET_COLUMNS.quote.H;

  try {
    await addCompanyLogoToQuoteSheet(context, sheet);
  } catch (error) {
    console.warn("Failed to place company logo on quote sheet.", error);
  }

  await context.sync();
}

async function buildConfigSheet(context: Excel.RequestContext) {
  const sheetName = SHEET_NAMES.quoteConfig;
  const existing = context.workbook.worksheets.getItemOrNullObject(sheetName);
  existing.load("name");
  await context.sync();
  if (!existing.isNullObject) {
    existing.delete();
    await context.sync();
  }

  const sheet = context.workbook.worksheets.add(sheetName);
  sheet.activate();
  sheet.showGridlines = false;
  context.application.suspendApiCalculationUntilNextSync();
  context.application.suspendScreenUpdatingUntilNextSync();

  const headers = BUILDSHEET_TEXT.configHeaders;

  const sections = BUILDSHEET_TEXT.configSections;

  let row = 1;
  const titleRows: number[] = [];

  sections.forEach((title) => {
    const parsedTitle = splitSectionTitle(title);
    sheet.getRange(`A${row}:R${row}`).values = [new Array(headers.length).fill("")];
    sheet.getRange(`B${row}:K${row}`).merge();
    sheet.getRange(`A${row}`).values = [[parsedTitle.ordinal]];
    sheet.getRange(`B${row}`).values = [[parsedTitle.text]];
    sheet.getRange(`A${row}`).format.font.bold = true;
    sheet.getRange(`B${row}`).format.font.bold = true;
    sheet.getRange(`A${row}`).format.horizontalAlignment = "Center";
    sheet.getRange(`A${row}`).format.verticalAlignment = "Center";
    titleRows.push(row);

    sheet.getRange(`M${row}`).values = [["成本总价"]];
    sheet.getRange(`M${row}`).format.horizontalAlignment = "Center";
    sheet.getRange(`M${row}`).format.font.bold = true;

    sheet.getRange(`N${row}`).formulas = [
      [buildConfigSectionTotalFormula(row, "M", "N", "成本总价")],
    ];
    sheet.getRange(`N${row}`).format.horizontalAlignment = "Center";
    sheet.getRange(`N${row}`).format.font.bold = true;

    sheet.getRange(`O${row}`).values = [[BUILDSHEET_TEXT.configSectionTotalLabel]];
    sheet.getRange(`O${row}`).format.horizontalAlignment = "Center";
    sheet.getRange(`O${row}`).format.font.bold = true;
    sheet.getRange(`P${row}`).formulas = [[buildConfigSectionTotalFormula(row, "O", "P", "总价")]];
    sheet.getRange(`P${row}`).format.horizontalAlignment = "Center";
    sheet.getRange(`P${row}`).format.font.bold = true;

    row += 1;

    sheet.getRange(`A${row}:R${row}`).values = [headers];
    sheet.getRange(`A${row}:R${row}`).format.font.bold = true;
    sheet.getRange(`A${row}:R${row}`).format.horizontalAlignment = "Center";
    sheet.getRange(`A${row}:R${row}`).format.verticalAlignment = "Center";
    sheet.getRange(`A${row}`).format.rowHeight = BUILDSHEET_STYLE.defaultRowHeight;
    row += 1;
  });

  const lastRow = row - 1;
  sheet.getRange(`A1:R${lastRow}`).format.font.name = BUILDSHEET_STYLE.fontName;
  sheet.getRange(`A1:R${lastRow}`).format.font.size = BUILDSHEET_STYLE.fontSize;

  sheet.getRange("L:L").format.fill.color = BUILDSHEET_STYLE.costAreaColor;
  sheet.getRange("M:M").format.fill.color = BUILDSHEET_STYLE.costAreaColor;
  sheet.getRange("N:N").format.fill.color = BUILDSHEET_STYLE.costAreaColor;
  sheet.getRange("Q:Q").format.fill.color = BUILDSHEET_STYLE.costAreaColor;

  const borders = sheet.getRange(`A1:R${lastRow}`).format.borders;
  borders.getItem("InsideHorizontal").style = "Continuous";
  borders.getItem("InsideHorizontal").weight = "Medium";
  borders.getItem("InsideVertical").style = "Continuous";
  borders.getItem("InsideVertical").weight = "Thin";
  borders.getItem("EdgeTop").style = "Continuous";
  borders.getItem("EdgeTop").weight = "Medium";
  borders.getItem("EdgeBottom").style = "Continuous";
  borders.getItem("EdgeBottom").weight = "Medium";
  borders.getItem("EdgeLeft").style = "Continuous";
  borders.getItem("EdgeLeft").weight = "Thin";
  borders.getItem("EdgeRight").style = "Continuous";
  borders.getItem("EdgeRight").weight = "Medium";

  titleRows.forEach((titleRow) => {
    const titleBorders = sheet.getRange(`A${titleRow}:R${titleRow}`).format.borders;
    titleBorders.getItem("InsideVertical").style = "None";
    titleBorders.getItem("EdgeTop").style = "Continuous";
    titleBorders.getItem("EdgeTop").weight = "Medium";
    titleBorders.getItem("EdgeBottom").style = "Continuous";
    titleBorders.getItem("EdgeBottom").weight = "Medium";
    titleBorders.getItem("EdgeLeft").style = "None";
  });

  const cfg = BUILDSHEET_COLUMNS.config;
  sheet.getRange("A:A").format.columnWidth = cfg.A;
  sheet.getRange("B:B").format.columnWidth = cfg.B;
  sheet.getRange("C:C").format.columnWidth = cfg.C;
  sheet.getRange("D:D").format.columnWidth = cfg.D;
  sheet.getRange("E:E").format.columnWidth = cfg.E;
  sheet.getRange("F:F").format.columnWidth = cfg.F;
  sheet.getRange("G:G").format.columnWidth = cfg.G;
  sheet.getRange("H:H").format.columnWidth = cfg.H;
  sheet.getRange("I:I").format.columnWidth = cfg.I;
  sheet.getRange("J:J").format.columnWidth = cfg.J;
  sheet.getRange("K:K").format.columnWidth = cfg.K;
  sheet.getRange("L:L").format.columnWidth = cfg.L;
  sheet.getRange("M:M").format.columnWidth = cfg.M;
  sheet.getRange("N:N").format.columnWidth = cfg.N;
  sheet.getRange("O:O").format.columnWidth = cfg.O;
  sheet.getRange("P:P").format.columnWidth = cfg.P;
  sheet.getRange("Q:Q").format.columnWidth = cfg.Q;
  sheet.getRange("R:R").format.columnWidth = cfg.R;

  sheet.getRange("L:L").numberFormat = [["#,##0"]];
  sheet.getRange("M:M").numberFormat = [["#,##0"]];
  sheet.getRange("N:N").numberFormat = [["#,##0"]];
  sheet.getRange("O:O").numberFormat = [["#,##0"]];
  sheet.getRange("P:P").numberFormat = [["#,##0"]];

  sheet.getRange(BUILDSHEET_RANGES.configLongRows).format.rowHeight =
    BUILDSHEET_STYLE.defaultRowHeight;
  await context.sync();
}

async function buildEasypartsSheet(context: Excel.RequestContext) {
  const sheetName = SHEET_NAMES.wearParts;
  const existing = context.workbook.worksheets.getItemOrNullObject(sheetName);
  existing.load("name");
  await context.sync();
  if (!existing.isNullObject) {
    existing.delete();
    await context.sync();
  }

  const sheet = context.workbook.worksheets.add(sheetName);
  sheet.activate();
  sheet.showGridlines = false;
  context.application.suspendScreenUpdatingUntilNextSync();

  sheet.getRange("A1:B1").merge();
  sheet.getRange("A1").values = [[BUILDSHEET_TEXT.wearPartsTitle]];
  sheet.getRange("A1").format.font.bold = true;
  sheet.getRange("A1").format.font.size = 20;
  sheet.getRange("A1").format.horizontalAlignment = "Center";
  sheet.getRange("A1").format.verticalAlignment = "Center";

  const headers = [...BUILDSHEET_TEXT.wearPartsHeaders] as string[];
  headers[8] = "单价（元）";
  headers[9] = "总价（元）";

  sheet.getRange(BUILDSHEET_RANGES.easypartsHeader).values = [headers];
  sheet.getRange(BUILDSHEET_RANGES.easypartsHeader).format.font.bold = true;
  sheet.getRange(BUILDSHEET_RANGES.easypartsHeader).format.horizontalAlignment = "Center";
  sheet.getRange(BUILDSHEET_RANGES.easypartsHeader).format.verticalAlignment = "Center";
  sheet.getRange(BUILDSHEET_RANGES.easypartsHeader).format.font.name = BUILDSHEET_STYLE.fontName;
  sheet.getRange(BUILDSHEET_RANGES.easypartsHeader).format.font.size = BUILDSHEET_STYLE.fontSize;
  sheet.getRange(BUILDSHEET_RANGES.easypartsHeader).format.rowHeight =
    BUILDSHEET_STYLE.defaultRowHeight;

  // 预生成 30 行空白数据区（第 3~32 行），并给前 5 行写序号 1~5
  const presetRows = 30;
  const dataStartRow = 3;
  const dataEndRow = dataStartRow + presetRows - 1;
  const emptyTemplate = new Array(headers.length).fill("");
  const emptyRows = Array.from({ length: presetRows }, () => [...emptyTemplate]);
  sheet.getRange(`A${dataStartRow}:O${dataEndRow}`).values = emptyRows;
  sheet.getRange(`A${dataStartRow}:A${dataStartRow + 4}`).values = [[1], [2], [3], [4], [5]];
  sheet.getRange(`A${dataStartRow}:O${dataEndRow}`).format.font.name = BUILDSHEET_STYLE.fontName;
  sheet.getRange(`A${dataStartRow}:O${dataEndRow}`).format.font.size = BUILDSHEET_STYLE.fontSize;
  sheet.getRange(`A${dataStartRow}:H${dataEndRow}`).format.horizontalAlignment = "Center";
  sheet.getRange(`C${dataStartRow}:C${dataEndRow}`).format.horizontalAlignment = "Left";
  sheet.getRange(`M${dataStartRow}:M${dataEndRow}`).format.horizontalAlignment = "Center";
  sheet.getRange(`A${dataStartRow}:A${dataEndRow}`).format.horizontalAlignment = "Center";
  sheet.getRange("B:F").format.wrapText = true;
  const jFormulas = Array.from({ length: presetRows }, (_, idx) => {
    const r = dataStartRow + idx;
    return [`=IF(OR(G${r}="",I${r}=""),"",G${r}*I${r})`];
  });
  sheet.getRange(`J${dataStartRow}:J${dataEndRow}`).formulas = jFormulas;

  const wear = BUILDSHEET_COLUMNS.easyparts;
  sheet.getRange("A:A").format.columnWidth = wear.A;
  sheet.getRange("B:B").format.columnWidth = wear.B;
  sheet.getRange("C:C").format.columnWidth = wear.C;
  sheet.getRange("D:D").format.columnWidth = wear.D;
  sheet.getRange("E:E").format.columnWidth = wear.E;
  sheet.getRange("F:F").format.columnWidth = wear.F;
  sheet.getRange("G:G").format.columnWidth = wear.G;
  sheet.getRange("H:H").format.columnWidth = wear.H;
  sheet.getRange("I:I").format.columnWidth = wear.I;
  sheet.getRange("J:J").format.columnWidth = wear.J;
  sheet.getRange("K:K").format.columnWidth = wear.K;
  sheet.getRange("L:L").format.columnWidth = wear.L;
  sheet.getRange("M:M").format.columnWidth = wear.M;
  sheet.getRange("N:N").format.columnWidth = wear.N;
  sheet.getRange("O:O").format.columnWidth = wear.O;

  sheet.getRange("K:K").format.fill.color = BUILDSHEET_STYLE.costAreaColor;
  sheet.getRange("L:L").format.fill.color = BUILDSHEET_STYLE.costAreaColor;
  sheet.getRange("M:M").format.fill.color = BUILDSHEET_STYLE.costAreaColor;
  sheet.getRange("N:N").format.fill.color = BUILDSHEET_STYLE.costAreaColor;

  const borderRange = sheet.getRange(`A2:O${dataEndRow}`).format.borders;
  borderRange.getItem("EdgeTop").style = "Continuous";
  borderRange.getItem("EdgeTop").weight = "Medium";
  borderRange.getItem("EdgeBottom").style = "Continuous";
  borderRange.getItem("EdgeBottom").weight = "Medium";
  borderRange.getItem("EdgeLeft").style = "Continuous";
  borderRange.getItem("EdgeLeft").weight = "Medium";
  borderRange.getItem("EdgeRight").style = "Continuous";
  borderRange.getItem("EdgeRight").weight = "Medium";
  borderRange.getItem("InsideHorizontal").style = "Continuous";
  borderRange.getItem("InsideHorizontal").weight = "Medium";
  borderRange.getItem("InsideVertical").style = "Continuous";
  borderRange.getItem("InsideVertical").weight = "Thin";

  sheet.getRange("L:L").numberFormat = [[BUILDSHEET_STYLE.numberFormat]];
  sheet.getRange("M:M").numberFormat = [[BUILDSHEET_STYLE.numberFormat]];
  sheet.getRange("N:N").numberFormat = [[BUILDSHEET_STYLE.numberFormat]];
  sheet.getRange("O:O").numberFormat = [[BUILDSHEET_STYLE.numberFormat]];

  sheet.getRange(BUILDSHEET_RANGES.easypartsLongRows).format.rowHeight =
    BUILDSHEET_STYLE.defaultRowHeight;
  await context.sync();
}
