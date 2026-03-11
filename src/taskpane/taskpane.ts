import { createQuotationSheet } from "../buildsheet";
import { handleDialogData } from "../dialog/handleDialogData";
import { API_PATHS, APP_URLS, DIALOG_PATHS, DIALOG_SIZES, UI_DEFAULTS } from "../shared/appConstants";
import { createDevCraftController } from "./devCraftController";
import { openQueryPriceDialogController } from "./querypriceController";
import { BUILDSHEET_TEXT, FLOW_MESSAGES } from "../shared/businessTextConstants";
import { TASKPANE_HTML_TEXT, TASKPANE_LOG_TEXT } from "../shared/dialogHtmlTextConstants";
import { SHEET_NAMES } from "../shared/sheetNames";
import { saveGraphToWorkbook, WorkbookGraphPayload } from "../graph-editor/workbookStore";

/* global console, document, Excel, Office */

const devCraftController = createDevCraftController(displayDialog);
let authToken = "";
let currentUser: { username: string; fullName: string } | null = null;
let isResetPasswordMode = false;
let isAccountDockExpanded = false;
const QUOTE_PREVIEW_STORAGE_KEY = "quotation_addin_quote_preview_payload";
const CHINESE_ORDINAL_REGEX = /^[一二三四五六七八九十百零]+$/;
const GRAPH_STORE_DEV_SHEET = "_graph_store_dev";
const GRAPH_STORE_MAX_CELL_CHARS = 6000;
const GRAPH_STORE_DEV_CACHE_KEY = "quotation_addin_graph_store_dev_cache_v1";
const GRAPH_EDITOR_STATE_CACHE_KEY = "quotation_addin_graph_editor_state_v1";
const GRAPH_STORE_DEV_SHEET_MARK = "GRAPH_DIALOG_DEV_LIST_V2";
const GRAPH_EDITOR_TEMPLATES_MSG = "graph_editor_templates";
const GRAPH_EDITOR_REQUEST_MSG = "graph_editor_request_templates";
const GRAPH_EDITOR_SAVE_REQUEST_MSG = "graph_editor_save_request";
const GRAPH_EDITOR_SAVE_RESULT_MSG = "graph_editor_save_result";
const INFO_REF_REQUEST_DEVICES_MSG = "info_reference_request_devices";
const INFO_REF_DEVICES_MSG = "info_reference_devices";
const INFO_REF_ERROR_MSG = "info_reference_error";

type InfoRefDeviceRow = {
  cToP: string[];
};

type InfoRefDeviceItem = {
  id: string;
  systemName: string;
  deviceName: string;
  rows: InfoRefDeviceRow[];
};

type InfoRefPayload = {
  devices: InfoRefDeviceItem[];
  columnWidths: number[];
};

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
    (window as any).handleLoginClick = handleLoginClick;
    (window as any).handleResetPasswordClick = handleResetPasswordClick;
    (window as any).handleCancelResetPasswordClick = handleCancelResetPasswordClick;
    (window as any).handleConfirmResetPasswordClick = handleConfirmResetPasswordClick;
    (window as any).handleAddDeviceClick = () => runGuarded(() => withLoginGuard(() => openDialog()));
    (window as any).handleModifyDeviceClick = () =>
      runGuardedWithModal(async () => {
        ensureLoggedInOrThrow();
        await devCraftController.openDevModifyDialog();
      });
    (window as any).handleGenerateSheetClick = () => runGuarded(() => withLoginGuard(() => handleGenerateSheetClick()));
    (window as any).handleGenerateSimpleTemplateClick = () =>
      runGuarded(() => withLoginGuard(() => handleGenerateSimpleTemplateClick()));
    (window as any).handleGenerateDetailTemplateClick = () =>
      runGuarded(() => withLoginGuard(() => handleGenerateDetailTemplateClick()));
    (window as any).handleGenerateQuoteClick = () =>
      runGuarded(() => withLoginGuard(() => handleGenerateQuoteClick()));
    (window as any).handleQueryPriceClick = () => runGuarded(() => withLoginGuard(() => openQueryPriceDialog()));
    (window as any).handleGraphEditorClick = () => runGuarded(() => withLoginGuard(() => openGraphEditorDialog()));
    (window as any).handleInfoReferenceClick = () =>
      runGuarded(() => withLoginGuard(() => openInfoReferenceDialog()));
    (window as any).handleAccountDockToggle = handleAccountDockToggle;
    restoreAuthState();
    bindLoginInputEvents();
    bindGenerateTemplateDrawerAutoClose();
    void refreshLoginStatus();
    warmUpDialogResources();
  }
});

function applyStaticText() {
  setText("loginBtn", TASKPANE_HTML_TEXT.loginBtn);
  setText("addDeviceBtn", TASKPANE_HTML_TEXT.addDeviceBtn);
  setText("resetPasswordBtn", TASKPANE_HTML_TEXT.resetPasswordBtn);
  setText("cancelResetPasswordBtn", TASKPANE_HTML_TEXT.cancelResetPasswordBtn);
  setText("confirmResetPasswordBtn", TASKPANE_HTML_TEXT.confirmResetPasswordBtn);
  setText("modifyDeviceBtn", TASKPANE_HTML_TEXT.modifyDeviceBtn);
  setText("generateSheetBtn", TASKPANE_HTML_TEXT.generateSheetBtn);
  setText("generateSimpleQuoteBtn", "初步报价");
  setText("generateDetailQuoteBtn", "明细报价");
  setText("generateQuoteBtn", TASKPANE_HTML_TEXT.generateQuoteBtn);
  setText("queryPriceBtn", TASKPANE_HTML_TEXT.queryPriceBtn);
  setText("graphEditorBtn", TASKPANE_HTML_TEXT.graphEditorBtn);
  setText("infoReferenceBtn", TASKPANE_HTML_TEXT.infoReferenceBtn);
  setText("loginStatusLabel", "未登录");
  setText("userInfoLabel", "");
  setText("accountDockLabel", "");
  setText("logoutDockBtn", "退出");
  setAccountDockExpanded(false);
  setResetPasswordMode(false);
  setAuthFeedback("");
  setActionFeedback("");
}

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function setButtonDisabled(id: string, disabled: boolean) {
  const el = document.getElementById(id) as HTMLButtonElement | null;
  if (el) {
    el.disabled = disabled;
  }
}

