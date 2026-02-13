/* global Office, Excel */
import { handleDialogData } from "../dialog/handleDialogData";
import { SHEET_NAMES } from "../shared/sheetNames";
import { DIALOG_PATHS, DIALOG_SIZES } from "../shared/appConstants";
import { COMMAND_TEXT } from "../shared/dialogHtmlTextConstants";

console.log(COMMAND_TEXT.load);

function openDialog(event: Office.AddinCommands.Event) {
    console.log(COMMAND_TEXT.openDialogCalled);

    const dialogUrl = `${location.origin}/${DIALOG_PATHS.main}`;

    try {
        Office.context.ui.displayDialogAsync(
            dialogUrl,
            {
                width: DIALOG_SIZES.main.width,
                height: DIALOG_SIZES.main.height,
                displayInIframe: true
            },
            function(result) {
                if (result.status === Office.AsyncResultStatus.Succeeded) {
                    console.log(COMMAND_TEXT.dialogOpenSuccess);
                    const dialog = result.value;

                    dialog.addEventHandler(Office.EventType.DialogMessageReceived, async function(args) {
                        console.log(`${COMMAND_TEXT.dialogMessageReceived}:`, args.message);

                        try {
                            const data = JSON.parse(args.message);
                            console.log(`${COMMAND_TEXT.parsedData}:`, data);

                            await handleDialogData(data);

                            dialog.close();

                            Office.context.ui.displayDialogAsync(
                                createToastHtml(
                                    COMMAND_TEXT.successTitle,
                                    `${COMMAND_TEXT.successPrefix}${data.details.length}${COMMAND_TEXT.successSuffix}${SHEET_NAMES.quoteConfig}`
                                ),
                                { width: DIALOG_SIZES.toast.width, height: DIALOG_SIZES.toast.height, displayInIframe: true },
                                function(msgResult) {
                                    if (msgResult.status === Office.AsyncResultStatus.Succeeded) {
                                        setTimeout(() => {
                                            msgResult.value.close();
                                        }, 2000);
                                    }
                                }
                            );

                        } catch (error) {
                            console.error(`${COMMAND_TEXT.handleDialogFailed}:`, error);
                            dialog.close();

                            Office.context.ui.displayDialogAsync(
                                createToastHtml(COMMAND_TEXT.failTitle, error.message),
                                { width: DIALOG_SIZES.toast.width, height: DIALOG_SIZES.toast.height, displayInIframe: true },
                                function(msgResult) {
                                    if (msgResult.status === Office.AsyncResultStatus.Succeeded) {
                                        setTimeout(() => {
                                            msgResult.value.close();
                                        }, 3000);
                                    }
                                }
                            );
                        }
                    });
                } else {
                    console.error(`${COMMAND_TEXT.dialogOpenFailed}:`, result.error.message);
                }

                event.completed();
            }
        );

    } catch (error) {
        console.error(`${COMMAND_TEXT.caughtError}:`, error);
        event.completed();
    }
}

Office.onReady(() => {
    console.log(COMMAND_TEXT.officeReady);
    Office.actions.associate("openDialog", openDialog);
    console.log(COMMAND_TEXT.actionRegistered);
});

function createToastHtml(title: string, message: string): string {
    const html = `<html><body style="font-family:Arial;padding:20px;text-align:center;"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></body></html>`;
    return `data:text/html,${encodeURIComponent(html)}`;
}

function escapeHtml(value: string): string {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
