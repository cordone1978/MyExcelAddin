import { createQuotationSheet } from "../buildsheet";
import { handleDialogData } from "../dialog/handleDialogData";
import { createDevCraftController } from "./devCraftController";
import { openQueryPriceDialogController } from "./querypriceController";

/* global console, document, Excel, Office */

const devCraftController = createDevCraftController(displayDialog);

Office.onReady((info) => {
  if (info.host === Office.HostType.Excel) {
    document.getElementById("sideload-msg").style.display = "none";
    document.getElementById("app-body").style.display = "flex";

    (window as any).openDialog = openDialog;
    (window as any).openDevModifyDialog = devCraftController.openDevModifyDialog;
    (window as any).openCraftModifyDialog = devCraftController.openCraftModifyDialog;
    (window as any).openQueryPriceDialog = openQueryPriceDialog;
    (window as any).createQuotationSheet = createQuotationSheet;
    warmUpDialogResources();
  }
});

export async function run() {
  try {
    await Excel.run(async (context) => {
      const range = context.workbook.getSelectedRange();
      range.load("address");
      range.format.fill.color = "yellow";
      await context.sync();
      console.log(`The range address was ${range.address}.`);
    });
  } catch (error) {
    console.error(error);
  }
}

function openDialog(url?: string) {
  const dialogPath = url || "dialog.html";
  const dialogUrl = new URL(dialogPath, window.location.origin).toString();
  const start = performance.now();
  const isOfficeOnline = Office.context.platform === Office.PlatformType.OfficeOnline;
  Office.context.ui.displayDialogAsync(
    dialogUrl,
    { height: 65, width: 60, displayInIframe: isOfficeOnline },
    (result) => {
      const elapsedMs = Math.round(performance.now() - start);
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        console.log(`Dialog opened successfully in ${elapsedMs}ms`);
        const dialog = result.value;
        dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (args) => {
          dialog.close();
          try {
            const data = JSON.parse(args.message);
            await handleDialogData(data);
          } catch (error: any) {
            console.error("解析对话框返回数据失败", error);
          }
        });
      } else {
        console.error(`Error opening dialog after ${elapsedMs}ms:`, result.error.message);
      }
    }
  );
}

async function openQueryPriceDialog() {
  await openQueryPriceDialogController(displayDialog);
}

function warmUpDialogResources() {
  const dialogUrl = new URL("dialog.html", window.location.origin).toString();

  void fetch(dialogUrl, { credentials: "same-origin", cache: "force-cache" }).catch(() => {});
  void fetch("https://localhost:3001/api/test", { cache: "no-store" }).catch(() => {});
}

function displayDialog(
  path: string,
  size?: { width: number; height: number }
): Promise<Office.Dialog> {
  const dialogUrl = new URL(path, window.location.origin).toString();
  const isOfficeOnline = Office.context.platform === Office.PlatformType.OfficeOnline;
  const width = size?.width ?? 50;
  const height = size?.height ?? 60;

  return new Promise((resolve, reject) => {
    Office.context.ui.displayDialogAsync(
      dialogUrl,
      { height, width, displayInIframe: isOfficeOnline },
      (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value);
        } else {
          reject(result.error);
        }
      }
    );
  });
}
