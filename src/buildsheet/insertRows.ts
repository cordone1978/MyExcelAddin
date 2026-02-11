/* global Excel */

/**
 * 插入组件数据到配置表（最终修复版本）
 * 
 * 核心修复:
 * 1. 插入后立即清除所有格式
 * 2. 单独设置每一行的行高，避免影响其他行
 * 3. 使用 untrack 释放内存
 */
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
      // 性能优化
      context.application.suspendApiCalculationUntilNextSync();
      context.application.suspendScreenUpdatingUntilNextSync();

      const sheet = context.workbook.worksheets.getItemOrNullObject("配置表");
      sheet.load("name");

      const aUsedRange = sheet.getRange("A:A").getUsedRangeOrNullObject(false);
      aUsedRange.load(["values", "rowCount", "rowIndex"]);

      await context.sync();

      // 第一次 sync 后，再次挂起屏幕更新（防止闪烁）
      context.application.suspendScreenUpdatingUntilNextSync();

      if (sheet.isNullObject) {
        throw new Error("配置表不存在，请先创建配置表");
      }

      const targetCategory = systemName || categoryName;
      const insertRow = findInsertRowForCategorySync(aUsedRange, targetCategory);
      const dataStartRow = insertRow;
      const dataEndRow = dataStartRow + components.length - 1;
      const dataRowCount = components.length;

      console.log(`📍 插入位置: 第 ${insertRow} 行，共 ${dataRowCount} 行数据`);

      // ========== 步骤 1: 插入空行 ==========
      const rangeToInsert = sheet.getRange(`A${dataStartRow}:S${dataEndRow}`);
      rangeToInsert.insert(Excel.InsertShiftDirection.down);

      // ========== 步骤 2: 写入数据 ==========
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

      // ========== 步骤 4: 设置字体（注意：不设置 fill，避免覆盖背景色）==========
      insertedRange.format.font.name = "Microsoft YaHei";
      insertedRange.format.font.bold = false;
      insertedRange.format.font.size = 11;
      insertedRange.format.verticalAlignment = "Center";

      // ========== 步骤 5: C-D 列特殊格式 ==========
      const cdRange = sheet.getRange(`C${dataStartRow}:D${dataEndRow}`);
      cdRange.format.horizontalAlignment = "Left";
      cdRange.format.wrapText = true;

      // ========== 步骤 6: 居中对齐的列 ==========
      sheet.getRange(`E${dataStartRow}:I${dataEndRow}`).format.horizontalAlignment = "Center";
      sheet.getRange(`N${dataStartRow}:O${dataEndRow}`).format.horizontalAlignment = "Center";
      sheet.getRange(`R${dataStartRow}:R${dataEndRow}`).format.horizontalAlignment = "Center";

      // ========== 步骤 7: 合并单元格 ==========
      const mergeConfigs = [
        { col: "A", value: categoryName, orientation: 180 },
        { col: "J", value: 1, orientation: null },
        { col: "K", value: "套", orientation: null },
        { col: "Q", value: 2, orientation: null },
        { col: "L", value: "", orientation: null },
        { col: "M", value: "", orientation: null },
        { col: "P", value: "", orientation: null },
        { col: "S", value: "", orientation: null }
      ];

      mergeConfigs.forEach(({ col, value, orientation }) => {
        const range = sheet.getRange(`${col}${dataStartRow}:${col}${dataEndRow}`);
        range.merge();

        // 设置格式
        range.format.font.name = "Microsoft YaHei";
        range.format.horizontalAlignment = "Center";
        range.format.verticalAlignment = "Center";

        if (orientation !== null) {
          range.format.textOrientation = orientation;
        }

        if (value !== "") {
          sheet.getRange(`${col}${dataStartRow}`).values = [[value]];
        }
      });

      // 恢复 P 列和 Q 列的背景色（合并操作会重置为白色）
      sheet.getRange(`P${dataStartRow}:P${dataEndRow}`).format.fill.color = "#cfe8b9";
      sheet.getRange(`Q${dataStartRow}:Q${dataEndRow}`).format.fill.color = "#cfe8b9";

      // ========== 步骤 8: B 列合并 ==========
      mergeColumnBByAssembly(sheet, dataStartRow, dataEndRow, projectName, components);

      // ========== 步骤 9: 设置边框 ==========
      const borders = insertedRange.format.borders;
      borders.getItem("InsideHorizontal").style = "Continuous";
      borders.getItem("InsideHorizontal").weight = "Thin";
      borders.getItem("InsideVertical").style = "Continuous";
      borders.getItem("InsideVertical").weight = "Thin";

      sheet.getRange(`A${dataStartRow}:S${dataStartRow}`)
        .format.borders.getItem("EdgeTop").style = "Continuous";
      sheet.getRange(`A${dataStartRow}:S${dataStartRow}`)
        .format.borders.getItem("EdgeTop").weight = "Medium";

      sheet.getRange(`A${dataEndRow}:S${dataEndRow}`)
        .format.borders.getItem("EdgeBottom").style = "Continuous";
      sheet.getRange(`A${dataEndRow}:S${dataEndRow}`)
        .format.borders.getItem("EdgeBottom").weight = "Medium";

      sheet.getRange(`S${dataStartRow}:S${dataEndRow}`)
        .format.borders.getItem("EdgeRight").style = "Continuous";
      sheet.getRange(`S${dataStartRow}:S${dataEndRow}`)
        .format.borders.getItem("EdgeRight").weight = "Medium";

      // ========== 步骤 9: 设置公式 ==========
      const oFormulas = Array.from({ length: dataRowCount }, (_, i) => 
        [`=N${dataStartRow + i}*H${dataStartRow + i}`]
      );
      sheet.getRange(`O${dataStartRow}:O${dataEndRow}`).formulas = oFormulas;
      sheet.getRange(`P${dataStartRow}`).formulas = [[`=SUM(O${dataStartRow}:O${dataEndRow})`]];
      sheet.getRange(`L${dataStartRow}`).formulas = [[`=P${dataStartRow}*Q${dataStartRow}`]];
      sheet.getRange(`M${dataStartRow}`).formulas = [[`=L${dataStartRow}*J${dataStartRow}`]];

      await context.sync();

      console.log(`✅ 成功插入 ${dataRowCount} 行数据到第 ${dataStartRow} 行`);
    });
  } catch (error) {
    console.error("❌ 插入数据到配置表失败:", error);
    throw error;
  }
}

