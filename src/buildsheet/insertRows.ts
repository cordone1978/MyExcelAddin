/* global Excel, console */

import { BUILDSHEET_STYLE } from "../shared/buildsheetConstants";
import {
  BUILDSHEET_TEXT,
  BUSINESS_TERMS,
  FLOW_MESSAGES,
  SECTION_TITLE_PREFIX_REGEX,
} from "../shared/businessTextConstants";
import { SHEET_NAMES } from "../shared/sheetNames";

type InsertSectionInfo = {
  insertRow: number;
  sectionRow: number;
};

type DeviceMergeGroup = {
  start: number;
  end: number;
  label: string;
};

function buildNumberFormatMatrix(rowCount: number, columnCount: number, format: string) {
  return Array.from({ length: Math.max(0, rowCount) }, () =>
    Array.from({ length: Math.max(0, columnCount) }, () => format)
  );
}

function getAssemblyGroupValue(component: any): number {
  const explicitGroup = Number(component?.assembly_group || component?.assemblyGroup || 0);
  if (explicitGroup > 0) return explicitGroup;
  const assemblyValue = Number(component?.is_Assembly || 0);
  if (assemblyValue >= 100) return Math.floor(assemblyValue / 10);
  if (assemblyValue >= 1) return assemblyValue;
  return 0;
}

