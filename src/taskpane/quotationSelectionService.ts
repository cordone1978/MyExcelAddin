/* global Excel, console */

import { parseNumber } from "./devCraftDataService";
import { CellWritePayload } from "./devCraftTypes";

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

export async function getSelectionContext(): Promise<SelectionContext | null> {
  try {
    return await Excel.run(async (context) => {
      const range = context.workbook.getSelectedRange();
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      range.load(["rowIndex", "columnIndex"]);
      sheet.load("name");
      await context.sync();

      const row = range.rowIndex + 1;
      const column = range.columnIndex + 1;
      const targetColumn =
        column === 3 || column === 4 || column === 5 || column === 6 ? "C" : "";

      if (!targetColumn) {
        console.warn("请先选中配置表 C/D/E/F 列的组件单元格");
        return null;
      }

      const rowRange = sheet.getRange(`A${row}:N${row}`);
      rowRange.load("values");
      await context.sync();

      const values = rowRange.values[0] || [];
      const categoryName = String(values[0] || "").trim();
      const projectModel = String(values[1] || "").trim();
      const componentName = String(values[2] || "").trim();
      const componentDesc = String(values[3] || "").trim();
      const componentType = String(values[4] || "").trim();
      const componentMaterial = String(values[5] || "").trim();
      const componentBrand = String(values[6] || "").trim();
      const componentUnit = String(values[8] || "").trim();
      const isEasyparts = sheet.name === "易损件表";
      const priceCellValue = isEasyparts ? values[11] : values[13];
      const currentPrice = parseNumber(priceCellValue);

      if (!categoryName || !projectModel || !componentName) {
        console.warn("当前行缺少分类/型号/组件名称，无法继续");
        return null;
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
  } catch (error) {
    console.error("读取当前选区失败", error);
    return null;
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
      qtyCell.values = [[1]];
    }

    targetCell.getOffsetRange(0, 1).values = [[payload.desc || ""]];
    targetCell.getOffsetRange(0, 2).values = [[payload.type || ""]];
    targetCell.getOffsetRange(0, 3).values = [[payload.material || ""]];
    targetCell.getOffsetRange(0, 4).values = [[payload.brand || ""]];
    targetCell.getOffsetRange(0, 6).values = [[payload.unit || ""]];

    const priceValue = payload.price ?? "";
    if (selection.isEasyparts) {
      targetCell.getOffsetRange(0, 9).values = [[priceValue]];
    } else {
      targetCell.getOffsetRange(0, 11).values = [[priceValue]];
    }

    await context.sync();
  });
}
