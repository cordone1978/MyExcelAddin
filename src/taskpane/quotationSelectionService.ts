/* global Excel, console */

import { parseNumber } from "./devCraftDataService";
import { CellWritePayload } from "./devCraftTypes";
import { SHEET_NAMES, isWearPartsSheetName } from "../shared/sheetNames";
import { UI_DEFAULTS } from "../shared/appConstants";
import { FLOW_MESSAGES } from "../shared/businessTextConstants";

export type SelectionContext = {
  sheetName: string;
  row: number;
  column: number;
  targetColumn: string;
  isEasyparts: boolean;
  categoryName: string;
  projectModel: string;
  componentName: string;
  componentDesc: string;
  componentType: string;
  componentMaterial: string;
  componentBrand: string;
  componentUnit: string;
  currentPrice: number | null;
};

function isSelectionAllowedSheet(sheetName: string): boolean {
  const normalized = String(sheetName || "").trim();
  return normalized === SHEET_NAMES.quoteConfig || isWearPartsSheetName(normalized);
}

function findNearestProjectModel(
  values: unknown[][],
  selectedIndex: number,
  currentComponentName: string
): string {
  const normalizedCurrentComponentName = String(currentComponentName || "").trim();
  for (let i = selectedIndex; i >= 0; i -= 1) {
    const projectModel = String(values[i]?.[1] || "").trim();
    const componentName = String(values[i]?.[2] || "").trim();
    const aValue = String(values[i]?.[0] || "").trim();

    if (
      projectModel &&
      projectModel !== componentName &&
      projectModel !== normalizedCurrentComponentName
    ) {
      return projectModel;
    }

    // 碰到新的分区标题/表头，说明已经越过当前设备块。
    if (
      /^[一二三四五六七八九十百零]+$/.test(aValue) ||
      aValue === "序号" ||
      (aValue && !componentName)
    ) {
      break;
    }
  }
  return "";
}

function isLikelyInvalidComponentRow(
  projectModel: string,
  componentName: string,
  rowValues: unknown[]
): boolean {
  if (projectModel || componentName) return false;
  return rowValues.some((value) => String(value ?? "").trim().length > 0);
}

export async function getSelectionContext(): Promise<SelectionContext> {
  try {
    return await Excel.run(async (context) => {
      const range = context.workbook.getSelectedRange();
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      range.load(["rowIndex", "columnIndex"]);
      sheet.load("name");
      await context.sync();

      const row = range.rowIndex + 1;
      const column = range.columnIndex + 1;
      const targetColumn = column === 3 || column === 4 || column === 5 || column === 6 ? "C" : "";

      if (!isSelectionAllowedSheet(sheet.name)) {
        throw new Error(`${FLOW_MESSAGES.selectQuoteConfigSheetPrefix}。当前工作表：${sheet.name}`);
      }

      if (!targetColumn) {
        throw new Error(FLOW_MESSAGES.selectQuoteConfigColumnsPrefix);
      }

      const rowRange = sheet.getRange(`A${row}:R${row}`);
      const usedRange = sheet.getUsedRangeOrNullObject(false);
      rowRange.load("values");
      usedRange.load(["values", "rowIndex", "rowCount", "isNullObject"]);
      await context.sync();

      const values = rowRange.values[0] || [];
      const usedValues = usedRange.isNullObject ? [] : usedRange.values || [];
      const usedRowOffset = usedRange.isNullObject ? 0 : usedRange.rowIndex;
      const selectedIndex = row - usedRowOffset - 1;
      const componentName = String(values[2] || "").trim();
      const rawCategoryValue = String(values[0] || "").trim();
      const categoryName = /^\d+$/.test(rawCategoryValue) ? "" : rawCategoryValue;
      const directProjectModel = String(values[1] || "").trim();
      const projectModel =
        (directProjectModel && directProjectModel !== componentName ? directProjectModel : "") ||
        (selectedIndex >= 0 && selectedIndex < usedValues.length
          ? findNearestProjectModel(usedValues, selectedIndex, componentName)
          : "");
      const componentDesc = String(values[3] || "").trim();
      const componentType = String(values[4] || "").trim();
      const componentMaterial = String(values[5] || "").trim();
      const componentBrand = String(values[6] || "").trim();
      const componentUnit = String(values[8] || "").trim();
      const isEasyparts = isWearPartsSheetName(sheet.name);
      const priceCellValue = values[11];
      const currentPrice = parseNumber(priceCellValue);

      if (!projectModel || !componentName) {
        if (isLikelyInvalidComponentRow(projectModel, componentName, values)) {
          throw new Error(FLOW_MESSAGES.invalidComponentSelectionRow);
        }
        throw new Error(FLOW_MESSAGES.missingProjectOrComponentPrefix);
      }

      return {
        sheetName: sheet.name,
        row,
        column,
        targetColumn,
        isEasyparts,
        categoryName,
        projectModel,
        componentName,
        componentDesc,
        componentType,
        componentMaterial,
        componentBrand,
        componentUnit,
        currentPrice,
      };
    });
  } catch (error: any) {
    console.error(FLOW_MESSAGES.selectionReadFailed, error);
    if (error instanceof Error && error.message) {
      throw error;
    }
    throw new Error(FLOW_MESSAGES.selectionReadRetryPrefix);
  }
}

export async function writeToSheet(selection: SelectionContext, payload: CellWritePayload) {
  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(selection.sheetName);
    const targetCell = sheet.getRange(`${selection.targetColumn}${selection.row}`);

    const qtyCell = targetCell.getOffsetRange(0, 5);
    qtyCell.load("values");
    await context.sync();

    if (!qtyCell.values[0][0]) {
      qtyCell.values = [[UI_DEFAULTS.defaultQuantity]];
    }

    targetCell.getOffsetRange(0, 1).values = [[payload.desc || ""]];
    targetCell.getOffsetRange(0, 2).values = [[payload.type || ""]];
    targetCell.getOffsetRange(0, 3).values = [[payload.material || ""]];
    targetCell.getOffsetRange(0, 4).values = [[payload.brand || ""]];
    targetCell.getOffsetRange(0, 6).values = [[payload.unit || ""]];

    const priceValue = payload.price ?? "";
    if (selection.isEasyparts) {
      targetCell.getOffsetRange(0, 9).values = [[priceValue]];
      targetCell.getOffsetRange(0, 9).numberFormat = [["#,##0"]];
      targetCell.getOffsetRange(0, 10).numberFormat = [["#,##0"]];
    } else {
      targetCell.getOffsetRange(0, 9).values = [[priceValue]];
      targetCell.getOffsetRange(0, 9).numberFormat = [["#,##0"]];
      targetCell.getOffsetRange(0, 10).numberFormat = [["#,##0"]];
      targetCell.getOffsetRange(0, 11).numberFormat = [["#,##0"]];
      targetCell.getOffsetRange(0, 12).numberFormat = [["#,##0"]];
      targetCell.getOffsetRange(0, 13).numberFormat = [["#,##0"]];
    }

    await context.sync();
  });
}
