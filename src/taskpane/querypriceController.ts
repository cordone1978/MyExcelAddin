/* global Excel, Office, alert, console */

type QueryPriceSelectionCheck = {
  valid: boolean;
  message: string;
  row?: number;
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

      if (payload?.action === "queryprice_select") {
        const check = await validateSelectionForQueryPrice();
        if (!check.valid) {
          dialog.messageChild(
            JSON.stringify({
              action: "queryprice_warning",
              message: check.message,
            })
          );
          return;
        }

        await handleQueryPriceSelect(payload.data, check);
        dialog.close();
        return;
      }

      if (payload?.action === "queryprice_cancel") {
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
      selectedRange.load(["columnIndex", "rowIndex", "address"]);
      await context.sync();

      if (sheet.name !== "易损件表") {
        return {
          valid: false,
          message: `请在【易损件表】中操作。当前位置：${sheet.name}`,
        };
      }

      if (selectedRange.columnIndex !== 2) {
        const columnLetter = String.fromCharCode(65 + selectedRange.columnIndex);
        return {
          valid: false,
          message: `请选择C列（组件名称）单元格。当前位置：${columnLetter}列`,
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
      };
    });
  } catch (error) {
    return {
      valid: false,
      message: "验证失败: " + (error as Error).message,
    };
  }
}

async function handleQueryPriceSelect(data: any, check: QueryPriceSelectionCheck) {
  if (!check.row) return;
  await insertToWearableSheetAtRow(data, check.row);
}

async function insertToWearableSheetAtRow(rowData: any, row: number) {
  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItemOrNullObject("易损件表");
    sheet.load(["name"]);
    await context.sync();

    if (sheet.isNullObject) {
      throw new Error("易损件表不存在");
    }

    const newRowData = [
      "",
      "",
      rowData.name || "",
      rowData.desc || "",
      rowData.type || "",
      rowData.material || "",
      rowData.brand || "",
      1,
      rowData.unit || "个",
      rowData.price || 0,
      "",
      "",
    ];

    const targetRange = sheet.getRange(`A${row}:L${row}`);
    targetRange.values = [newRowData];

    sheet.getRange(`K${row}`).formulas = [[`=H${row}*J${row}`]];

    targetRange.format.horizontalAlignment = "Center";
    sheet.getRange(`C${row}`).format.horizontalAlignment = "Left";
    sheet.getRange(`D${row}`).format.horizontalAlignment = "Left";
    sheet.getRange(`H${row}:K${row}`).format.horizontalAlignment = "Right";
    sheet.getRange(`J${row}:K${row}`).numberFormat = [["0.00"]];
    targetRange.format.verticalAlignment = "Center";

    const borders = targetRange.format.borders;
    borders.getItem("EdgeTop").style = "Continuous";
    borders.getItem("EdgeTop").weight = "Thin";
    borders.getItem("EdgeBottom").style = "Continuous";
    borders.getItem("EdgeBottom").weight = "Thin";
    borders.getItem("EdgeLeft").style = "Continuous";
    borders.getItem("EdgeLeft").weight = "Thin";
    borders.getItem("EdgeRight").style = "Continuous";
    borders.getItem("EdgeRight").weight = "Thin";
    borders.getItem("InsideVertical").style = "Continuous";
    borders.getItem("InsideVertical").weight = "Thin";

    await context.sync();
    sheet.getRange(`C${row}`).select();
  });
}