function toggleHidden(id: string, hidden: boolean) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.toggle("is-hidden", hidden);
  }
}

function setAuthFeedback(message: string, kind: "error" | "success" | "pending" | "" = "") {
  const el = document.getElementById("authFeedbackLabel");
  if (el) {
    el.textContent = message;
    el.className = kind ? `auth-feedback ${kind}` : "auth-feedback";
  }
  setActionFeedback(message, kind);
}

function setActionFeedback(message: string, kind: "error" | "success" | "pending" | "" = "") {
  const el = document.getElementById("actionFeedbackLabel");
  if (!el) return;
  el.textContent = message;
  el.className = kind ? `action-feedback ${kind}` : "action-feedback";
}

function notifyVisibleError(message: string) {
  const text = String(message || "").trim() || "操作失败";
  setAuthFeedback(text, "error");
  setActionFeedback(text, "error");
}

async function runGuarded(action: () => unknown | Promise<unknown>) {
  try {
    await Promise.resolve(action());
  } catch (error: any) {
    notifyVisibleError(String(error?.message || error || "操作失败"));
  }
}

async function runGuardedWithModal(action: () => unknown | Promise<unknown>) {
  try {
    await Promise.resolve(action());
  } catch (error: any) {
    const message = String(error?.message || error || "操作失败");
    await showOperationErrorModal(message);
  }
}

function ensureLoggedInOrThrow() {
  if (!currentUser || !authToken) {
    throw new Error("请先输入用户名和密码并登录。");
  }
}

function setAccountDockExpanded(expanded: boolean) {
  isAccountDockExpanded = expanded;
  const dock = document.getElementById("accountDock");
  dock?.classList.toggle("is-expanded", expanded);
}

function getTrimmedInputValue(id: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return (el?.value || "").trim();
}

function getRawInputValue(id: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el?.value || "";
}

function setInputValue(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) {
    el.value = value;
  }
}

function setInputDisabled(id: string, disabled: boolean) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) {
    el.disabled = disabled;
  }
}

function bindLoginInputEvents() {
  const passwordInput = document.getElementById("passwordInput") as HTMLInputElement | null;
  const newPasswordInput = document.getElementById("newPasswordInput") as HTMLInputElement | null;
  const usernameInput = document.getElementById("usernameInput") as HTMLInputElement | null;

  usernameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleLoginClick();
    }
  });
  passwordInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleLoginClick();
    }
  });
  newPasswordInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleConfirmResetPasswordClick();
    }
  });
}

function bindGenerateTemplateDrawerAutoClose() {
  const actionPanel = document.getElementById("actionPanel");
  if (!actionPanel) return;
  actionPanel.addEventListener("click", (evt) => {
    const target = evt.target as HTMLElement | null;
    const btn = target?.closest("button");
    if (!btn) return;
    const id = String((btn as HTMLButtonElement).id || "");
    if (!id || id === "generateQuoteBtn") return;
    toggleGenerateTemplateDrawer(false);
  });
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
  const dialogSize = dialogPath === DIALOG_PATHS.generateQuote ? DIALOG_SIZES.generateQuote : DIALOG_SIZES.main;
  Office.context.ui.displayDialogAsync(
    dialogUrl,
    { ...dialogSize, displayInIframe: isOfficeOnline },
    (result) => {
      const elapsedMs = Math.round(performance.now() - start);
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        console.log(`${TASKPANE_LOG_TEXT.dialogOpenedPrefix} ${elapsedMs}${TASKPANE_LOG_TEXT.dialogOpenedSuffix}`);
        const dialog = result.value;
        dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (args) => {
          dialog.close();
          let data: any = null;
          try {
            data = JSON.parse(args.message);
          } catch (error: any) {
            console.error("解析对话框返回数据失败", error);
            setAuthFeedback(error?.message || "解析对话框返回数据失败", "error");
            return;
          }

          try {
            await retryExcelInternalError(() => saveDialogCompositeToDevSheetWithFallback(data));
          } catch (error: any) {
            const message = error?.message || String(error);
            console.error("保存模板图片失败", error);
            setAuthFeedback(`保存模板图片失败：${message}`, "error");
            // 不阻断主流程：即使图片写入失败，也继续插入报价配置表数据。
          }

          try {
            await retryExcelInternalError(() => handleDialogData(data));
          } catch (error: any) {
            const message = error?.message || String(error);
            console.error("写入报价配置表失败", error);
            setAuthFeedback(`写入报价配置表失败：${message}`, "error");
          }
        });
      } else {
        notifyVisibleError(result.error?.message || "打开窗口失败");
        console.error(
          `${TASKPANE_LOG_TEXT.dialogOpenFailedPrefix} ${elapsedMs}${TASKPANE_LOG_TEXT.dialogOpenFailedSuffix}`,
          result.error.message
        );
      }
    }
  );
}

function isExcelInternalError(error: any) {
  const message = String(error?.message || "");
  return (
    message.includes("处理请求时出现内部错误") ||
    message.includes("无法执行请求的操作") ||
    String(error?.name || "").includes("RichApi.Error")
  );
}

async function retryExcelInternalError<T>(action: () => Promise<T>, retries = 1): Promise<T> {
  let lastError: any = null;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isExcelInternalError(error) || i >= retries) {
        throw error;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
  }
  throw lastError;
}

