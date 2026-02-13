/* global Excel, Office, alert, console */
import { QueryPriceSelectedData } from "./devCraftTypes";
import { DIALOG_ACTIONS } from "../shared/dialogActions";
import { SHEET_NAMES, SHEET_NAME_ALIASES } from "../shared/sheetNames";
import { DIALOG_PATHS, DIALOG_SIZES, EXCEL_LAYOUT, UI_DEFAULTS } from "../shared/appConstants";
import { BUILDSHEET_TEXT, FLOW_MESSAGES } from "../shared/businessTextConstants";
import { BUILDSHEET_STYLE } from "../shared/buildsheetConstants";
import { TASKPANE_TEXT } from "../shared/dialogHtmlTextConstants";

type QueryPriceSelectionCheck = {
  valid: boolean;
  message: string;
  row?: number;
  sheetName?: string;
};

type DisplayDialogFn = (
  path: string,
  size?: { width: number; height: number }
) => Promise<Office.Dialog>;

export async function openQueryPriceDialogController(displayDialog: DisplayDialogFn) {
  try {
    const dialog = await displayDialog(DIALOG_PATHS.queryPrice, DIALOG_SIZES.queryPrice);

    dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (args) => {
      const payload = JSON.parse(args.message || "{}");

      if (payload?.action === DIALOG_ACTIONS.QUERYPRICE_REPLACE) {
        const check = await validateSelectionForQueryPrice();
        if (!check.valid) {
          dialog.messageChild(
            JSON.stringify({
              action: DIALOG_ACTIONS.QUERYPRICE_WARNING,
              message: check.message,
            })
          );
          return;
        }

        try {
          await handleQueryPriceReplace(payload.data as QueryPriceSelectedData, check);
          dialog.close();
        } catch (error) {
          console.error("鏌ヨ浠锋牸鏇挎崲澶辫触:", error);
          dialog.messageChild(
            JSON.stringify({
              action: DIALOG_ACTIONS.QUERYPRICE_WARNING,
              message: (error as Error).message || FLOW_MESSAGES.requestFailed,
            })
          );
        }
        return;
      }

      if (payload?.action === DIALOG_ACTIONS.QUERYPRICE_CANCEL) {
        dialog.close();
      }
    });
  } catch (error) {
    console.error(`${FLOW_MESSAGES.openQueryPriceFailed}:`, error);
    alert(FLOW_MESSAGES.openQueryPriceDialogFailed);
  }
}

async function validateSelectionForQueryPrice(): Promise<QueryPriceSelectionCheck> {
  try {
    return await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      const selectedRange = context.workbook.getSelectedRange();

      sheet.load("name");
      selectedRange.load(["columnIndex", "rowIndex"]);
      await context.sync();

      const sheetName = String(sheet.name || "").trim();
      const isQuoteConfig = sheetName === SHEET_NAMES.quoteConfig;
      const isWearSheet = SHEET_NAME_ALIASES.wearParts.includes(sheetName);

      if (!isQuoteConfig && !isWearSheet) {
        return {
          valid: false,
          message: `${FLOW_MESSAGES.selectionInvalidPrefix}${TASKPANE_TEXT.fullWidthColon}${sheetName}`,
        };
      }

      if (isQuoteConfig && selectedRange.columnIndex !== EXCEL_LAYOUT.quoteConfigColumnIndex) {
        return {
          valid: false,
          message: FLOW_MESSAGES.quoteConfigOnlyCColumnPrefix,
        };
      }

      if (selectedRange.rowIndex === 0) {
        return {
          valid: false,
          message: UI_DEFAULTS.defaultRowDataMessage,
        };
      }

      return {
        valid: true,
        message: "",
        row: selectedRange.rowIndex + 1,
        sheetName,
      };
    });
  } catch (error) {
    return {
      valid: false,
      message: `${FLOW_MESSAGES.validateFailedPrefix}: ${(error as Error).message}`,
    };
  }
}

async function handleQueryPriceReplace(data: QueryPriceSelectedData, check: QueryPriceSelectionCheck) {
  if (!check.row || !check.sheetName) return;
  await fillCellsByRule(data, check.row, check.sheetName);
}

async function fillCellsByRule(rowData: QueryPriceSelectedData, row: number, sheetName: string) {
  await Excel.run(async (context) => {
    assertQueryPriceRowData(rowData);

    const sheet = context.workbook.worksheets.getItemOrNullObject(sheetName);
    sheet.load(["name"]);
    await context.sync();

    if (sheet.isNullObject) {
      throw new Error(`${FLOW_MESSAGES.worksheetNotFoundPrefix}: ${sheetName}`);
    }

    await assertReplaceAllowed(context, sheet, row, sheetName);

    const isWearSheet = SHEET_NAME_ALIASES.wearParts.includes(sheetName);
    if (isWearSheet) {
      await applyWearSheetReplace(context, sheet, rowData, row);
    } else {
      await applyQuoteConfigReplace(context, sheet, rowData, row);
    }

    await context.sync();
    sheet.getRange(`C${row}`).select();
  });
}

