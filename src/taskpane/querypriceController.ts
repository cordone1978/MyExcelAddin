/* global Excel, Office, alert, console */
import { QueryPriceSelectedData } from "./devCraftTypes";
import { DIALOG_ACTIONS } from "../shared/dialogActions";

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
    const dialog = await displayDialog("queryprice.html", { width: 75, height: 60 });

    dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (args) => {
      const payload = JSON.parse(args.message || "{}");

      if (payload?.action === DIALOG_ACTIONS.QUERYPRICE_SELECT) {
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

        await handleQueryPriceSelect(payload.data as QueryPriceSelectedData, check);
        dialog.close();
        return;
      }

      if (payload?.action === DIALOG_ACTIONS.QUERYPRICE_CANCEL) {
        dialog.close();
      }
    });
  } catch (error) {
    console.error("打开查询价格失败:", error);
    alert("打开查询对话框失败");
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
      const isQuoteConfig = sheetName === "报价配置表";
      const isWearSheet = sheetName === "易损件表" || sheetName === "易损表";

      if (!isQuoteConfig && !isWearSheet) {
        return {
          valid: false,
          message: `请在【报价配置表】或【易损件表】中操作。当前位置：${sheetName}`,
        };
      }

      if (isQuoteConfig && selectedRange.columnIndex !== 2) {
        const columnLetter = String.fromCharCode(65 + selectedRange.columnIndex);
        return {
          valid: false,
          message: `报价配置表仅允许在C列双击插入。当前位置：${columnLetter}列`,
        };
      }

      if (selectedRange.rowIndex === 0) {
        return {
          valid: false,
          message: "请选择数据行，不要选择表头。",
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
      message: "验证失败: " + (error as Error).message,
    };
  }
}

async function handleQueryPriceSelect(data: QueryPriceSelectedData, check: QueryPriceSelectionCheck) {
  if (!check.row || !check.sheetName) return;
  await fillCellsByRule(data, check.row, check.sheetName);
}

async function fillCellsByRule(rowData: QueryPriceSelectedData, row: number, sheetName: string) {
  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItemOrNullObject(sheetName);
    sheet.load(["name"]);
    await context.sync();

    if (sheet.isNullObject) {
      throw new Error(`工作表不存在: ${sheetName}`);
    }

    const baseCell = sheet.getRange(`C${row}`);
    const qtyCell = baseCell.getOffsetRange(0, 5);
    qtyCell.load("values");
    await context.sync();

    // 对齐 VBA FillCellsWithData：不覆盖 C 列，仅写入 D/E/F/G/I 和价格列
    baseCell.getOffsetRange(0, 1).values = [[rowData.desc || ""]];
    baseCell.getOffsetRange(0, 2).values = [[rowData.type || ""]];
    baseCell.getOffsetRange(0, 3).values = [[rowData.material || ""]];
    baseCell.getOffsetRange(0, 4).values = [[rowData.brand || ""]];
    baseCell.getOffsetRange(0, 6).values = [[rowData.unit || "个"]];

    if (!qtyCell.values[0][0]) {
      qtyCell.values = [[1]];
    }

    const isWearSheet = sheetName === "易损件表" || sheetName === "易损表";
    if (isWearSheet) {
      baseCell.getOffsetRange(0, 9).values = [[rowData.price || 0]]; // L
    } else {
      baseCell.getOffsetRange(0, 11).values = [[rowData.price || 0]]; // N
    }

    await context.sync();
    sheet.getRange(`C${row}`).select();
  });
}