export async function insertComponentsToConfigSheet(
  categoryName: string,
  projectName: string,
  components: any[],
  systemName?: string,
  deviceTotalPrice?: number
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
      const activeSheet = context.workbook.worksheets.getActiveWorksheet();
      activeSheet.load("name");
      const selectedRange = context.workbook.getSelectedRange();
      selectedRange.load(["rowIndex", "columnIndex"]);

      const abUsedRange = sheet.getRange("A:B").getUsedRangeOrNullObject(false);
      abUsedRange.load(["values", "rowCount", "rowIndex", "isNullObject"]);

      await context.sync();
      context.application.suspendScreenUpdatingUntilNextSync();

      if (sheet.isNullObject) {
        throw new Error(FLOW_MESSAGES.quoteConfigMissingPrefix);
      }

      const targetCategory = systemName || categoryName;
      const sectionInfo = resolveInsertPositionSync(
        abUsedRange,
        String(activeSheet.name || "").trim(),
        selectedRange.rowIndex + 1,
        selectedRange.columnIndex + 1,
        targetCategory
      );
      const dataStartRow = sectionInfo.insertRow;
      const dataEndRow = dataStartRow + components.length - 1;
      const dataRowCount = components.length;

      const rangeToInsert = sheet.getRange(`A${dataStartRow}:R${dataEndRow}`);
      rangeToInsert.insert(Excel.InsertShiftDirection.down);

      const insertedRange = sheet.getRange(`A${dataStartRow}:R${dataEndRow}`);
      const useStandardPrice = deviceTotalPrice != null && deviceTotalPrice > 0;
      const dataRows = components.map((comp) => [
        "", // A（后续整段合并写序号）
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
        useStandardPrice ? "" : (comp.component_unitprice || 0), // L
        "", // M
        "", // N
        "", // O
        "", // P
        "", // Q
        "", // R
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
      sheet.getRange(`L${dataStartRow}:P${dataEndRow}`).format.horizontalAlignment = "Center";
      sheet.getRange(`Q${dataStartRow}:Q${dataEndRow}`).format.horizontalAlignment = "Center";

      let groups: DeviceMergeGroup[] = [];
      try {
        groups =
          mergeDeviceColumnsByGroup(sheet, dataStartRow, dataEndRow, projectName, components) || [];
      } catch (error) {
        console.warn("mergeDeviceColumnsByGroup failed, fallback to plain rows:", error);
        // 回退：不做分组合并，避免“有标注时整次插入失败”
        groups = components.map((_, i) => ({
          start: dataStartRow + i,
          end: dataStartRow + i,
          label: projectName || "",
        }));
        const bValues = groups.map((g) => [g.label]);
        sheet.getRange(`B${dataStartRow}:B${dataEndRow}`).values = bValues;
      }

      sheet.getRange("L:L").format.fill.color = BUILDSHEET_STYLE.costAreaColor;
      sheet.getRange("M:M").format.fill.color = BUILDSHEET_STYLE.costAreaColor;
      sheet.getRange("N:N").format.fill.color = BUILDSHEET_STYLE.costAreaColor;
      sheet.getRange("Q:Q").format.fill.color = BUILDSHEET_STYLE.costAreaColor;
      sheet.getRange(`N${dataStartRow}:N${dataEndRow}`).format.fill.color =
        BUILDSHEET_STYLE.costAreaColor;
      sheet.getRange(`Q${dataStartRow}:Q${dataEndRow}`).format.fill.color =
        BUILDSHEET_STYLE.costAreaColor;

      const borders = insertedRange.format.borders;
      borders.getItem("InsideHorizontal").style = "Continuous";
      borders.getItem("InsideHorizontal").weight = "Thin";
      borders.getItem("InsideVertical").style = "Continuous";
      borders.getItem("InsideVertical").weight = "Thin";
      borders.getItem("EdgeTop").style = "Continuous";
      borders.getItem("EdgeTop").weight = "Thin";
      borders.getItem("EdgeBottom").style = "Continuous";
      borders.getItem("EdgeBottom").weight = "Thin";
      borders.getItem("EdgeLeft").style = "Continuous";
      borders.getItem("EdgeLeft").weight = "Thin";
      borders.getItem("EdgeRight").style = "Continuous";
      borders.getItem("EdgeRight").weight = "Medium";
      // 新增行贴靠表右边界时，确保最右侧外框保持粗线（避免被插入区域细边框覆盖）。
      const rightEdgeRange = sheet.getRange(`R${dataStartRow}:R${dataEndRow}`);
      rightEdgeRange.format.borders.getItem("EdgeRight").style = "Continuous";
      rightEdgeRange.format.borders.getItem("EdgeRight").weight = "Medium";

      const mFormulas = Array.from({ length: dataRowCount }, (_, i) => [
        `=L${dataStartRow + i}*H${dataStartRow + i}`,
      ]);
      sheet.getRange(`M${dataStartRow}:M${dataEndRow}`).formulas = mFormulas;
      groups.forEach((group) => {
        try {
          if (deviceTotalPrice != null && deviceTotalPrice > 0) {
            sheet.getRange(`N${group.start}`).values = [[deviceTotalPrice]];
          } else {
            sheet.getRange(`N${group.start}`).formulas = [[`=SUM(M${group.start}:M${group.end})`]];
          }
          sheet.getRange(`O${group.start}`).formulas = [[`=N${group.start}*Q${group.start}`]];
          sheet.getRange(`P${group.start}`).formulas = [[`=O${group.start}*J${group.start}`]];
        } catch (error) {
          console.warn("group formula write failed:", error);
        }
      });
      const priceFormatMatrix = buildNumberFormatMatrix(
        dataRowCount,
        5,
        BUILDSHEET_STYLE.numberFormat
      );
      sheet.getRange(`L${dataStartRow}:P${dataEndRow}`).numberFormat = priceFormatMatrix;
      sheet.getRange(`L:L`).numberFormat = [[BUILDSHEET_STYLE.numberFormat]];
      sheet.getRange(`M:M`).numberFormat = [[BUILDSHEET_STYLE.numberFormat]];
      sheet.getRange(`N:N`).numberFormat = [[BUILDSHEET_STYLE.numberFormat]];
      sheet.getRange(`O:O`).numberFormat = [[BUILDSHEET_STYLE.numberFormat]];
      sheet.getRange(`P:P`).numberFormat = [[BUILDSHEET_STYLE.numberFormat]];

      await renumberSectionSerialsByLayout(context, sheet, sectionInfo.sectionRow);
      ensureSectionBoundaryRowsBoldBorders(sheet, sectionInfo.sectionRow);
      await refreshAllSectionTitleBorders(context, sheet);

      await context.sync();
    });
  } catch (error) {
    console.error(`${FLOW_MESSAGES.insertConfigFailedPrefix}:`, error);
    throw error;
  }
}

