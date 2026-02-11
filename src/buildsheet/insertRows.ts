/* global Excel */

/**
 * 插入组件数据到配置表
 * @param categoryName - 产品类型名称（配置表显示的分类）
 * @param projectName - 产品型号名称（子分类）
 * @param components - 组件数据数组
 * @param systemName - 系统名称（用于查找插入位置）
 */
export async function insertComponentsToConfigSheet(
  categoryName: string,
  projectName: string,
  components: any[],
  systemName?: string
) {
  // console.log("========================================");
  // console.log("📥 insertComponentsToConfigSheet 被调用");
  // console.log("  categoryName (显示用):", JSON.stringify(categoryName));
  // console.log("  projectName:", JSON.stringify(projectName));
  // console.log("  systemName (定位用):", JSON.stringify(systemName));
  // console.log("  components 数量:", components.length);
  // console.log("========================================");

  if (!components || components.length === 0) {
    // console.warn("⚠️ components 为空，取消插入");
    return;
  }

  try {
    await Excel.run(async (context) => {
      context.application.suspendApiCalculationUntilNextSync();
      context.application.suspendScreenUpdatingUntilNextSync();
      // 1) 获取配置表
      const sheet = context.workbook.worksheets.getItemOrNullObject("配置表");
      sheet.load("name");
      await context.sync();

      if (sheet.isNullObject) {
        throw new Error("配置表不存在，请先创建配置表");
      }
      // 2) find insert row
      const targetCategory = systemName || categoryName;
      const insertRow = await findInsertRowForCategory(
        sheet,
        targetCategory,
        context
      );

      // Keep cursor behavior aligned with legacy VBA flow.
      const anchorRow = Math.max(1, insertRow - 1);
      sheet.activate();
      sheet.getRange(`A${anchorRow}`).select();
      await context.sync();

      // console.log("🎯 确定插入行号:", insertRow);

      // 4) 计算要写入范围
      const dataStartRow = insertRow;
      const dataEndRow = dataStartRow + components.length - 1;

      // console.log(`📊 将要插入: 第 ${dataStartRow} 行 到 第 ${dataEndRow} 行`);

      // 5) 插入空行（一次插入多行）
      // 关键：用 1 行范围插入多次，最稳定
      sheet.getRange(`A${dataStartRow}:S${dataEndRow}`).insert(Excel.InsertShiftDirection.down);

      // console.log("✅ 已插入空行");

      // 6) 准备数据数组（A~S = 19列）
      const dataRows = components.map((comp) => [
        "", // A merged later
        "", // B merged later
        comp.component_name || "", // C
        comp.component_desc || "", // D
        comp.component_type || "", // E
        comp.component_material || "", // F
        comp.component_brand || "", // G
        comp.component_quantity || 1, // H
        comp.component_unit || "", // I
        "", // J merged later
        "", // K merged later
        "", // L merged/formula later
        "", // M merged/formula later
        comp.component_unitprice || 0, // N
        "", // O formula later
        "", // P merged/formula later
        "", // Q merged later
        "", // R
        "", // S merged later
      ]);

      // 验证数组维度
      if (dataRows.length !== components.length) {
        throw new Error(`数据行数不匹配: 期望 ${components.length}, 实际 ${dataRows.length}`);
      }
      if (dataRows[0] && dataRows[0].length !== 19) {
        throw new Error(`每行列数不匹配: 期望 19, 实际 ${dataRows[0].length}`);
      }

      // 7) 写入数据
      const dataRange = sheet.getRange(`A${dataStartRow}:S${dataEndRow}`);
      // console.log(`准备写入数据: A${dataStartRow}:S${dataEndRow} (${dataRows.length}行 x ${dataRows[0]?.length}列)`);

      try {
        dataRange.values = dataRows;
        // console.log("✅ dataRange.values 赋值成功");
      } catch (err) {
        console.error("❌ dataRange.values 赋值失败:", err);
        throw err;
      }

      // console.log("✅ 已填充数据");

      // 8) 设置基础格式
      sheet.getRange(`C${dataStartRow}:C${dataEndRow}`).format.horizontalAlignment = "Left";
      sheet.getRange(`D${dataStartRow}:D${dataEndRow}`).format.horizontalAlignment = "Left";

      dataRange.format.font.bold = false;
      dataRange.format.font.name = "Microsoft YaHei";
      dataRange.format.wrapText = true;

      sheet.getRange(`A${dataStartRow}:A${dataEndRow}`).format.rowHeight = 30;

      // console.log("✅ 已设置基础格式");

      // 9) 合并单元格
      const dataRowCount = dataEndRow - dataStartRow + 1;

      const colARange = sheet.getRange(`A${dataStartRow}:A${dataEndRow}`);
      colARange.merge();
      sheet.getRange(`A${dataStartRow}`).values = [[categoryName]];
      colARange.format.font.name = "Microsoft YaHei";
      colARange.format.horizontalAlignment = "Center";
      colARange.format.verticalAlignment = "Center";
      colARange.format.textOrientation = 180;

      mergeColumnBByAssembly(sheet, dataStartRow, dataEndRow, projectName, components);

      const colJRange = sheet.getRange(`J${dataStartRow}:J${dataEndRow}`);
      colJRange.merge();
      sheet.getRange(`J${dataStartRow}`).values = [[1]];
      colJRange.format.horizontalAlignment = "Center";
      colJRange.format.verticalAlignment = "Center";

      const colKRange = sheet.getRange(`K${dataStartRow}:K${dataEndRow}`);
      colKRange.merge();
      sheet.getRange(`K${dataStartRow}`).values = [["套"]];
      colKRange.format.horizontalAlignment = "Center";
      colKRange.format.verticalAlignment = "Center";

      const colQRange = sheet.getRange(`Q${dataStartRow}:Q${dataEndRow}`);
      colQRange.merge();
      sheet.getRange(`Q${dataStartRow}`).values = [[2]];
      colQRange.format.horizontalAlignment = "Center";
      colQRange.format.verticalAlignment = "Center";

      const colLRange = sheet.getRange(`L${dataStartRow}:L${dataEndRow}`);
      colLRange.merge();
      
      colLRange.format.font.name = "Microsoft YaHei";
      colLRange.format.horizontalAlignment = "Center";
      colLRange.format.verticalAlignment = "Center";

      const colMRange = sheet.getRange(`M${dataStartRow}:M${dataEndRow}`);
      colMRange.merge();
      
      colMRange.format.font.name = "Microsoft YaHei";
      colMRange.format.horizontalAlignment = "Center";
      colMRange.format.verticalAlignment = "Center";

      const colPRange = sheet.getRange(`P${dataStartRow}:P${dataEndRow}`);
      colPRange.merge();
      
      colPRange.format.font.name = "Microsoft YaHei";
      colPRange.format.horizontalAlignment = "Center";
      colPRange.format.verticalAlignment = "Center";

      const colSRange = sheet.getRange(`S${dataStartRow}:S${dataEndRow}`);
      colSRange.merge();
      
      colSRange.format.font.name = "Microsoft YaHei";
      colSRange.format.horizontalAlignment = "Center";
      colSRange.format.verticalAlignment = "Center";

      // console.log("✅ 已合并单元格");

      // 10) 设置公式
      const allDataRange = sheet.getRange(`A${dataStartRow}:S${dataEndRow}`);
      const firstRowRange = sheet.getRange(`A${dataStartRow}:S${dataStartRow}`);
      const lastRowRange = sheet.getRange(`A${dataEndRow}:S${dataEndRow}`);
      const rightColRange = sheet.getRange(`S${dataStartRow}:S${dataEndRow}`);
      const bottomRowRange = sheet.getRange(`A${dataEndRow + 1}:S${dataEndRow + 1}`);

      allDataRange.format.borders.getItem("InsideHorizontal").style = "Continuous";
      allDataRange.format.borders.getItem("InsideHorizontal").weight = "Thin";

      allDataRange.format.borders.getItem("InsideVertical").style = "Continuous";
      allDataRange.format.borders.getItem("InsideVertical").weight = "Thin";

      firstRowRange.format.borders.getItem("EdgeTop").style = "Continuous";
      firstRowRange.format.borders.getItem("EdgeTop").weight = "Medium";

      lastRowRange.format.borders.getItem("EdgeBottom").style = "Continuous";
      lastRowRange.format.borders.getItem("EdgeBottom").weight = "Medium";

      rightColRange.format.borders.getItem("EdgeRight").style = "Continuous";
      rightColRange.format.borders.getItem("EdgeRight").weight = "Medium";

      bottomRowRange.format.borders.getItem("EdgeTop").style = "Continuous";
      bottomRowRange.format.borders.getItem("EdgeTop").weight = "Medium";

      // Keep outer borders from the pre-built template by not overriding them.

      // Preserve config-sheet cost area color (N:R), including column P.
      sheet.getRange(`N${dataStartRow}:R${dataEndRow}`).format.fill.color = "#cfe8b9";

      sheet.getRange(`O${dataStartRow}:O${dataEndRow}`).formulas = Array.from(
        { length: dataRowCount },
        (_, i) => [`=N${dataStartRow + i}*H${dataStartRow + i}`]
      );

      sheet.getRange(`P${dataStartRow}`).formulas = [[`=SUM(O${dataStartRow}:O${dataEndRow})`]];
      sheet.getRange(`L${dataStartRow}`).formulas = [[`=P${dataStartRow}*Q${dataStartRow}`]];
      sheet.getRange(`M${dataStartRow}`).formulas = [[`=L${dataStartRow}*J${dataStartRow}`]];


      // console.log("✅ 已设置公式");

      // 11) 边框（只画数据区域，不画 dataEndRow+1，避免越界）
      

      // console.log("✅ 已设置边框");

      // Final pass: enforce font after merge/formula operations.
      dataRange.format.font.name = "Microsoft YaHei";
      await context.sync();

      // console.log(`✅ 成功插入 ${components.length} 行数据到配置表`);
      // console.log("========================================");
    });
  } catch (error) {
    console.error("❌ 插入数据到配置表失败:", error);
    throw error;
  }
}

