/*
 * This file is used to define button click functions for add-in command buttons.
 */

// 打开对话框的函数
function openDialog(event: Office.AddinCommands.Event) {
  Office.context.ui.messageBox("按钮被点了！");
  Office.context.ui.displayDialogAsync(
    'https://localhost:3000/dialog.html',
    {
      height: 60,
      width: 40,
      displayInIframe: true
    },
    (result) => {
      if (result.status === Office.AsyncResultStatus.Failed) {
        console.error('打开对话框失败:', result.error.message);
      } else {
        const dialog = result.value;
        
        // 处理从对话框返回的消息
        dialog.addEventHandler(Office.EventType.DialogMessageReceived, (args) => {
          try {
            const data = JSON.parse(args.message);
            
            if (data.action === 'insertData') {
              // 将数据插入Excel
              insertDataIntoExcel(data);
            }
            
            // 关闭对话框
            dialog.close();
          } catch (error) {
            console.error('处理对话框消息出错:', error);
          }
        });
        
        // 处理对话框关闭事件
        dialog.addEventHandler(Office.EventType.DialogEventReceived, (args) => {
          console.log('对话框已关闭');
        });
      }
    }
  );
  
  // 通知Office命令已完成
  event.completed();
}

// 将数据插入Excel的函数
async function insertDataIntoExcel(data: any) {
  try {
    await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      
      // 获取当前选中的单元格
      const selectedRange = context.workbook.getSelectedRange();
      
      // 在选中的位置插入数据
      selectedRange.values = [[
        data.title,
        data.value,
        data.category,
        data.notes,
        new Date(data.timestamp).toLocaleDateString()
      ]];
      
      // 设置表头（如果从A1开始）
      const headerRange = selectedRange.getOffsetRange(-1, 0);
      headerRange.values = [['标题', '数值', '类别', '备注', '日期']];
      headerRange.format.fill.color = '#0078d4';
      headerRange.format.font.color = 'white';
      headerRange.format.font.bold = true;
      
      // 自动调整列宽
      selectedRange.getEntireColumn().format.autofitColumns();
      
      await context.sync();
    });
  } catch (error) {
    console.error('插入数据到Excel时出错:', error);
  }
}

// 原始的任务窗格按钮函数（如果使用ShowTaskpane按钮）
function action(event: Office.AddinCommands.Event) {
  event.completed();
}

function getGlobal() {
  return typeof self !== "undefined"
    ? self
    : typeof window !== "undefined"
    ? window
    : typeof global !== "undefined"
    ? global
    : undefined;
}

const g = getGlobal() as any;

// 将函数暴露给全局，让Office可以调用
g.openDialog = openDialog;
g.action = action;