function ensureSectionBoundaryRowsBoldBorders(sheet: Excel.Worksheet, sectionRow: number) {
  if (!sheet || !sectionRow || sectionRow < 1) return;

  const titleRange = sheet.getRange(`A${sectionRow}:R${sectionRow}`);
  titleRange.format.borders.getItem("EdgeTop").style = "Continuous";
  titleRange.format.borders.getItem("EdgeTop").weight = "Medium";
  titleRange.format.borders.getItem("EdgeBottom").style = "Continuous";
  titleRange.format.borders.getItem("EdgeBottom").weight = "Medium";

  const adjacentRow = sectionRow + 1;
  const adjacentRange = sheet.getRange(`A${adjacentRow}:R${adjacentRow}`);
  adjacentRange.format.borders.getItem("EdgeTop").style = "Continuous";
  adjacentRange.format.borders.getItem("EdgeTop").weight = "Medium";
  adjacentRange.format.borders.getItem("EdgeBottom").style = "Continuous";
  adjacentRange.format.borders.getItem("EdgeBottom").weight = "Medium";
}

async function refreshAllSectionTitleBorders(
  context: Excel.RequestContext,
  sheet: Excel.Worksheet
) {
  const abUsedRange = sheet.getRange("A:B").getUsedRangeOrNullObject(false);
  abUsedRange.load(["values", "rowIndex", "isNullObject"]);
  await context.sync();
  if (abUsedRange.isNullObject) return;

  const values = abUsedRange.values || [];
  const rowOffset = abUsedRange.rowIndex;
  for (let i = 0; i < values.length; i++) {
    const aText = String(values[i]?.[0] ?? "").trim();
    const bText = String(values[i]?.[1] ?? "").trim();
    if (!isSectionTitleRow(aText, bText)) continue;

    const row = rowOffset + i + 1;
    const titleRange = sheet.getRange(`A${row}:R${row}`);
    titleRange.format.borders.getItem("EdgeTop").style = "Continuous";
    titleRange.format.borders.getItem("EdgeTop").weight = "Medium";
    titleRange.format.borders.getItem("EdgeBottom").style = "Continuous";
    titleRange.format.borders.getItem("EdgeBottom").weight = "Medium";
  }
}

function resolveInsertPositionSync(
  abUsedRange: Excel.Range,
  activeSheetName: string,
  selectedRow: number,
  selectedColumn: number,
  categoryNameFallback: string
): InsertSectionInfo {
  // 优先使用“当前选中行”定位。只有选中定位失败时，才回退到分类定位。
  if (activeSheetName === SHEET_NAMES.quoteConfig) {
    try {
      return findInsertRowBySelectionSync(abUsedRange, selectedRow, selectedColumn);
    } catch {
      // fall through to category fallback
    }
  }

  let categoryPosition: InsertSectionInfo | null = null;
  try {
    categoryPosition = findInsertRowForCategorySync(abUsedRange, categoryNameFallback);
  } catch {
    categoryPosition = null;
  }
  if (categoryPosition) {
    return categoryPosition;
  }
  throw new Error("未找到可插入的分区位置，请先确认报价配置表中存在对应系统分区。");
}

function findInsertRowBySelectionSync(
  abUsedRange: Excel.Range,
  selectedRow: number,
  selectedColumn: number
): InsertSectionInfo {
  if (abUsedRange.isNullObject) {
    throw new Error("报价配置表为空，请先生成模板。");
  }

  const values = abUsedRange.values || [];
  const rowOffset = abUsedRange.rowIndex;
  const rowCount = abUsedRange.rowCount;
  const selectedIndex = selectedRow - rowOffset - 1;
  if (selectedIndex < 0 || selectedIndex >= rowCount) {
    throw new Error("所选单元格不在报价配置表有效区域内。");
  }
  if (selectedColumn < 1) {
    throw new Error("请先切换到报价配置表，并点击相应的系列区域单元格。");
  }

  const aText = String(values[selectedIndex]?.[0] ?? "").trim();
  const bText = String(values[selectedIndex]?.[1] ?? "").trim();
  const headerSerialText = String(BUILDSHEET_TEXT.configHeaders[0] || "").trim();

  const sectionRow = findSectionRowBySelectedIndex(values, rowOffset, selectedIndex);
  if (sectionRow < 1) {
    throw new Error("未找到所在系列标题行，请重新选择。");
  }

  const isSectionRow = isSectionTitleRow(aText, bText);
  const isHeaderRow = aText === headerSerialText;

  if (isSectionRow) {
    return { insertRow: selectedRow + 2, sectionRow };
  }
  if (isHeaderRow) {
    return { insertRow: selectedRow + 1, sectionRow };
  }

  // If current selection is inside a merged device block, insert below the whole block
  // to avoid expanding previous merged cells (which causes serial/device merge issues).
  const groupEndIndex = findDeviceGroupEndIndex(values, selectedIndex, headerSerialText);
  return { insertRow: rowOffset + groupEndIndex + 2, sectionRow };
}