async function applyWearSheetReplace(
  context: Excel.RequestContext,
  sheet: Excel.Worksheet,
  rowData: QueryPriceSelectedData,
  row: number
) {
  const wearQtyCell = sheet.getRange(`G${row}`);
  const serialCell = sheet.getRange(`A${row}`);
  const currentRowRange = sheet.getRange(`${row}:${row}`);
  wearQtyCell.load("values");
  serialCell.load("values");
  await context.sync();

  // 易损件表：不修改 N/O 备注；A 序号为空时自动补
  sheet.getRange(`C${row}:E${row}`).numberFormat = [["@", "@", "@"]];
  sheet.getRange(`B${row}`).values = [[String(rowData.name ?? "")]];
  sheet.getRange(`C${row}`).values = [[String(rowData.desc ?? rowData.name ?? "")]];
  sheet.getRange(`D${row}`).values = [[String(rowData.type ?? "")]];
  sheet.getRange(`E${row}`).values = [[String(rowData.material ?? "")]];
  sheet.getRange(`F${row}`).values = [[String(rowData.brand ?? "")]];
  sheet.getRange(`B${row}:F${row}`).format.wrapText = true;
  currentRowRange.format.rowHeight = BUILDSHEET_STYLE.defaultRowHeight;
  currentRowRange.format.autofitRows();
  currentRowRange.format.load("rowHeight");

  sheet.getRange(`H${row}`).values = [[rowData.unit || UI_DEFAULTS.defaultUnit]];
  sheet.getRange(`I${row}`).values = [[rowData.price || 0]];
  sheet.getRange(`J${row}`).formulas = [[`=IF(OR(G${row}="",I${row}=""),"",G${row}*I${row})`]];
  sheet.getRange(`K${row}`).values = [[rowData.price || 0]];

  if (!serialCell.values[0][0]) {
    serialCell.values = [[row - 2]];
  }
  if (!wearQtyCell.values[0][0]) {
    wearQtyCell.values = [[UI_DEFAULTS.defaultQuantity]];
  }
  await context.sync();
  if ((currentRowRange.format.rowHeight as number) < BUILDSHEET_STYLE.defaultRowHeight) {
    currentRowRange.format.rowHeight = BUILDSHEET_STYLE.defaultRowHeight;
  }
}

async function applyQuoteConfigReplace(
  context: Excel.RequestContext,
  sheet: Excel.Worksheet,
  rowData: QueryPriceSelectedData,
  row: number
) {
  const configQtyCell = sheet.getRange(`H${row}`);
  const currentRowRange = sheet.getRange(`${row}:${row}`);
  configQtyCell.load("values");
  await context.sync();

  // 报价配置表映射：仅写配置表字段，不触碰易损表逻辑
  sheet.getRange(`C${row}:E${row}`).numberFormat = [["@", "@", "@"]];
  sheet.getRange(`C${row}`).values = [[String(rowData.name ?? "")]];
  sheet.getRange(`D${row}`).values = [[String(rowData.desc ?? "")]];
  sheet.getRange(`E${row}`).values = [[String(rowData.type ?? "")]];
  sheet.getRange(`F${row}`).values = [[String(rowData.material ?? "")]];
  sheet.getRange(`G${row}`).values = [[String(rowData.brand ?? "")]];
  sheet.getRange(`C${row}:G${row}`).format.wrapText = true;
  currentRowRange.format.rowHeight = BUILDSHEET_STYLE.defaultRowHeight;
  currentRowRange.format.autofitRows();
  currentRowRange.format.load("rowHeight");
  sheet.getRange(`I${row}`).values = [[rowData.unit || UI_DEFAULTS.defaultUnit]];
  sheet.getRange(`N${row}`).values = [[rowData.price || 0]];

  if (!configQtyCell.values[0][0]) {
    configQtyCell.values = [[UI_DEFAULTS.defaultQuantity]];
  }
  await context.sync();
  if ((currentRowRange.format.rowHeight as number) < BUILDSHEET_STYLE.defaultRowHeight) {
    currentRowRange.format.rowHeight = BUILDSHEET_STYLE.defaultRowHeight;
  }
}

function assertQueryPriceRowData(rowData: QueryPriceSelectedData | null | undefined) {
  if (!rowData) {
    throw new Error("未获取到选中数据，请重新选择后再试。");
  }
  const name = String(rowData.name || "").trim();
  const desc = String(rowData.desc || "").trim();
  const type = String(rowData.type || "").trim();
  if (!name && !desc && !type) {
    throw new Error("选中数据为空，请重新选择后再试。");
  }
}

async function assertReplaceAllowed(
  context: Excel.RequestContext,
  sheet: Excel.Worksheet,
  row: number,
  sheetName: string
) {
  // 鏄撴崯浠惰〃锛氱1琛屼负鏍囬锛岀2琛屼负琛ㄥご
  const isWearSheet = SHEET_NAME_ALIASES.wearParts.includes(sheetName);
  if (isWearSheet) {
    if (row <= 2) {
      throw new Error(FLOW_MESSAGES.replaceOnHeaderOrSectionForbidden);
    }
    return;
  }

  // 报价配置表：
  // 1) 表头行：C列等于“组件名称”
  // 2) 分区标题行：L列等于“总价”且 C列为空
  const cCell = sheet.getRange(`C${row}`);
  const lCell = sheet.getRange(`L${row}`);
  cCell.load("values");
  lCell.load("values");
  await context.sync();

  const cText = String(cCell.values[0]?.[0] || "").trim();
  const lText = String(lCell.values[0]?.[0] || "").trim();
  const configHeaderName = String(BUILDSHEET_TEXT.configHeaders[2] || "").trim();
  const sectionTotalLabel = String(BUILDSHEET_TEXT.configSectionTotalLabel || "").trim();

  const isHeaderRow = cText === configHeaderName;
  const isSectionTitleRow = cText.length === 0 && lText === sectionTotalLabel;

  if (isHeaderRow || isSectionTitleRow) {
    throw new Error(FLOW_MESSAGES.replaceOnHeaderOrSectionForbidden);
  }
}


