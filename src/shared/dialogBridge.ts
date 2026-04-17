/* global Office */

/**
 * dialogBridge.ts
 *
 * 对话框通信适配层。所有 Office.context.ui.displayDialogAsync / messageParent /
 * messageChild 调用都收敛到这里，业务代码不直接接触 Office Dialog API。
 *
 * 迁移到纯 Web 时，只需替换这一个文件的实现（改为 EventEmitter / React state
 * 等），所有业务代码无需改动。
 */

export interface DialogHandle {
  /** 向子对话框发送消息（taskpane → dialog） */
  send(data: unknown): void;
  /** 关闭对话框 */
  close(): void;
  /** 监听来自子对话框的消息（每次调用覆盖上一个监听器） */
  onMessage(handler: (data: unknown) => void): void;
}

/**
 * 打开一个子对话框，返回可操控该对话框的 handle。
 * 封装了 displayDialogAsync 的回调地狱和 Promise 转换。
 */
export async function openDialog(
  path: string,
  size?: { width: number; height: number }
): Promise<DialogHandle> {
  const dialogUrl = new URL(path, window.location.origin).toString();
  const isOfficeOnline = Office.context.platform === Office.PlatformType.OfficeOnline;
  const width = size?.width ?? 80;
  const height = size?.height ?? 85;

  return new Promise((resolve, reject) => {
    Office.context.ui.displayDialogAsync(
      dialogUrl,
      { height, width, displayInIframe: isOfficeOnline },
      (result) => {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          reject(result.error);
          return;
        }

        const dialog = result.value;
        let messageHandler: ((data: unknown) => void) | null = null;

        dialog.addEventHandler(Office.EventType.DialogMessageReceived, (args) => {
          if (!messageHandler) return;
          try {
            const raw = "message" in args ? args.message : "";
            messageHandler(JSON.parse(raw));
          } catch {
            // 忽略格式错误的消息
          }
        });

        resolve({
          send(data: unknown) {
            try {
              (dialog as any).messageChild(JSON.stringify(data));
            } catch {
              // 忽略发送失败（对话框可能已关闭）
            }
          },
          close() {
            try {
              dialog.close();
            } catch {
              // 忽略关闭失败
            }
          },
          onMessage(handler: (data: unknown) => void) {
            messageHandler = handler;
          },
        });
      }
    );
  });
}

/**
 * 在子对话框（dialog 端）中向父窗口（taskpane）发送消息。
 * 替代 Office.context.ui.messageParent(JSON.stringify(...))。
 */
export function sendToParent(data: unknown): void {
  Office.context.ui.messageParent(JSON.stringify(data));
}

/**
 * 在子对话框（dialog 端）中监听来自父窗口的消息。
 * 替代 Office.context.ui.addHandlerAsync(DialogParentMessageReceived, ...)。
 * 返回 unsubscribe 函数，可在 useEffect cleanup 中调用。
 */
export function onParentMessage(handler: (data: unknown) => void): () => void {
  const wrappedHandler = (args: { message: string }) => {
    try {
      handler(JSON.parse(args.message));
    } catch {
      // 忽略格式错误的消息
    }
  };
  Office.context.ui.addHandlerAsync(
    Office.EventType.DialogParentMessageReceived,
    wrappedHandler
  );
  return () => {
    try {
      Office.context.ui.removeHandlerAsync(
        Office.EventType.DialogParentMessageReceived,
        { handler: wrappedHandler }
      );
    } catch {
      // 忽略移除失败（对话框可能已关闭）
    }
  };
}