function findDeviceGroupEndIndex(
  values: unknown[][],
  selectedIndex: number,
  headerSerialText: string
): number {
  let endIndex = selectedIndex;
  for (let i = selectedIndex + 1; i < values.length; i++) {
    const aText = String(values[i]?.[0] ?? "").trim();
    const bText = String(values[i]?.[1] ?? "").trim();
    if (isSectionTitleRow(aText, bText) || aText === headerSerialText) {
      break;
    }
    if (bText) {
      break;
    }
    endIndex = i;
  }
  return endIndex;
}

function findSectionRowBySelectedIndex(
  values: unknown[][],
  rowOffset: number,
  selectedIndex: number
): number {
  for (let i = selectedIndex; i >= 0; i--) {
    const aText = String(values[i]?.[0] ?? "").trim();
    const bText = String(values[i]?.[1] ?? "").trim();
    if (isSectionTitleRow(aText, bText)) {
      return rowOffset + i + 1;
    }
  }
  return -1;
}

function mergeDeviceColumnsByGroup(
  sheet: Excel.Worksheet,
  startRow: number,
  endRow: number,
  projectName: string,
  components: any[]
): DeviceMergeGroup[] {
  if (!components || components.length === 0) return;

  const groups = buildDeviceMergeGroups(startRow, endRow, projectName, components);
  const mergeColumns = ["A", "B", "J", "K", "N", "O", "P", "Q", "R"] as const;

  groups.forEach((group, groupIndex) => {
    mergeColumns.forEach((col) => {
      const range = sheet.getRange(`${col}${group.start}:${col}${group.end}`);
      range.merge();
      range.format.font.name = BUILDSHEET_STYLE.fontName;
      range.format.horizontalAlignment = "Center";
      range.format.verticalAlignment = "Center";
      if (col === "B") {
        range.format.wrapText = true;
      }
    });

    sheet.getRange(`A${group.start}`).values = [[groupIndex + 1]];
    sheet.getRange(`B${group.start}`).values = [[group.label]];
    sheet.getRange(`J${group.start}`).values = [[1]];
    sheet.getRange(`K${group.start}`).values = [[BUSINESS_TERMS.setUnit]];
    sheet.getRange(`Q${group.start}`).values = [[2]];
  });

  normalizeInnerGroupBoundaries(sheet, groups);

  return groups;
}

function normalizeInnerGroupBoundaries(sheet: Excel.Worksheet, groups: DeviceMergeGroup[]) {
  if (!groups || groups.length <= 1) return;

  for (let i = 0; i < groups.length - 1; i++) {
    const currentEnd = groups[i].end;
    const nextStart = groups[i + 1].start;

    const endRowRange = sheet.getRange(`A${currentEnd}:R${currentEnd}`);
    endRowRange.format.borders.getItem("EdgeBottom").style = "Continuous";
    endRowRange.format.borders.getItem("EdgeBottom").weight = "Thin";

    const nextRowRange = sheet.getRange(`A${nextStart}:R${nextStart}`);
    nextRowRange.format.borders.getItem("EdgeTop").style = "Continuous";
    nextRowRange.format.borders.getItem("EdgeTop").weight = "Thin";
  }
}

function buildDeviceMergeGroups(
  startRow: number,
  endRow: number,
  projectName: string,
  components: any[]
): DeviceMergeGroup[] {
  const groups: DeviceMergeGroup[] = [];
  if (!components || components.length === 0) return groups;

  let groupStart = startRow;
  let currentKey = getDeviceGroupKey(components[0], projectName);
  let currentLabel = getDeviceGroupLabel(components[0], projectName);

  for (let i = 1; i < components.length; i++) {
    const nextKey = getDeviceGroupKey(components[i], projectName);
    if (nextKey !== currentKey) {
      groups.push({ start: groupStart, end: startRow + i - 1, label: currentLabel });
      groupStart = startRow + i;
      currentKey = nextKey;
      currentLabel = getDeviceGroupLabel(components[i], projectName);
    }
  }

  groups.push({ start: groupStart, end: endRow, label: currentLabel });
  return groups;
}