async function openQueryPriceDialog() {
  await openQueryPriceDialogController(displayDialog);
}

async function handleGenerateSheetClick() {
  const confirmed = await showGenerateTemplateConfirm();
  if (!confirmed) {
    return;
  }
  clearTemplateCachesBeforeGenerate();
  await createQuotationSheet();
}

function toggleGenerateTemplateDrawer(forceOpen?: boolean) {
  const drawer = document.getElementById("generateTemplateDrawer");
  const triggerBtn = document.getElementById("generateQuoteBtn");
  if (!drawer) return;
  const willOpen = typeof forceOpen === "boolean" ? forceOpen : drawer.classList.contains("is-hidden");
  drawer.classList.toggle("is-hidden", !willOpen);
  triggerBtn?.classList.toggle("active", willOpen);
}

async function handleGenerateSimpleTemplateClick() {
  await executeGenerateQuoteFlow("preliminary");
  toggleGenerateTemplateDrawer(false);
}

async function handleGenerateDetailTemplateClick() {
  await showOperationErrorModal("明细报价功能待定。");
  toggleGenerateTemplateDrawer(false);
}

function clearTemplateCachesBeforeGenerate() {
  try {
    localStorage.removeItem(GRAPH_STORE_DEV_CACHE_KEY);
    localStorage.removeItem(GRAPH_EDITOR_STATE_CACHE_KEY);
  } catch {
    // ignore local cache cleanup failures
  }
}

function showGenerateTemplateConfirm(): Promise<boolean> {
  const modal = document.getElementById("generateTemplateConfirmModal");
  const okBtn = document.getElementById("confirmGenerateTemplateOk") as HTMLButtonElement | null;
  const cancelBtn = document.getElementById("confirmGenerateTemplateCancel") as HTMLButtonElement | null;

  if (!modal || !okBtn || !cancelBtn) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      modal.classList.add("is-hidden");
      document.removeEventListener("keydown", onKeydown);
    };
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onOk = () => settle(true);
    const onCancel = () => settle(false);
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      }
    };

    modal.classList.remove("is-hidden");
    okBtn.addEventListener("click", onOk, { once: true });
    cancelBtn.addEventListener("click", onCancel, { once: true });
    document.addEventListener("keydown", onKeydown);
  });
}

function showOperationErrorModal(message: string): Promise<void> {
  const modal = document.getElementById("operationErrorModal");
  const msg = document.getElementById("operationErrorMessage");
  const okBtn = document.getElementById("operationErrorOk") as HTMLButtonElement | null;
  if (!modal || !okBtn || !msg) {
    return Promise.resolve();
  }

  msg.textContent = String(message || "操作失败，请稍后重试。");
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      okBtn.removeEventListener("click", onOk);
      modal.classList.add("is-hidden");
      document.removeEventListener("keydown", onKeydown);
    };
    const settle = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onOk = () => settle();
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        settle();
      }
    };

    modal.classList.remove("is-hidden");
    okBtn.addEventListener("click", onOk, { once: true });
    document.addEventListener("keydown", onKeydown);
  });
}

async function openInfoReferenceDialog() {
  console.log("[InfoReferenceDebug] openInfoReferenceDialog invoked", {
    path: DIALOG_PATHS.infoReference,
    size: DIALOG_SIZES.infoReference,
  });
  try {
    const dialog = await displayDialog(DIALOG_PATHS.infoReference, DIALOG_SIZES.infoReference);
    console.log("[InfoReferenceDebug] infoReference dialog opened");
    dialog.addEventHandler(Office.EventType.DialogMessageReceived, (args) => {
      void handleInfoReferenceDialogMessage(dialog, args);
    });
    // Fallback: proactively push once in case request message is lost/racing.
    await pushInfoReferenceDevicesToDialog(dialog);
  } catch (error) {
    console.error("[InfoReferenceDebug] infoReference dialog open failed", error);
    setAuthFeedback(`信息参考窗口打开失败：${(error as any)?.message || String(error)}`, "error");
  }
}

async function handleInfoReferenceDialogMessage(dialog: Office.Dialog, args: any) {
  try {
    const payload = JSON.parse(String(args?.message || "{}"));
    console.log("[InfoReferenceDebug] taskpane received dialog message", payload?.type);
    if (payload?.type !== INFO_REF_REQUEST_DEVICES_MSG) {
      return;
    }
    await pushInfoReferenceDevicesToDialog(dialog);
  } catch (error: any) {
    try {
      (dialog as any).messageChild(
        JSON.stringify({
          type: INFO_REF_ERROR_MSG,
          message: String(error?.message || error),
        })
      );
    } catch {
      // ignore send failures
    }
  }
}

async function pushInfoReferenceDevicesToDialog(dialog: Office.Dialog) {
  const payload = await readInfoReferenceDevicesFromWorkbook();
  console.log("[InfoReferenceDebug] taskpane push devices", {
    count: payload.devices.length,
    sample: payload.devices.slice(0, 5).map((d) => d.deviceName),
    columnWidths: payload.columnWidths,
  });
  (dialog as any).messageChild(
    JSON.stringify({
      type: INFO_REF_DEVICES_MSG,
      data: payload,
    })
  );
}

