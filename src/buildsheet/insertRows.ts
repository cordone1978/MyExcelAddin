/* global Excel */

import { BUILDSHEET_STYLE } from "../shared/buildsheetConstants";
import { BUSINESS_TERMS, FLOW_MESSAGES, SECTION_TITLE_PREFIX_REGEX } from "../shared/businessTextConstants";
import { SHEET_NAMES } from "../shared/sheetNames";

export async function insertComponentsToConfigSheet(
  categoryName: string,
  projectName: string,
  components: any[],
  systemName?: string
) {
  if (!components || components.length === 0) {
    return;
  }

  try {
    await Excel.run(async (context) => {
      context.application.suspendApiCalculationUntilNextSync();
      context.application.suspendScreenUpdatingUntilNextSync();

      const sheet = context.workbook.worksheets.getItemOrNullObject(SHEET_NAMES.quoteConfig);
      sheet.load("name");

      const aUsedRange = sheet.getRange("A:A").getUsedRangeOrNullObject(false);
      aUsedRange.load(["values", "rowCount", "rowIndex", "isNullObject"]);

      await context.sync();
      context.application.suspendScreenUpdatingUntilNextSync();

      if (sheet.isNullObject) {
        throw new Error(FLOW_MESSAGES.quoteConfigMissingPrefix);
      }

      const targetCategory = systemName || categoryName;
      const insertRow = findInsertRowForCategorySync(aUsedRange, targetCategory);
      const dataStartRow = insertRow;
      const dataEndRow = dataStartRow + components.length - 1;
      const dataRowCount = components.length;

      const rangeToInsert = sheet.getRange(`A${dataStartRow}:S${dataEndRow}`);
      rangeToInsert.insert(Excel.InsertShiftDirection.down);

      const insertedRange = sheet.getRange(`A${dataStartRow}:S${dataEndRow}`);
      const dataRows = components.map((comp) => [
        "", // A
        "", // B
        comp.component_name || "", // C
        comp.component_desc || "", // D
        comp.component_type || "", // E
        comp.component_material || "", // F
        comp.component_brand || "", // G
        comp.component_quantity || 1, // H
        comp.component_unit || "", // I
        "", // J
        "", // K
        "", // L
        "", // M
        comp.component_unitprice || 0, // N
        "", // O
        "", // P
        "", // Q
        "", // R
        "", // S
      ]);

      insertedRange.values = dataRows;

      insertedRange.format.font.name = BUILDSHEET_STYLE.fontName;
      insertedRange.format.font.bold = false;
      insertedRange.format.font.size = BUILDSHEET_STYLE.fontSize;
      insertedRange.format.verticalAlignment = "Center";

      const cdRange = sheet.getRange(`C${dataStartRow}:D${dataEndRow}`);
      cdRange.format.horizontalAlignment = "Left";
      cdRange.format.wrapText = true;

      sheet.getRange(`E${dataStartRow}:I${dataEndRow}`).format.horizontalAlignment = "Center";
      sheet.getRange(`N${dataStartRow}:O${dataEndRow}`).format.horizontalAlignment = "Center";
      sheet.getRange(`R${dataStartRow}:R${dataEndRow}`).format.horizontalAlignment = "Center";

      const mergeConfigs = [
        { col: "A", value: categoryName, orientation: 180 as number | null },
        { col: "J", value: 1, orientation: null },
        { col: "K", value: BUSINESS_TERMS.setUnit, orientation: null },
        { col: "Q", value: 2, orientation: null },
        { col: "L", value: "", orientation: null },
        { col: "M", value: "", orientation: null },
        { col: "P", value: "", orientation: null },
        { col: "S", value: "", orientation: null },
      ];

      mergeConfigs.forEach(({ col, value, orientation }) => {
        const range = sheet.getRange(`${col}${dataStartRow}:${col}${dataEndRow}`);
        range.merge();
        range.format.font.name = BUILDSHEET_STYLE.fontName;
        range.format.horizontalAlignment = "Center";
        range.format.verticalAlignment = "Center";

        if (orientation !== null) {
          range.format.textOrientation = orientation;
        }

        if (value !== "") {
          sheet.getRange(`${col}${dataStartRow}`).values = [[value]];
        }
      });

      sheet.getRange(`P${dataStartRow}:P${dataEndRow}`).format.fill.color = BUILDSHEET_STYLE.costAreaColor;
      sheet.getRange(`Q${dataStartRow}:Q${dataEndRow}`).format.fill.color = BUILDSHEET_STYLE.costAreaColor;

      mergeColumnBByAssembly(sheet, dataStartRow, dataEndRow, projectName, components);

      const borders = insertedRange.format.borders;
      borders.getItem("InsideHorizontal").style = "Continuous";
      borders.getItem("InsideHorizontal").weight = "Thin";
      borders.getItem("InsideVertical").style = "Continuous";
      borders.getItem("InsideVertical").weight = "Thin";

      sheet.getRange(`A${dataStartRow}:S${dataStartRow}`).format.borders.getItem("EdgeTop").style = "Continuous";
      sheet.getRange(`A${dataStartRow}:S${dataStartRow}`).format.borders.getItem("EdgeTop").weight = "Medium";

      sheet.getRange(`A${dataEndRow}:S${dataEndRow}`).format.borders.getItem("EdgeBottom").style = "Continuous";
      sheet.getRange(`A${dataEndRow}:S${dataEndRow}`).format.borders.getItem("EdgeBottom").weight = "Medium";

      sheet.getRange(`S${dataStartRow}:S${dataEndRow}`).format.borders.getItem("EdgeRight").style = "Continuous";
      sheet.getRange(`S${dataStartRow}:S${dataEndRow}`).format.borders.getItem("EdgeRight").weight = "Medium";

      const oFormulas = Array.from({ length: dataRowCount }, (_, i) => [`=N${dataStartRow + i}*H${dataStartRow + i}`]);
      sheet.getRange(`O${dataStartRow}:O${dataEndRow}`).formulas = oFormulas;
      sheet.getRange(`P${dataStartRow}`).formulas = [[`=SUM(O${dataStartRow}:O${dataEndRow})`]];
      sheet.getRange(`L${dataStartRow}`).formulas = [[`=P${dataStartRow}*Q${dataStartRow}`]];
      sheet.getRange(`M${dataStartRow}`).formulas = [[`=L${dataStartRow}*J${dataStartRow}`]];

      await context.sync();
    });
  } catch (error) {
    console.error(`${FLOW_MESSAGES.insertConfigFailedPrefix}:`, error);
    throw error;
  }
}

