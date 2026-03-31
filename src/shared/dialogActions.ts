export const DIALOG_ACTIONS = {
  INIT: "init",
  DEVMODIFY_READY: "devmodify_ready",
  DEVMODIFY_SUBMIT: "devmodify_submit",
  DEVMODIFY_CANCEL: "devmodify_cancel",
  OPEN_CRAFTMODIFY: "open_craftmodify",
  CRAFTMODIFY_READY: "craftmodify_ready",
  CRAFTMODIFY_SUBMIT: "craftmodify_submit",
  CRAFTMODIFY_CANCEL: "craftmodify_cancel",
  CRAFTMODIFY_RESULT: "craftmodify_result",
  QUERYPRICE_SELECT: "queryprice_select",
  QUERYPRICE_REPLACE: "queryprice_replace",
  QUERYPRICE_CANCEL: "queryprice_cancel",
  QUERYPRICE_WARNING: "queryprice_warning",
} as const;

export type DialogAction = (typeof DIALOG_ACTIONS)[keyof typeof DIALOG_ACTIONS];

/**
 * 标准对话框消息信封。所有 dialog ↔ taskpane 之间的消息都走这个结构。
 * 迁移到纯 Web 后，action / payload 字段保持不变，只需替换传输机制。
 */
export interface DialogMessage<T = unknown> {
  action: DialogAction | string;
  data?: T;
}

/**
 * 将消息对象序列化。统一收口，避免各处散落 JSON.stringify({ action, data })。
 * 在 dialog 端配合 dialogBridge.sendToParent() 使用：
 *   sendToParent(buildMessage(DIALOG_ACTIONS.DEVMODIFY_READY))
 */
export function buildMessage<T>(action: DialogAction | string, data?: T): DialogMessage<T> {
  return data !== undefined ? { action, data } : { action };
}

/**
 * 安全地从原始字符串解析消息信封。解析失败时返回 null。
 */
export function parseDialogMessage(raw: string): DialogMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.action === "string") {
      return parsed as DialogMessage;
    }
    return null;
  } catch {
    return null;
  }
}