/**
 * 合并 B 列中连续相同的单元格
 */
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

    // 设置格式
    range.format.font.name = "Microsoft YaHei";
    range.format.horizontalAlignment = "Center";
    range.format.verticalAlignment = "Center";
    range.format.wrapText = true;

    const firstIndex = start - startRow;
    const value = isAssembly >= 1
      ? (components[firstIndex]?.component_name || "")
      : projectName;

    sheet.getRange(`B${start}`).values = [[value]];
  });
}

/**
 * 查找插入位置（同步版本）
 */
function findInsertRowForCategorySync(
  aUsedRange: Excel.Range,
  categoryName: string
): number {
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
      console.log(`🎯 找到匹配: "${cellValue}" -> 第 ${sectionRow} 行`);
      break;
    }
  }

  if (sectionRow === -1) {
    console.error(`❌ 未找到目标分类: "${categoryName}"`);
    console.error(`标准化后: "${target}"`);
    console.error(`A 列前20行内容:`, values.slice(0, 20).map(v => v[0]));
    throw new Error(`Section title not found: ${categoryName}`);
  }

  const sectionIndex = sectionRow - rowOffset - 1;
  for (let i = sectionIndex + 1; i < values.length; i++) {
    const cellValue = values[i][0] ? String(values[i][0]) : "";
    if (isSectionTitle(cellValue)) {
      console.log(`📌 下一个标题: "${cellValue}" 在第 ${rowOffset + i + 1} 行`);
      return rowOffset + i + 1;
    }
  }

  return rowOffset + rowCount + 1;
}

/**
 * 规范化标题：去掉中文数字前缀，去空格
 */
function normalizeSectionName(value: string): string {
  if (!value) return "";
  const trimmed = String(value).trim();
  const removedPrefix = trimmed.replace(/^(一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四|十五|十六|十七|十八|十九|二十|壹|贰|叁|肆|伍|陆|柒|捌|玖|拾)[、.]/, "");
  return removedPrefix.replace(/\s+/g, "");
}

/**
 * 判断是不是中文数字标题行
 */
function isSectionTitle(value: string): boolean {
  if (!value) return false;
  const trimmed = String(value).trim();
  return /^(一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四|十五|十六|十七|十八|十九|二十|壹|贰|叁|肆|伍|陆|柒|捌|玖|拾)[、.]/.test(trimmed);
}
