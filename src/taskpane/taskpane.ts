import { createQuotationSheet } from "../buildsheet";
import { handleDialogData } from "../dialog/handleDialogData";

/* global console, document, Excel, Office */

Office.onReady((info) => {
  if (info.host === Office.HostType.Excel) {
    document.getElementById("sideload-msg").style.display = "none";
    document.getElementById("app-body").style.display = "flex";

    (window as any).openDialog = openDialog;
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
    function (result) {
      const elapsedMs = Math.round(performance.now() - start);
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        console.log(`Dialog opened successfully in ${elapsedMs}ms`);
        const dialog = result.value;
        dialog.addEventHandler(Office.EventType.DialogMessageReceived, async function (args) {
          // Close immediately for better UX, then process payload asynchronously.
          dialog.close();
          try {
            const data = JSON.parse(args.message);
            await handleDialogData(data);
          } catch (error: any) {
            console.error("处理对话框数据失败:", error);
          }
        });
      } else {
        console.error(`Error opening dialog after ${elapsedMs}ms:`, result.error.message);
      }
    }
  );
}

function warmUpDialogResources() {
  const dialogUrl = new URL("dialog.html", window.location.origin).toString();

  // Non-blocking warm-up to reduce first-open latency.
  void fetch(dialogUrl, { credentials: "same-origin", cache: "force-cache" }).catch(() => {});
  void fetch("https://localhost:3001/api/test", { cache: "no-store" }).catch(() => {});
}
