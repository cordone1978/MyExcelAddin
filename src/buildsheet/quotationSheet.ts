/* global Excel */

import { BUILDSHEET_COLUMNS, BUILDSHEET_RANGES, BUILDSHEET_STYLE } from "../shared/buildsheetConstants";
import { BUILDSHEET_TEXT } from "../shared/businessTextConstants";
import { SHEET_NAMES } from "../shared/sheetNames";

interface SystemItem {
  id: number;
  name: string;
}

export async function createQuotationSheet(systems?: SystemItem[]) {
  try {
    await Excel.run(async (context) => {
      await buildQuotationSheet(context, systems);
      await buildConfigSheet(context);
      await buildEasypartsSheet(context);
    });
  } catch (error) {
    console.error(error);
  }
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
  context.application.suspendScreenUpdatingUntilNextSync();

  sheet.getRange("A1:D1").merge();
  sheet.getRange("A1").values = [[BUILDSHEET_TEXT.companyName]];
  sheet.getRange("A1").format.font.bold = true;
  sheet.getRange("A1").format.font.size = 20;
  sheet.getRange("A1").format.horizontalAlignment = "Center";
  sheet.getRange("A1").format.verticalAlignment = "Center";

  sheet.getRange("A2:D7").values = BUILDSHEET_TEXT.quoteInfoRows;

  sheet.getRange("A7:D7").merge();
  sheet.getRange("A7").values = [[BUILDSHEET_TEXT.quoteTitle]];
  sheet.getRange("A7").format.font.size = 16;
  sheet.getRange("A7").format.font.bold = true;
  sheet.getRange("A7").format.horizontalAlignment = "Center";

  sheet.getRange(BUILDSHEET_RANGES.quoteHeader).values = [BUILDSHEET_TEXT.quoteHeader];
  sheet.getRange(BUILDSHEET_RANGES.quoteHeader).format.font.bold = true;
  sheet.getRange(BUILDSHEET_RANGES.quoteHeader).format.horizontalAlignment = "Center";
  sheet.getRange(BUILDSHEET_RANGES.quoteHeader).format.verticalAlignment = "Center";

  const defaultItems = BUILDSHEET_TEXT.quoteDefaultItems;
  const items = systems && systems.length > 0
    ? systems.slice(0, 13).map((s, i) => [i + 1, s.name || "", "", ""])
    : defaultItems;

  sheet.getRange(BUILDSHEET_RANGES.quoteItems).values = items;
  sheet.getRange("A9:A21").format.horizontalAlignment = "Center";
  sheet.getRange("C9:C21").format.horizontalAlignment = "Center";

  sheet.getRange("A22:B22").merge();
  sheet.getRange("A22").values = [[BUILDSHEET_TEXT.totalLabel]];
  sheet.getRange("C22").values = [[""]];
  sheet.getRange("A22:D22").format.font.bold = true;
  sheet.getRange("A22:D22").format.horizontalAlignment = "Center";

  sheet.getRange("A23:A29").merge();
  sheet.getRange("A23").values = [[BUILDSHEET_TEXT.remarkLabel]];
  sheet.getRange("A23").format.horizontalAlignment = "Center";
  sheet.getRange("A23").format.verticalAlignment = "Center";

  const notes = BUILDSHEET_TEXT.quoteNotes;

  notes.forEach((text, idx) => {
    const row = 23 + idx;
    sheet.getRange(`B${row}:D${row}`).merge();
    sheet.getRange(`B${row}`).values = [[text]];
  });

  sheet.getRange(BUILDSHEET_RANGES.quoteNotes).format.wrapText = true;
  sheet.getRange(BUILDSHEET_RANGES.quoteNotes).format.verticalAlignment = "Center";

  sheet.getRange(BUILDSHEET_RANGES.quoteMain).format.font.name = BUILDSHEET_STYLE.fontName;
  sheet.getRange(BUILDSHEET_RANGES.quoteMain).format.font.size = BUILDSHEET_STYLE.fontSize;
  sheet.getRange("A1").format.font.size = 16;

  const borderRange = sheet.getRange(BUILDSHEET_RANGES.quoteMain).format.borders;
  borderRange.getItem("InsideHorizontal").style = "Continuous";
  borderRange.getItem("InsideVertical").style = "Continuous";
  borderRange.getItem("EdgeTop").style = "Continuous";
  borderRange.getItem("EdgeBottom").style = "Continuous";
  borderRange.getItem("EdgeLeft").style = "Continuous";
  borderRange.getItem("EdgeRight").style = "Continuous";

  sheet.getRange("A:A").format.rowHeight = BUILDSHEET_STYLE.defaultRowHeight;
  sheet.getRange(BUILDSHEET_RANGES.quoteMain).format.autofitColumns();

  sheet.getRange("A:A").format.columnWidth = BUILDSHEET_COLUMNS.quote.A;
  sheet.getRange("B:B").format.columnWidth = BUILDSHEET_COLUMNS.quote.B;
  sheet.getRange("C:C").format.columnWidth = BUILDSHEET_COLUMNS.quote.C;
  sheet.getRange("D:D").format.columnWidth = BUILDSHEET_COLUMNS.quote.D;

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
  context.application.suspendApiCalculationUntilNextSync();
  context.application.suspendScreenUpdatingUntilNextSync();

  const headers = BUILDSHEET_TEXT.configHeaders;

  const sections = BUILDSHEET_TEXT.configSections;

  let row = 1;
  const titleRows: number[] = [];

  sections.forEach((title) => {
    sheet.getRange(`A${row}:S${row}`).values = [new Array(headers.length).fill("")];
    sheet.getRange(`A${row}:K${row}`).merge();
    sheet.getRange(`A${row}`).values = [[title]];
    sheet.getRange(`A${row}`).format.font.bold = true;
    titleRows.push(row);

    sheet.getRange(`L${row}`).values = [[BUILDSHEET_TEXT.configSectionTotalLabel]];
    sheet.getRange(`L${row}`).format.horizontalAlignment = "Center";
    sheet.getRange(`L${row}`).format.font.bold = true;
    sheet.getRange(`M${row}`).values = [[""]];
    sheet.getRange(`M${row}`).format.horizontalAlignment = "Center";
    sheet.getRange(`M${row}`).format.font.bold = true;

    row += 1;

    sheet.getRange(`A${row}:S${row}`).values = [headers];
    sheet.getRange(`A${row}:S${row}`).format.font.bold = true;
    sheet.getRange(`A${row}:S${row}`).format.horizontalAlignment = "Center";
    sheet.getRange(`A${row}:S${row}`).format.verticalAlignment = "Center";
    sheet.getRange(`A${row}`).format.rowHeight = BUILDSHEET_STYLE.defaultRowHeight;
    row += 1;
  });

  const lastRow = row - 1;
  sheet.getRange(`A1:S${lastRow}`).format.font.name = BUILDSHEET_STYLE.fontName;
  sheet.getRange(`A1:S${lastRow}`).format.font.size = BUILDSHEET_STYLE.fontSize;

  sheet.getRange("N:R").format.fill.color = BUILDSHEET_STYLE.costAreaColor;

  const borders = sheet.getRange(`A1:S${lastRow}`).format.borders;
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
    const titleBorders = sheet.getRange(`A${titleRow}:S${titleRow}`).format.borders;
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
  sheet.getRange("S:S").format.columnWidth = cfg.S;

  sheet.getRange(BUILDSHEET_RANGES.configLongRows).format.rowHeight = BUILDSHEET_STYLE.defaultRowHeight;
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
  sheet.getRange(BUILDSHEET_RANGES.easypartsHeader).format.rowHeight = BUILDSHEET_STYLE.defaultRowHeight;

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

  sheet.getRange("L:L").format.numberFormat = BUILDSHEET_STYLE.numberFormat;
  sheet.getRange("M:M").format.numberFormat = BUILDSHEET_STYLE.numberFormat;
  sheet.getRange("N:N").format.numberFormat = BUILDSHEET_STYLE.numberFormat;
  sheet.getRange("O:O").format.numberFormat = BUILDSHEET_STYLE.numberFormat;

  sheet.getRange(BUILDSHEET_RANGES.easypartsLongRows).format.rowHeight = BUILDSHEET_STYLE.defaultRowHeight;
  await context.sync();
}