async function readInfoReferenceDevicesFromWorkbook(): Promise<InfoRefPayload> {
  return Excel.run(async (context) => {
    const workbookSheets = context.workbook.worksheets;
    workbookSheets.load("items/name");
    await context.sync();

    const quoteSheetName = workbookSheets.items
      .map((s) => String(s.name || "").trim())
      .find((name) => name === SHEET_NAMES.quoteConfig || name === "配置报价表" || name.includes("报价配置"));
    if (!quoteSheetName) {
      return { devices: [], columnWidths: [] };
    }

    const sheet = context.workbook.worksheets.getItem(quoteSheetName);
    const used = sheet.getUsedRangeOrNullObject(false);
    used.load("values,isNullObject");
    const colLetters = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"];
    const colRanges = colLetters.map((c) => sheet.getRange(`${c}:${c}`));
    colRanges.forEach((r) => r.format.load("columnWidth"));
    await context.sync();
    if (used.isNullObject) {
      return {
        devices: [],
        columnWidths: colRanges.map((r) => Number((r.format as any).columnWidth || 0)),
      };
    }

    const values = used.values || [];
    const headerTexts = new Set([
      String(BUILDSHEET_TEXT.configHeaders[0] || "").trim(),
      String(BUILDSHEET_TEXT.configHeaders[1] || "").trim(),
      String(BUILDSHEET_TEXT.configHeaders[2] || "").trim(),
      String(BUILDSHEET_TEXT.configSectionTotalLabel || "").trim(),
    ]);
    const devices: InfoRefDeviceItem[] = [];
    let currentDevice: InfoRefDeviceItem | null = null;
    let currentSystemName = "未分类";

    values.forEach((row, rowIndex) => {
      const a = String(row?.[0] || "").trim();
      const b = String(row?.[1] || "").trim();
      const cToP = Array.from({ length: 14 }, (_, i) => String(row?.[i + 2] ?? "").trim());
      const componentName = cToP[0];

      const isSectionTitle = /^[一二三四五六七八九十百零]+$/.test(a) && !!b;
      if (isSectionTitle) {
        currentSystemName = b;
        currentDevice = null;
        return;
      }

      if (b && headerTexts.has(b)) {
        currentDevice = null;
        return;
      }

      if (b) {
        currentDevice = {
          id: `${b}#${rowIndex}`,
          systemName: currentSystemName,
          deviceName: b,
          rows: [],
        };
        devices.push(currentDevice);
      }

      if (!componentName || !currentDevice) return;
      currentDevice.rows.push({ cToP });
    });

    return {
      devices: devices.filter((d) => d.deviceName),
      columnWidths: colRanges.map((r) => Number((r.format as any).columnWidth || 0)),
    };
  });
}

async function openGraphEditorDialog() {
  const dialog = await displayDialog(DIALOG_PATHS.graphEditor, DIALOG_SIZES.graphEditor);
  dialog.addEventHandler(Office.EventType.DialogMessageReceived, (args) => {
    try {
      const payload = JSON.parse(String(args.message || "{}"));
      if (payload?.type === GRAPH_EDITOR_REQUEST_MSG) {
        const raw = localStorage.getItem(GRAPH_STORE_DEV_CACHE_KEY);
        const cache = raw ? JSON.parse(raw) : null;
        const message = JSON.stringify({
          type: GRAPH_EDITOR_TEMPLATES_MSG,
          data: cache || null,
        });
        // DialogApi 1.2: send data from taskpane to dialog
        (dialog as any).messageChild(message);
        return;
      }
      if (payload?.type === GRAPH_EDITOR_SAVE_REQUEST_MSG) {
        void handleGraphEditorSaveRequest(dialog, payload);
      }
    } catch {
      // ignore malformed dialog messages
    }
  });
}

async function handleGraphEditorSaveRequest(dialog: Office.Dialog, payload: any) {
  const requestId = String(payload?.requestId || "").trim();
  let ok = false;
  let message = "";
  try {
    const workbookPayload = (payload?.payload || {}) as WorkbookGraphPayload;
    await saveGraphToWorkbook(workbookPayload);
    ok = true;
    message = "ok";
  } catch (error: any) {
    ok = false;
    message = String(error?.message || "保存失败");
  }

  try {
    (dialog as any).messageChild(
      JSON.stringify({
        type: GRAPH_EDITOR_SAVE_RESULT_MSG,
        requestId,
        ok,
        message,
      })
    );
  } catch {
    // ignore send failures
  }
}

async function handleGenerateQuoteClick() {
  toggleGenerateTemplateDrawer();
}

async function executeGenerateQuoteFlow(mode: "full" | "preliminary" = "full") {
  try {
    await syncQuoteSummaryAndCachePreview(mode);
    openDialog(DIALOG_PATHS.generateQuote);
  } catch (error: any) {
    const message = String(error?.message || error || "生成报价失败");
    await showOperationErrorModal(message);
  }
}

function normalizeSystemName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[、，,（）().\s]/g, "")
    .replace(/系统部分/g, "系统")
    .replace(/筛分除磁包装/g, "粉分除尘包装")
    .replace(/除尘器系统/g, "除尘系统");
}

function parseCellNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const text = String(value ?? "")
    .replace(/[¥￥,\s]/g, "")
    .trim();
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function hasCellValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return true;
  return String(value).trim().length > 0;
}

function isConfigSectionTitleRow(aValue: unknown, bValue: unknown) {
  const aText = String(aValue ?? "").trim();
  const bText = String(bValue ?? "").trim();
  return !!aText && !!bText && CHINESE_ORDINAL_REGEX.test(aText);
}

function formatCurrencyLikeText(value: unknown): string {
  const num = parseCellNumber(value);
  if (!num) return "";
  return `¥${Math.round(num).toLocaleString("zh-CN")}`;
}