/**
 * 规范化标题：去掉 “一、” 前缀，去空格
 */
function normalizeSectionName(value: string): string {
  if (!value) return "";
  const trimmed = String(value).trim();
  const removedPrefix = trimmed.replace(/^[一二三四五六七八九十]+[、.]/, "");
  return removedPrefix.replace(/\s+/g, "");
}

/**
 * 判断是不是 “一、xxx” 这种标题行
 */
function isSectionTitle(value: string): boolean {
  if (!value) return false;
  return /^[一二三四五六七八九十]+[、.]/.test(String(value).trim());
}

/**
 * ✅ 核心修复点：
 * 找到目标标题后，不去找下一个标题
 * 而是：
 *   从 titleRow+2 开始往下扫
 *   遇到空行 or 下一个标题 or UsedRange结束 → 认为该分类结束
 *   插入位置 = 分类末尾下一行
 */
async function findInsertRowForCategory(
  sheet: Excel.Worksheet,
  categoryName: string,
  context: Excel.RequestContext
): Promise<number> {
  const aUsedRange = sheet.getRange("A:A").getUsedRangeOrNullObject(false);
  aUsedRange.load(["values", "rowCount", "rowIndex"]);
  await context.sync();

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
    console.error("Target section title not found");
    throw new Error(`Section title not found: ${categoryName}`);
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

/**
 * 合并B列中连续相同的单元格
 */
function mergeColumnBByAssembly(
  sheet: Excel.Worksheet,
  startRow: number,
  endRow: number,
  projectName: string,
  components: any[]
) {
  if (!components || components.length === 0) return;

  let groupStart = startRow;
  let currentIsAssembly = Number(components[0]?.is_Assembly || 0) >= 1 ? 1 : 0;

  const applyGroup = (groupStartRow: number, groupEndRow: number, isAssemblyGroup: number) => {
    if (groupEndRow < groupStartRow) return;

    const range = sheet.getRange(`B${groupStartRow}:B${groupEndRow}`);
    range.merge();
    range.format.horizontalAlignment = "Center";
    range.format.verticalAlignment = "Center";
    range.format.wrapText = true;
    if (isAssemblyGroup >= 1) {
      const firstIndex = groupStartRow - startRow;
      const firstName = components[firstIndex]?.component_name || "";
      sheet.getRange(`B${groupStartRow}`).values = [[firstName]];
    } else {
      sheet.getRange(`B${groupStartRow}`).values = [[projectName]];
    }
  };

  for (let i = 1; i < components.length; i++) {
    const isAssembly = Number(components[i]?.is_Assembly || 0) >= 1 ? 1 : 0;
    if (isAssembly !== currentIsAssembly) {
      const groupEnd = startRow + i - 1;
      applyGroup(groupStart, groupEnd, currentIsAssembly);
      groupStart = startRow + i;
      currentIsAssembly = isAssembly;
    }
  }

  applyGroup(groupStart, endRow, currentIsAssembly);
}
