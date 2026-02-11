/* global Office, Excel */
import { handleDialogData } from "../dialog/handleDialogData";

console.log("🚨 commands.ts 加载");

function openDialog(event: Office.AddinCommands.Event) {
    console.log("🎯 openDialog被调用");

    // 使用相对路径或绝对路径
    const dialogUrl = location.origin + '/dialog.html';

    try {
        Office.context.ui.displayDialogAsync(
            dialogUrl,
            {
                width: 60,
                height: 65,
                displayInIframe: true
            },
            function(result) {
                if (result.status === Office.AsyncResultStatus.Succeeded) {
                    console.log("✅ 对话框打开成功");
                    const dialog = result.value;

                    dialog.addEventHandler(Office.EventType.DialogMessageReceived, async function(args) {
                        console.log("收到对话框消息:", args.message);

                        try {
                            // 解析对话框返回的数据
                            const data = JSON.parse(args.message);
                            console.log("解析后的数据:", data);

                            // 调用插入函数
                            await handleDialogData(data);

                            // 关闭对话框
                            dialog.close();

                            // 显示成功消息
                            Office.context.ui.displayDialogAsync(
                                'data:text/html,<html><body style="font-family:Arial;padding:20px;text-align:center;"><h2>✅ 数据插入成功</h2><p>已成功插入 ' + data.details.length + ' 个组件到配置表</p></body></html>',
                                { width: 30, height: 20, displayInIframe: true },
                                function(msgResult) {
                                    if (msgResult.status === Office.AsyncResultStatus.Succeeded) {
                                        setTimeout(() => {
                                            msgResult.value.close();
                                        }, 2000);
                                    }
                                }
                            );

                        } catch (error) {
                            console.error("处理对话框数据失败:", error);
                            dialog.close();

                            // 显示错误消息
                            Office.context.ui.displayDialogAsync(
                                'data:text/html,<html><body style="font-family:Arial;padding:20px;text-align:center;"><h2>❌ 插入失败</h2><p>' + error.message + '</p></body></html>',
                                { width: 30, height: 20, displayInIframe: true },
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
                    console.error("❌ 对话框打开失败:", result.error.message);
                }

                // ⚠️ 必须在回调里调用 completed
                event.completed();
            }
        );

    } catch (error) {
        console.error("❌ 捕获到错误:", error);
        event.completed(); // 出错也要调用
    }
}


// ⚠️ 关键：桌面版 Excel 必须用这个方式注册
Office.onReady(() => {
    console.log("✅ Office已就绪");
    Office.actions.associate("openDialog", openDialog);
    console.log("✅ openDialog已注册到Office.actions");
});