async function syncQuoteSummaryAndCachePreview(mode: "full" | "preliminary" = "full") {
  const payload = await Excel.run(async (context) => {
    const quoteConfigSheet = context.workbook.worksheets.getItemOrNullObject(SHEET_NAMES.quoteConfig);
    const quoteSummarySheet = context.workbook.worksheets.getItemOrNullObject(SHEET_NAMES.quoteSummary);
    quoteConfigSheet.load("name");
    quoteSummarySheet.load("name");
    await context.sync();

    if (quoteConfigSheet.isNullObject) {
      throw new Error("报价配置表不存在，请先生成并填写报价配置表。");
    }
    if (quoteSummarySheet.isNullObject) {
      throw new Error("报价汇总表不存在，请先生成报价模板。");
    }

    const configUsedRange = quoteConfigSheet.getRange("A:P").getUsedRangeOrNullObject(false);
    configUsedRange.load(["values", "isNullObject"]);
    const summaryItemsRange = quoteSummarySheet.getRange("A9:G21");
    summaryItemsRange.load(["values"]);
    await context.sync();

    if (configUsedRange.isNullObject) {
      throw new Error("报价配置表为空，无法生成报价。");
    }

    const sectionCostMap = new Map<string, number>();
    const sectionPriceMap = new Map<string, number>();
    const configValues = configUsedRange.values || [];
    configValues.forEach((row) => {
      if (!isConfigSectionTitleRow(row?.[0], row?.[1])) return;
      const normalized = normalizeSystemName(row?.[1]);
      if (!normalized) return;
      sectionCostMap.set(normalized, parseCellNumber(row?.[13])); // N 列：成本总价
      sectionPriceMap.set(normalized, parseCellNumber(row?.[15])); // P 列：总价
    });

    const summaryRows = summaryItemsRange.values || [];
    const summaryCostValues = summaryRows.map((row) => {
      const normalized = normalizeSystemName(row?.[1]);
      let amount = sectionCostMap.get(normalized);
      if (amount == null && normalized) {
        for (const [k, v] of sectionCostMap.entries()) {
          if (k.includes(normalized) || normalized.includes(k)) {
            amount = v;
            break;
          }
        }
      }
      return [amount && amount !== 0 ? Math.round(amount) : ""];
    });

    const summaryPriceValues = summaryRows.map((row) => {
      const normalized = normalizeSystemName(row?.[1]);
      let amount = sectionPriceMap.get(normalized);
      if (amount == null && normalized) {
        for (const [k, v] of sectionPriceMap.entries()) {
          if (k.includes(normalized) || normalized.includes(k)) {
            amount = v;
            break;
          }
        }
      }
      return [amount && amount !== 0 ? Math.round(amount) : ""];
    });

    const summaryRatioRange = quoteSummarySheet.getRange("F9:F22");
    summaryRatioRange.load(["values"]);
    await context.sync();

    quoteSummarySheet.getRange("D9:D21").values = summaryCostValues;
    quoteSummarySheet.getRange("D9:D22").format.numberFormat = "#,##0";
    quoteSummarySheet.getRange("D22").formulas = [["=SUM(D9:D21)"]];

    if (mode === "preliminary") {
      const suggestedRatios = Array.from({ length: 13 }, (_, i) => {
        const rowNum = 9 + i;
        const cost = parseCellNumber(summaryCostValues[i]?.[0]);
        const price = parseCellNumber(summaryPriceValues[i]?.[0]);
        if (!cost || !price) return "";
        const ratio = Math.round((price / cost) * 10) / 10;
        return ratio;
      });

      const existingRatioValues = summaryRatioRange.values || [];
      const finalRatioValues = suggestedRatios.map((ratio, i) => {
        const existing = existingRatioValues[i]?.[0];
        if (hasCellValue(existing)) {
          return [existing];
        }
        return [ratio];
      });
      quoteSummarySheet.getRange("F9:F21").values = finalRatioValues;
      quoteSummarySheet.getRange("F9:F22").format.numberFormat = "0.0";
    }

    const priceFormulas = Array.from({ length: 13 }, (_, i) => {
      const rowNum = 9 + i;
      return [`=IF(OR(D${rowNum}=\"\",F${rowNum}=\"\"),\"\",D${rowNum}*F${rowNum})`];
    });
    quoteSummarySheet.getRange("E9:E21").formulas = priceFormulas;
    quoteSummarySheet.getRange("E22").formulas = [["=SUM(E9:E21)"]];
    quoteSummarySheet.getRange("E9:E22").format.numberFormat = "#,##0";
    quoteSummarySheet.getRange("F22").formulas = [["=IF(OR(D22=\"\",D22=0,E22=\"\"),\"\",E22/D22)"]];

    const fullPreviewRange = quoteSummarySheet.getRange("A1:G29");
    fullPreviewRange.load(["values", "text"]);
    const rowRanges = Array.from({ length: 29 }, (_, i) => quoteSummarySheet.getRange(`${i + 1}:${i + 1}`));
    rowRanges.forEach((r) => r.format.load("rowHeight"));
    const colKeys = ["A", "B", "C", "D", "E", "F", "G"];
    const colRanges = colKeys.map((col) => quoteSummarySheet.getRange(`${col}:${col}`));
    colRanges.forEach((r) => r.format.load("columnWidth"));
    const mergedAreas = (fullPreviewRange as any).getMergedAreasOrNullObject ? (fullPreviewRange as any).getMergedAreasOrNullObject() : null;
    if (mergedAreas) {
      try {
        mergedAreas.load("areas/items/address");
      } catch {
        // ignore merged areas load incompatibility; preview will use fallback merges
      }
    }

    await context.sync();

    const rowHeights = rowRanges.map((r) => Number((r.format as any).rowHeight || 0));
    const colWidths = colRanges.map((r) => Number((r.format as any).columnWidth || 0));
    const mergeCells: Array<{ row: number; col: number; rowspan: number; colspan: number }> = [];
    try {
      const areas = (mergedAreas as any)?.areas?.items || [];
      areas.forEach((area: any) => {
        const address = String(area?.address || "");
        const merge = parseA1MergeAddress(address);
        if (merge) {
          mergeCells.push(merge);
        }
      });
    } catch {
      // ignore merge parsing issues; preview will fallback to default merge config
    }

    const previewGridRaw =
      ((fullPreviewRange as any).text as unknown[][]) ||
      ((fullPreviewRange as any).texts as unknown[][]) ||
      (fullPreviewRange.values as unknown[][]) ||
      [];

    const basePayload = {
      quoteSheetGrid: previewGridRaw.map((r) =>
        Array.isArray(r) ? r.map((c) => String(c ?? "")) : ["", "", "", "", "", "", ""]
      ),
      quoteSheetLayout: {
        rowHeights,
        colWidths,
        merges: mergeCells,
      },
      totalPriceText: formatCurrencyLikeText(parseCellNumber(summaryPriceValues.reduce((sum, item) => sum + parseCellNumber(item[0]), 0))),
      generatedAt: new Date().toISOString(),
      quotePreviewMode: mode,
    };
    return mode === "preliminary" ? toPreliminaryPreviewPayload(basePayload as any) : basePayload;
  });

  localStorage.setItem(QUOTE_PREVIEW_STORAGE_KEY, JSON.stringify(payload));
}