function mergeColumnBByAssembly(
  sheet: Excel.Worksheet,
  startRow: number,
  endRow: number,
  projectName: string,
  components: any[]
) {
  if (!components || components.length === 0) return;

  const groups: Array<{ start: number; end: number; isAssembly: number }> = [];
  let groupStart = startRow;
  let currentIsAssembly = Number(components[0]?.is_Assembly || 0) >= 1 ? 1 : 0;

  for (let i = 1; i < components.length; i++) {
    const isAssembly = Number(components[i]?.is_Assembly || 0) >= 1 ? 1 : 0;
    if (isAssembly !== currentIsAssembly) {
      groups.push({ start: groupStart, end: startRow + i - 1, isAssembly: currentIsAssembly });
      groupStart = startRow + i;
      currentIsAssembly = isAssembly;
    }
  }
  groups.push({ start: groupStart, end: endRow, isAssembly: currentIsAssembly });

  groups.forEach(({ start, end, isAssembly }) => {
    const range = sheet.getRange(`B${start}:B${end}`);
    range.merge();
    range.format.font.name = BUILDSHEET_STYLE.fontName;
    range.format.horizontalAlignment = "Center";
    range.format.verticalAlignment = "Center";
    range.format.wrapText = true;

    const firstIndex = start - startRow;
    const value = isAssembly >= 1 ? (components[firstIndex]?.component_name || "") : projectName;
    sheet.getRange(`B${start}`).values = [[value]];
  });
}

function findInsertRowForCategorySync(aUsedRange: Excel.Range, categoryName: string): number {
  if (aUsedRange.isNullObject) {
    return 1;
  }

  const rowCount = aUsedRange.rowCount;
  const rowOffset = aUsedRange.rowIndex;
  const values = aUsedRange.values;
  const target = normalizeSectionName(categoryName);

  let sectionRow = -1;
  for (let i = 0; i < values.length; i++) {
    const cellValue = values[i][0] ? String(values[i][0]) : "";
    const normalized = normalizeSectionName(cellValue);
    const isTitle = isSectionTitle(cellValue);

    const exactMatch = cellValue.trim() === categoryName.trim();
    const normalizedMatch = isTitle && normalized === target;
    const containsMatch = isTitle && normalized.includes(target) && target.length > 0;

    if (exactMatch || normalizedMatch || containsMatch) {
      sectionRow = rowOffset + i + 1;
      break;
    }
  }

  if (sectionRow === -1) {
    throw new Error(`${FLOW_MESSAGES.sectionTitleNotFoundPrefix}: ${categoryName}`);
  }

  const sectionIndex = sectionRow - rowOffset - 1;
  for (let i = sectionIndex + 1; i < values.length; i++) {
    const cellValue = values[i][0] ? String(values[i][0]) : "";
    if (isSectionTitle(cellValue)) {
      return rowOffset + i + 1;
    }
  }

  return rowOffset + rowCount + 1;
}

function normalizeSectionName(value: string): string {
  if (!value) return "";
  const trimmed = String(value).trim();
  const removedPrefix = trimmed.replace(SECTION_TITLE_PREFIX_REGEX, "");
  return removedPrefix.replace(/\s+/g, "");
}

function isSectionTitle(value: string): boolean {
  if (!value) return false;
  const trimmed = String(value).trim();
  return SECTION_TITLE_PREFIX_REGEX.test(trimmed);
}
