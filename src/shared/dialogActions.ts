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

export type DialogAction = typeof DIALOG_ACTIONS[keyof typeof DIALOG_ACTIONS];