function toPreliminaryPreviewPayload(payload: {
  quoteSheetGrid: string[][];
  quoteSheetLayout: { rowHeights?: number[]; colWidths?: number[]; merges?: Array<{ row: number; col: number; rowspan: number; colspan: number }> };
  totalPriceText: string;
  generatedAt: string;
  quotePreviewMode: "full" | "preliminary";
}) {
  // Hide D(成本) and F(系数) columns in preliminary preview.
  const keptIdx = [0, 1, 2, 4, 6];
  const removedCols = new Set([4, 6]); // 1-based
  const remCount = (col: number) => {
    let n = 0;
    removedCols.forEach((x) => {
      if (x <= col) n += 1;
    });
    return n;
  };

  const nextGrid = (payload.quoteSheetGrid || []).map((row) => keptIdx.map((i) => String(row?.[i] ?? "")));
  const nextColWidths = keptIdx.map((i) => Number(payload.quoteSheetLayout?.colWidths?.[i] || 0));
  const nextMerges = (payload.quoteSheetLayout?.merges || [])
    .map((m) => {
      const oldStart = Number(m.col || 1);
      const oldEnd = oldStart + Number(m.colspan || 1) - 1;
      const newStart = oldStart - remCount(oldStart);
      const newEnd = oldEnd - remCount(oldEnd);
      const colspan = Math.max(0, newEnd - newStart + 1);
      return {
        row: Number(m.row || 1),
        col: Math.max(1, newStart),
        rowspan: Math.max(1, Number(m.rowspan || 1)),
        colspan,
      };
    })
    .filter((m) => m.colspan > 0);

  return {
    ...payload,
    quoteSheetGrid: nextGrid,
    quoteSheetLayout: {
      ...(payload.quoteSheetLayout || {}),
      colWidths: nextColWidths,
      merges: nextMerges,
    },
    quotePreviewMode: "preliminary" as const,
  };
}

function parseA1MergeAddress(address: string):
  | { row: number; col: number; rowspan: number; colspan: number }
  | null {
  const normalized = String(address || "").trim();
  if (!normalized) return null;
  const local = normalized.includes("!") ? normalized.split("!").pop() || "" : normalized;
  const firstArea = local.split(",")[0].trim();
  const parts = firstArea.split(":");
  if (parts.length !== 2) return null;
  const start = parseCellRef(parts[0]);
  const end = parseCellRef(parts[1]);
  if (!start || !end) return null;
  if (start.row > 29 || end.row < 1 || start.col > 7 || end.col < 1) return null;
  const row = Math.max(1, start.row);
  const col = Math.max(1, start.col);
  const endRow = Math.min(29, end.row);
  const endCol = Math.min(7, end.col);
  return {
    row,
    col,
    rowspan: Math.max(1, endRow - row + 1),
    colspan: Math.max(1, endCol - col + 1),
  };
}

function parseCellRef(ref: string): { row: number; col: number } | null {
  const match = String(ref || "")
    .replace(/\$/g, "")
    .trim()
    .match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  const colLabel = match[1].toUpperCase();
  const row = Number(match[2]);
  if (!Number.isFinite(row)) return null;
  let col = 0;
  for (let i = 0; i < colLabel.length; i++) {
    col = col * 26 + (colLabel.charCodeAt(i) - 64);
  }
  return { row, col };
}

function chunkLargeText(text: string, size: number) {
  const source = String(text || "");
  const chunks: string[] = [];
  for (let i = 0; i < source.length; i += size) {
    chunks.push(source.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [""];
}

type GraphStoreCacheEntry = {
  savedAt: string;
  project: string;
  compositeImage: string;
};

function formatLocalDateTime(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function appendGraphStoreLocalCache(entry: GraphStoreCacheEntry) {
  if (!entry.compositeImage) return;
  try {
    const raw = localStorage.getItem(GRAPH_STORE_DEV_CACHE_KEY);
    let templates: GraphStoreCacheEntry[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.templates)) {
        templates = parsed.templates as GraphStoreCacheEntry[];
      } else if (typeof parsed?.compositeImage === "string") {
        templates = [
          {
            savedAt: String(parsed?.savedAt || new Date().toISOString()),
            project: String(parsed?.project || ""),
            compositeImage: String(parsed?.compositeImage || ""),
          },
        ];
      }
    }
    templates.push(entry);
    const MAX_TEMPLATES = 120;
    if (templates.length > MAX_TEMPLATES) {
      templates = templates.slice(templates.length - MAX_TEMPLATES);
    }
    localStorage.setItem(
      GRAPH_STORE_DEV_CACHE_KEY,
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        templates,
      })
    );
  } catch {
    // ignore local cache write failure
  }
}