function getDeviceGroupKey(component: any, projectName: string): string {
  const assemblyValue = Number(component?.is_Assembly || 0);
  const assemblyGroup = getAssemblyGroupValue(component);
  const isAssembly = assemblyValue >= 1;
  if (!isAssembly) return `main:${projectName}`;
  if (assemblyGroup > 0) return `anno-group:${assemblyGroup}`;
  const componentName = String(component?.component_name || "").trim();
  return `anno:${componentName}`;
}

function getDeviceGroupLabel(component: any, projectName: string): string {
  const isAssembly = Number(component?.is_Assembly || 0) >= 1;
  if (!isAssembly) return projectName;
  return String(component?.component_name || "").trim() || projectName;
}

function findInsertRowForCategorySync(
  abUsedRange: Excel.Range,
  categoryName: string
): InsertSectionInfo {
  if (abUsedRange.isNullObject) {
    return { insertRow: 1, sectionRow: 1 };
  }

  const rowCount = abUsedRange.rowCount;
  const rowOffset = abUsedRange.rowIndex;
  const values = abUsedRange.values;
  const target = normalizeSectionName(categoryName);

  let sectionRow = -1;
  for (let i = 0; i < values.length; i++) {
    const aCell = values[i]?.[0] ? String(values[i][0]) : "";
    const bCell = values[i]?.[1] ? String(values[i][1]) : "";
    const normalized = normalizeSectionName(bCell);
    const isTitle = isSectionTitleRow(aCell, bCell);

    const exactMatch = bCell.trim() === categoryName.trim();
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
    const aCell = values[i]?.[0] ? String(values[i][0]) : "";
    const bCell = values[i]?.[1] ? String(values[i][1]) : "";
    if (isSectionTitleRow(aCell, bCell)) {
      return {
        insertRow: rowOffset + i + 1,
        sectionRow,
      };
    }
  }

  return {
    insertRow: rowOffset + rowCount + 1,
    sectionRow,
  };
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

function isSectionTitleRow(aValue: string, bValue: string): boolean {
  const aText = String(aValue || "").trim();
  const bText = String(bValue || "").trim();
  if (!aText || !bText) return false;

  // 标题行 A 列为中文序号（如 一、二、三、十、十一），数据行 A 列通常为阿拉伯数字
  if (/\d/.test(aText)) return false;
  return /^[一二三四五六七八九十百零]+$/.test(aText);
}

async function renumberSectionSerialsByLayout(
  context: Excel.RequestContext,
  sheet: Excel.Worksheet,
  sectionRow: number
) {
  const abUsedRange = sheet.getRange("A:B").getUsedRangeOrNullObject(false);
  abUsedRange.load(["values", "rowIndex", "rowCount", "isNullObject"]);
  await context.sync();

  if (abUsedRange.isNullObject) return;

  const values = abUsedRange.values || [];
  const rowOffset = abUsedRange.rowIndex;
  const sectionIndex = sectionRow - rowOffset - 1;
  if (sectionIndex < 0 || sectionIndex >= values.length) return;

  let nextSectionRow = rowOffset + abUsedRange.rowCount + 1;
  for (let i = sectionIndex + 1; i < values.length; i++) {
    const aCell = String(values[i]?.[0] ?? "").trim();
    const bCell = String(values[i]?.[1] ?? "").trim();
    if (isSectionTitleRow(aCell, bCell)) {
      nextSectionRow = rowOffset + i + 1;
      break;
    }
  }

  const dataStartRow = sectionRow + 2;
  const dataEndRow = nextSectionRow - 1;
  if (dataEndRow < dataStartRow) return;

  let serial = 1;
  for (let row = dataStartRow; row <= dataEndRow; row++) {
    const idx = row - rowOffset - 1;
    if (idx < 0 || idx >= values.length) continue;

    const bText = String(values[idx]?.[1] ?? "").trim();
    if (!bText) continue;

    sheet.getRange(`A${row}`).values = [[serial]];
    serial += 1;
  }
}
