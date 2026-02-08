console.log("🚨 commands.ts 加载");

function openDialog(event: Office.AddinCommands.Event) {
    console.log("🎯 openDialog被调用");
    
    try {
        Office.context.ui.displayDialogAsync(
            'https://localhost:3000/dialog.html',
            {
                width: 60,
                height: 30,
                displayInIframe: true
            },
            function(result) {
                if (result.status === Office.AsyncResultStatus.Succeeded) {
                    console.log("✅ 对话框打开成功");
                    const dialog = result.value;
                    
                    dialog.addEventHandler(Office.EventType.DialogMessageReceived, function(args) {
                        console.log("收到对话框消息:", args.message);
                        dialog.close();
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