async function saveDialogCompositeToDevSheet(data: any) {
  const entry: GraphStoreCacheEntry = {
    savedAt: formatLocalDateTime(new Date()),
    project: String(data?.project || ""),
    compositeImage: String(data?.compositeImage || ""),
  };
  if (!entry.compositeImage || !entry.compositeImage.trim()) {
    return;
  }
  appendGraphStoreLocalCache(entry);

  await Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;
    let sheet = sheets.getItemOrNullObject(GRAPH_STORE_DEV_SHEET);
    sheet.load("name,isNullObject");
    await context.sync();

    if (sheet.isNullObject) {
      sheet = sheets.add(GRAPH_STORE_DEV_SHEET);
    }

    // 开发阶段保持可见，便于直接验证
    sheet.visibility = Excel.SheetVisibility.visible;

    const meta = {
      savedAt: entry.savedAt,
      categoryId: data?.categoryId ?? null,
      category: data?.category ?? "",
      projectId: data?.projectId ?? null,
      project: data?.project ?? "",
      detailsCount: Array.isArray(data?.details) ? data.details.length : 0,
      annotationsCount: Array.isArray(data?.annotations) ? data.annotations.length : 0,
      hasCompositeImage: !!data?.compositeImage,
    };
    const metaJson = JSON.stringify(meta);
    const imageData = entry.compositeImage;
    const chunks = chunkLargeText(imageData, GRAPH_STORE_MAX_CELL_CHARS);
    const rows = chunks.map((chunk) => [chunk]);
    const header = sheet.getRange("A1:B1");
    header.load("values");
    await context.sync();

    const mark = String(header.values?.[0]?.[0] || "").trim();
    let nextRow = Number(header.values?.[0]?.[1] || 10);
    if (!Number.isFinite(nextRow) || nextRow < 10) {
      nextRow = 10;
    }

    if (mark !== GRAPH_STORE_DEV_SHEET_MARK) {
      // 初始化为多记录结构（旧格式不再覆盖写入）。
      sheet.getUsedRangeOrNullObject(true).clear(Excel.ClearApplyTo.contents);
      sheet.getRange("A1").values = [[GRAPH_STORE_DEV_SHEET_MARK]];
      sheet.getRange("B1").values = [[String(10)]];
      sheet.getRange("A2").values = [["A列: ENTRY标记；B=保存时间；C=项目；D=元数据JSON；E=图片分块数；F列起=图片分块"]];
      nextRow = 10;
    }

    const startRow = nextRow;
    sheet.getRange(`A${startRow}`).values = [["ENTRY"]];
    sheet.getRange(`B${startRow}`).values = [[entry.savedAt]];
    sheet.getRange(`C${startRow}`).values = [[entry.project]];
    sheet.getRange(`D${startRow}`).values = [[metaJson]];
    sheet.getRange(`E${startRow}`).values = [[String(chunks.length)]];

    if (rows.length > 0) {
      const chunkStart = startRow + 1;
      const BATCH = 8;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batchRows = rows.slice(i, i + BATCH);
        const from = chunkStart + i;
        const to = from + batchRows.length - 1;
        sheet.getRange(`F${from}:F${to}`).values = batchRows;
        await context.sync();
      }
    }

    const afterRow = startRow + 1 + rows.length;
    const nextWriteRow = afterRow + 1;
    sheet.getRange(`A${afterRow}:F${afterRow}`).clear(Excel.ClearApplyTo.contents);
    sheet.getRange("B1").values = [[String(nextWriteRow)]];

    await context.sync();
  });
}

async function saveDialogCompositeToDevSheetWithFallback(data: any) {
  try {
    await saveDialogCompositeToDevSheet(data);
    return;
  } catch (error) {
    if (!isExcelInternalError(error)) {
      throw error;
    }
    const compressed = await compressDataUrlForWorkbook(String(data?.compositeImage || ""), 420000);
    if (!compressed) {
      throw error;
    }
    const nextData = { ...(data || {}), compositeImage: compressed };
    await saveDialogCompositeToDevSheet(nextData);
  }
}

async function compressDataUrlForWorkbook(dataUrl: string, targetChars: number): Promise<string> {
  const source = String(dataUrl || "").trim();
  if (!source) return "";
  if (!source.startsWith("data:")) {
    return source.length <= targetChars ? source : "";
  }
  if (source.length <= targetChars) {
    return source;
  }

  const image = await loadImageFromDataUrl(source);
  if (!image) {
    return "";
  }

  let scale = 1;
  const qualitySteps = [0.88, 0.78, 0.68, 0.58, 0.5];
  let best = source;

  for (let round = 0; round < 6; round += 1) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    for (const q of qualitySteps) {
      const jpg = canvas.toDataURL("image/jpeg", q);
      if (jpg.length < best.length) {
        best = jpg;
      }
      if (jpg.length <= targetChars) {
        return jpg;
      }
    }

    const png = canvas.toDataURL("image/png");
    if (png.length < best.length) {
      best = png;
    }
    if (png.length <= targetChars) {
      return png;
    }

    scale *= 0.8;
  }

  return best.length < source.length ? best : "";
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function restoreAuthState() {
  try {
    authToken = localStorage.getItem(UI_DEFAULTS.authTokenStorageKey) || "";
  } catch {
    authToken = "";
  }
}

function persistAuthToken(token: string) {
  authToken = token;
  try {
    if (token) {
      localStorage.setItem(UI_DEFAULTS.authTokenStorageKey, token);
    } else {
      localStorage.removeItem(UI_DEFAULTS.authTokenStorageKey);
    }
  } catch {
    // ignore storage failures
  }
}

