import { createQuotationSheet } from "../buildsheet";
import { handleDialogData } from "../dialog/handleDialogData";
import { API_PATHS, APP_URLS, DIALOG_PATHS, DIALOG_SIZES, UI_DEFAULTS } from "../shared/appConstants";
import { createDevCraftController } from "./devCraftController";
import { openQueryPriceDialogController } from "./querypriceController";
import { FLOW_MESSAGES } from "../shared/businessTextConstants";
import { TASKPANE_HTML_TEXT, TASKPANE_LOG_TEXT } from "../shared/dialogHtmlTextConstants";

/* global console, document, Excel, Office */

const devCraftController = createDevCraftController(displayDialog);

Office.onReady((info) => {
  if (info.host === Office.HostType.Excel) {
    applyStaticText();
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

function applyStaticText() {
  setText("addDeviceBtn", TASKPANE_HTML_TEXT.addDeviceBtn);
  setText("modifyDeviceBtn", TASKPANE_HTML_TEXT.modifyDeviceBtn);
  setText("generateSheetBtn", TASKPANE_HTML_TEXT.generateSheetBtn);
  setText("generateQuoteBtn", TASKPANE_HTML_TEXT.generateQuoteBtn);
  setText("modifyCraftBtn", TASKPANE_HTML_TEXT.modifyCraftBtn);
  setText("queryPriceBtn", TASKPANE_HTML_TEXT.queryPriceBtn);
}

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

export async function run() {
  try {
    await Excel.run(async (context) => {
      const range = context.workbook.getSelectedRange();
      range.load("address");
      range.format.fill.color = UI_DEFAULTS.highlightColor;
      await context.sync();
      console.log(`${TASKPANE_LOG_TEXT.rangeAddressPrefix} ${range.address}.`);
    });
  } catch (error) {
    console.error(error);
  }
}

function openDialog(url?: string) {
  const dialogPath = url || DIALOG_PATHS.main;
  const dialogUrl = new URL(dialogPath, window.location.origin).toString();
  const start = performance.now();
  const isOfficeOnline = Office.context.platform === Office.PlatformType.OfficeOnline;
  Office.context.ui.displayDialogAsync(
    dialogUrl,
    { ...DIALOG_SIZES.main, displayInIframe: isOfficeOnline },
    (result) => {
      const elapsedMs = Math.round(performance.now() - start);
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        console.log(`${TASKPANE_LOG_TEXT.dialogOpenedPrefix} ${elapsedMs}${TASKPANE_LOG_TEXT.dialogOpenedSuffix}`);
        const dialog = result.value;
        dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (args) => {
          dialog.close();
          try {
            const data = JSON.parse(args.message);
            await handleDialogData(data);
          } catch (error: any) {
            console.error(FLOW_MESSAGES.dialogParseFailed, error);
          }
        });
      } else {
        console.error(
          `${TASKPANE_LOG_TEXT.dialogOpenFailedPrefix} ${elapsedMs}${TASKPANE_LOG_TEXT.dialogOpenFailedSuffix}`,
          result.error.message
        );
      }
    }
  );
}

async function openQueryPriceDialog() {
  await openQueryPriceDialogController(displayDialog);
}

function warmUpDialogResources() {
  const dialogUrl = new URL(DIALOG_PATHS.main, window.location.origin).toString();

  void fetch(dialogUrl, { credentials: "same-origin", cache: "force-cache" }).catch(() => {});
  void fetch(`${APP_URLS.apiBase}${API_PATHS.test}`, { cache: "no-store" }).catch(() => {});
}

function displayDialog(
  path: string,
  size?: { width: number; height: number }
): Promise<Office.Dialog> {
  const dialogUrl = new URL(path, window.location.origin).toString();
  const isOfficeOnline = Office.context.platform === Office.PlatformType.OfficeOnline;
  const width = size?.width ?? DIALOG_SIZES.default.width;
  const height = size?.height ?? DIALOG_SIZES.default.height;

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
