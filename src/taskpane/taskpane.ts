/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

/* global console, document, Excel, Office */

Office.onReady((info) => {
  if (info.host === Office.HostType.Excel) {
    document.getElementById("sideload-msg").style.display = "none";
    document.getElementById("app-body").style.display = "flex";
    document.getElementById("run").onclick = run;
  }
});

export async function run() {
  try {
    await Excel.run(async (context) => {
      /**
       * Insert your Excel code here
       */
      const range = context.workbook.getSelectedRange();

      // Read the range address
      range.load("address");

      // Update the fill color
      range.format.fill.color = "yellow";

      await context.sync();
      console.log(`The range address was ${range.address}.`);
    });
  } catch (error) {
    console.error(error);
  }

function openDialog() {
    // 获取当前上下文路径
    const dialogUrl = Office.context.document.url.split("/").slice(0, -1).join("/") + "/src/dialog/dialog.html";
    
    // 显示对话框
    Office.context.ui.displayDialogAsync(dialogUrl, { height: 60, width: 40 }, function(result) {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
            console.log('Dialog opened successfully');
        } else {
            console.error('Error opening dialog:', result.error.message);
        }
    });
}

}