function setLoginUiState() {
  const loginText = currentUser ? `退出（${currentUser.fullName || currentUser.username}）` : TASKPANE_HTML_TEXT.loginBtn;
  setText("loginBtn", loginText);
  setText("loginStatusLabel", currentUser ? `已登录：${currentUser.fullName || currentUser.username}` : "未登录");
  setText(
    "userInfoLabel",
    currentUser ? `当前用户：${currentUser.fullName || currentUser.username}（${currentUser.username}）` : ""
  );
  const authPanel = document.getElementById("authPanel");
  const actionPanel = document.getElementById("actionPanel");
  const accountDock = document.getElementById("accountDock");
  authPanel?.classList.toggle("is-hidden", !!currentUser);
  authPanel?.classList.toggle("is-collapsed", false);
  actionPanel?.classList.toggle("is-hidden", !currentUser);
  accountDock?.classList.toggle("is-hidden", !currentUser);
  setText("accountDockLabel", currentUser ? `${currentUser.fullName || currentUser.username}` : "");
  if (!currentUser) {
    setAccountDockExpanded(false);
  }
  if (!currentUser) {
    setResetPasswordMode(false);
  }
  setInputDisabled("usernameInput", !!currentUser);
  setInputDisabled("passwordInput", !!currentUser);
  setInputDisabled("newPasswordInput", !!currentUser);
  if (currentUser) {
    setResetPasswordMode(false);
    setInputValue("passwordInput", "");
    setInputValue("newPasswordInput", "");
    setAuthFeedback("");
  }
}

function setResetPasswordMode(enabled: boolean) {
  isResetPasswordMode = enabled && !currentUser;
  toggleHidden("newPasswordInput", !isResetPasswordMode);
  toggleHidden("resetPasswordTip", !isResetPasswordMode);
  toggleHidden("loginBtn", isResetPasswordMode);
  toggleHidden("resetPasswordBtn", isResetPasswordMode);
  toggleHidden("cancelResetPasswordBtn", !isResetPasswordMode);
  toggleHidden("confirmResetPasswordBtn", !isResetPasswordMode);

  if (!isResetPasswordMode) {
    setInputValue("newPasswordInput", "");
  }
}

function handleAccountDockToggle() {
  if (!currentUser) return;
  setAccountDockExpanded(!isAccountDockExpanded);
}

async function authRequest(path: string, init?: RequestInit) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${APP_URLS.apiBase}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const result = await response.json();
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || result?.message || "请求失败");
  }
  return result.data;
}

async function refreshLoginStatus() {
  if (!authToken) {
    currentUser = null;
    setLoginUiState();
    return;
  }

  try {
    const data = await authRequest(API_PATHS.authMe, { method: "GET" });
    currentUser = {
      username: String(data?.username || ""),
      fullName: String(data?.fullName || data?.username || ""),
    };
  } catch {
    currentUser = null;
    persistAuthToken("");
    setAuthFeedback("登录状态已失效，请重新登录。", "error");
  }
  setLoginUiState();
}

async function handleLoginClick() {
  if (currentUser) {
    try {
      await authRequest(API_PATHS.authLogout, { method: "POST" });
    } catch (error) {
      console.warn("退出登录失败:", error);
    }
    currentUser = null;
    persistAuthToken("");
    setAccountDockExpanded(false);
    setLoginUiState();
    setAuthFeedback("已退出登录。", "success");
    return;
  }

  const username = getTrimmedInputValue("usernameInput");
  const password = getRawInputValue("passwordInput");
  if (!username) {
    setAuthFeedback("请输入用户名。", "error");
    return;
  }
  if (!password) {
    setAuthFeedback("请输入密码。", "error");
    return;
  }

  try {
    setAuthFeedback("正在登录...", "pending");
    setButtonDisabled("loginBtn", true);
    const data = await authRequest(API_PATHS.authLogin, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    const token = String(data?.token || "");
    if (!token) {
      throw new Error("登录失败：未返回令牌");
    }
    persistAuthToken(token);
    currentUser = {
      username: String(data?.username || username),
      fullName: String(data?.fullName || data?.username || username),
    };
    setInputValue("passwordInput", "");
    setLoginUiState();
    setAuthFeedback("登录成功。", "success");
  } catch (error) {
    setAuthFeedback((error as Error).message || "登录失败", "error");
    currentUser = null;
    persistAuthToken("");
    setLoginUiState();
  } finally {
    setButtonDisabled("loginBtn", false);
  }
}

async function handleResetPasswordClick() {
  if (currentUser) {
    setAuthFeedback("请先退出登录，再重置密码。", "error");
    return;
  }
  setResetPasswordMode(true);
  setAuthFeedback("已进入重置密码模式。", "pending");
}

function handleCancelResetPasswordClick() {
  setResetPasswordMode(false);
  setAuthFeedback("已取消重置密码。", "success");
}

async function handleConfirmResetPasswordClick() {
  if (currentUser) {
    setAuthFeedback("请先退出登录，再重置密码。", "error");
    return;
  }

  const username = getTrimmedInputValue("usernameInput");
  const oldPassword = getRawInputValue("passwordInput");
  const newPassword = getRawInputValue("newPasswordInput");

  if (!username) {
    setAuthFeedback("请输入用户名。", "error");
    return;
  }
  if (!oldPassword) {
    setAuthFeedback("请输入当前密码。", "error");
    return;
  }
  if (!newPassword) {
    setAuthFeedback("请输入新密码。", "error");
    return;
  }
  try {
    setAuthFeedback("正在重置密码...", "pending");
    setButtonDisabled("confirmResetPasswordBtn", true);
    await authRequest(API_PATHS.authResetPassword, {
      method: "POST",
      body: JSON.stringify({ username, oldPassword, newPassword }),
    });
    setInputValue("passwordInput", "");
    setInputValue("newPasswordInput", "");
    setResetPasswordMode(false);
    setAuthFeedback("密码重置成功，请使用新密码登录。", "success");
  } catch (error) {
    setAuthFeedback((error as Error).message || "重置密码失败", "error");
  } finally {
    setButtonDisabled("confirmResetPasswordBtn", false);
  }
}

function withLoginGuard<T>(action: () => T): T | void {
  if (!currentUser || !authToken) {
    notifyVisibleError("请先输入用户名和密码并登录。");
    return;
  }
  return action();
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



