/* global console, document, Excel, Office, window, localStorage, URL, performance, fetch, Image, HTMLImageElement, RequestInit */
import React from "react";
import { createRoot, Root } from "react-dom/client";
import {
  API_PATHS,
  APP_URLS,
  DIALOG_PATHS,
  DIALOG_SIZES,
  UI_DEFAULTS,
} from "../shared/appConstants";
import { BUILDSHEET_TEXT } from "../shared/businessTextConstants";
import { TASKPANE_HTML_TEXT, TASKPANE_LOG_TEXT } from "../shared/dialogHtmlTextConstants";
import { SHEET_NAMES } from "../shared/sheetNames";
import type {
  GraphProductLibraryEntry,
  WorkbookGraphPayload,
} from "../graph-editor/workbookStore";
import type { TaskpaneViewState } from "./taskpaneApp";

/* global console, document, Excel, Office */

type DevCraftController = {
  openDevModifyDialog: () => Promise<void>;
  openDevModifyDialogV2: () => Promise<void>;
  openCraftModifyDialog: () => Promise<void>;
};

let devCraftControllerPromise: Promise<DevCraftController> | null = null;
let authToken = "";
let currentUser: { username: string; fullName: string } | null = null;
let isResetPasswordMode = false;
let isAccountDockExpanded = false;
let taskpaneRoot: Root | null = null;
let TaskpaneAppComponent: React.ComponentType<{
  state: TaskpaneViewState;
  handlers: Record<string, unknown>;
}> | null = null;
let taskpaneAppModulePromise: Promise<void> | null = null;
let generateTemplateConfirmResolver: ((value: boolean) => void) | null = null;
let operationErrorResolver: (() => void) | null = null;
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

async function getDevCraftController(): Promise<DevCraftController> {
  if (!devCraftControllerPromise) {
    devCraftControllerPromise = import(
      /* webpackChunkName: "dev-craft-controller" */
      "./devCraftController"
    ).then((module) => module.createDevCraftController(displayDialog));
  }
  return devCraftControllerPromise;
}

async function createQuotationSheetLazy() {
  const module = await import(
    /* webpackChunkName: "buildsheet" */
    "../buildsheet"
  );
  return module.createQuotationSheet();
}

async function openQueryPriceDialogLazy() {
  const module = await import(
    /* webpackChunkName: "query-price-controller" */
    "./querypriceController"
  );
  return module.openQueryPriceDialogController(displayDialog);
}

async function getWorkbookStoreModule() {
  return import(
    /* webpackChunkName: "graph-workbook-store" */
    "../graph-editor/workbookStore"
  );
}

async function getDialogDataModule() {
  return import(
    /* webpackChunkName: "dialog-data-handler" */
    "../dialog/handleDialogData"
  );
}

async function ensureTaskpaneAppLoaded() {
  if (TaskpaneAppComponent) {
    return;
  }
  if (!taskpaneAppModulePromise) {
    taskpaneAppModulePromise = import(
      /* webpackChunkName: "taskpane-app" */
      "./taskpaneApp"
    ).then((module) => {
      TaskpaneAppComponent = module.TaskpaneApp;
    });
  }
  await taskpaneAppModulePromise;
}

const taskpaneViewState: TaskpaneViewState = {
  isExcelReady: false,
  itemSubject: "",
  currentUser: null,
  isResetPasswordMode: false,
  isAccountDockExpanded: false,
  isGenerateTemplateDrawerOpen: false,
  isModifyDeviceDrawerOpen: false,
  authFeedback: "",
  authFeedbackKind: "",
  actionFeedback: "",
  actionFeedbackKind: "",
  inputValues: {
    usernameInput: "",
    passwordInput: "",
    newPasswordInput: "",
  },
  inputDisabled: {
    usernameInput: false,
    passwordInput: false,
    newPasswordInput: false,
  },
  buttonDisabled: {
    loginBtn: false,
    confirmResetPasswordBtn: false,
  },
  texts: {
    loginBtn: TASKPANE_HTML_TEXT.loginBtn,
    addDeviceBtn: TASKPANE_HTML_TEXT.addDeviceBtn,
    resetPasswordBtn: TASKPANE_HTML_TEXT.resetPasswordBtn,
    cancelResetPasswordBtn: TASKPANE_HTML_TEXT.cancelResetPasswordBtn,
    confirmResetPasswordBtn: TASKPANE_HTML_TEXT.confirmResetPasswordBtn,
    modifyDeviceBtn: TASKPANE_HTML_TEXT.modifyDeviceBtn,
    modifyDeviceLegacyBtn: TASKPANE_HTML_TEXT.modifyDeviceLegacyBtn,
    modifyDeviceNewBtn: TASKPANE_HTML_TEXT.modifyDeviceNewBtn,
    generateSheetBtn: TASKPANE_HTML_TEXT.generateSheetBtn,
    generateSimpleQuoteBtn: TASKPANE_HTML_TEXT.generateSimpleQuoteBtn,
    generateDetailQuoteBtn: TASKPANE_HTML_TEXT.generateDetailQuoteBtn,
    generateQuoteBtn: TASKPANE_HTML_TEXT.generateQuoteBtn,
    queryPriceBtn: TASKPANE_HTML_TEXT.queryPriceBtn,
    graphEditorBtn: TASKPANE_HTML_TEXT.graphEditorBtn,
    infoReferenceBtn: TASKPANE_HTML_TEXT.infoReferenceBtn,
    loginStatusLabel: TASKPANE_HTML_TEXT.loginStatusLabel,
    userInfoLabel: "",
    accountDockLabel: "",
    logoutDockBtn: TASKPANE_HTML_TEXT.logoutDockBtn,
  },
  generateTemplateConfirmOpen: false,
  operationErrorOpen: false,
  operationErrorMessage: "",
};

function renderTaskpane() {
  if (!taskpaneRoot) return;
  if (!TaskpaneAppComponent) {
    void ensureTaskpaneAppLoaded().then(() => {
      renderTaskpane();
    });
    return;
  }
  taskpaneViewState.currentUser = currentUser;
  taskpaneViewState.isResetPasswordMode = isResetPasswordMode;
  taskpaneViewState.isAccountDockExpanded = isAccountDockExpanded;
  taskpaneRoot.render(
    React.createElement(TaskpaneAppComponent, {
      state: taskpaneViewState,
      handlers: {
        onUsernameChange: (value: string) => {
          taskpaneViewState.inputValues.usernameInput = value;
          renderTaskpane();
        },
        onPasswordChange: (value: string) => {
          taskpaneViewState.inputValues.passwordInput = value;
          renderTaskpane();
        },
        onNewPasswordChange: (value: string) => {
          taskpaneViewState.inputValues.newPasswordInput = value;
          renderTaskpane();
        },
        onLoginClick: (): void => void handleLoginClick(),
        onResetPasswordClick: (): void => void handleResetPasswordClick(),
        onCancelResetPasswordClick: handleCancelResetPasswordClick,
        onConfirmResetPasswordClick: (): void => void handleConfirmResetPasswordClick(),
        onAddDeviceClick: (): void => void runGuarded(() => withLoginGuard(() => openDialog())),
        onModifyDeviceClick: (): void => toggleModifyDeviceDrawer(),
        onModifyDeviceLegacyClick: (): void =>
          void runGuardedWithModal(async () => {
            ensureLoggedInOrThrow();
            const devCraftController = await getDevCraftController();
            await devCraftController.openDevModifyDialog();
            toggleModifyDeviceDrawer(false);
          }),
        onModifyDeviceNewClick: (): void =>
          void runGuardedWithModal(async () => {
            ensureLoggedInOrThrow();
            const devCraftController = await getDevCraftController();
            await devCraftController.openDevModifyDialogV2();
            toggleModifyDeviceDrawer(false);
          }),
        onGenerateSheetClick: (): void =>
          void runGuarded(() => withLoginGuard(() => handleGenerateSheetClick())),
        onQueryPriceClick: (): void =>
          void runGuarded(() => withLoginGuard(() => openQueryPriceDialog())),
        onGraphEditorClick: (): void =>
          void runGuarded(() => withLoginGuard(() => openGraphEditorDialog())),
        onInfoReferenceClick: (): void =>
          void runGuarded(() => withLoginGuard(() => openInfoReferenceDialog())),
        onGenerateQuoteClick: (): void =>
          void runGuarded(() => withLoginGuard(() => handleGenerateQuoteClick())),
        onGenerateSimpleQuoteClick: (): void =>
          void runGuarded(() => withLoginGuard(() => handleGenerateSimpleTemplateClick())),
        onGenerateDetailQuoteClick: (): void =>
          void runGuarded(() => withLoginGuard(() => handleGenerateDetailTemplateClick())),
        onAccountDockToggle: handleAccountDockToggle,
        onConfirmGenerateTemplateOk: () => resolveGenerateTemplateConfirm(true),
        onConfirmGenerateTemplateCancel: () => resolveGenerateTemplateConfirm(false),
        onOperationErrorOk: resolveOperationErrorModal,
      },
    })
  );
}

function resolveGenerateTemplateConfirm(value: boolean) {
  taskpaneViewState.generateTemplateConfirmOpen = false;
  const resolver = generateTemplateConfirmResolver;
  generateTemplateConfirmResolver = null;
  renderTaskpane();
  resolver?.(value);
}

function resolveOperationErrorModal() {
  taskpaneViewState.operationErrorOpen = false;
  const resolver = operationErrorResolver;
  operationErrorResolver = null;
  renderTaskpane();
  resolver?.();
}

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

type GraphEditorDialogPayload = {
  cache: any | null;
  graph: WorkbookGraphPayload | null;
  quoteProductNames: string[];
  libraryEntries: GraphProductLibraryEntry[];
};

Office.onReady((info) => {
  const rootEl = document.getElementById("root");
  if (rootEl && !taskpaneRoot) {
    taskpaneRoot = createRoot(rootEl);
  }
  if (info.host === Office.HostType.Excel) {
    taskpaneViewState.isExcelReady = true;
    applyStaticText();
    restoreAuthState();
    void refreshLoginStatus();
    warmUpDialogResources();
  }
  renderTaskpane();
});

function applyStaticText() {
  setText("loginBtn", TASKPANE_HTML_TEXT.loginBtn);
  setText("addDeviceBtn", TASKPANE_HTML_TEXT.addDeviceBtn);
  setText("resetPasswordBtn", TASKPANE_HTML_TEXT.resetPasswordBtn);
  setText("cancelResetPasswordBtn", TASKPANE_HTML_TEXT.cancelResetPasswordBtn);
  setText("confirmResetPasswordBtn", TASKPANE_HTML_TEXT.confirmResetPasswordBtn);
  setText("modifyDeviceBtn", TASKPANE_HTML_TEXT.modifyDeviceBtn);
  setText("modifyDeviceLegacyBtn", "旧版");
  setText("modifyDeviceNewBtn", "新版");
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
  renderTaskpane();
}

function setText(id: string, text: string) {
  taskpaneViewState.texts[id] = text;
  renderTaskpane();
}

function setButtonDisabled(id: string, disabled: boolean) {
  taskpaneViewState.buttonDisabled[id] = disabled;
  renderTaskpane();
}

function toggleHidden(id: string, hidden: boolean) {
  void id;
  void hidden;
}

function setAuthFeedback(message: string, kind: "error" | "success" | "pending" | "" = "") {
  taskpaneViewState.authFeedback = message;
  taskpaneViewState.authFeedbackKind = kind;
  renderTaskpane();
}

function setActionFeedback(message: string, kind: "error" | "success" | "pending" | "" = "") {
  taskpaneViewState.actionFeedback = message;
  taskpaneViewState.actionFeedbackKind = kind;
  renderTaskpane();
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
  taskpaneViewState.isAccountDockExpanded = expanded;
  renderTaskpane();
}

function getTrimmedInputValue(id: string) {
  return String(taskpaneViewState.inputValues[id] || "").trim();
}

function getRawInputValue(id: string) {
  return String(taskpaneViewState.inputValues[id] || "");
}

function setInputValue(id: string, value: string) {
  taskpaneViewState.inputValues[id] = value;
  renderTaskpane();
}

function setInputDisabled(id: string, disabled: boolean) {
  taskpaneViewState.inputDisabled[id] = disabled;
  renderTaskpane();
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
    console.error(`${TASKPANE_LOG_TEXT.runFailed}:`, error);
  }
}

function openDialog(url?: string) {
  const dialogPath = url || DIALOG_PATHS.main;
  const dialogUrl = new URL(dialogPath, window.location.origin).toString();
  const start = performance.now();
  const isOfficeOnline = Office.context.platform === Office.PlatformType.OfficeOnline;
  const dialogSize =
    dialogPath === DIALOG_PATHS.generateQuote ? DIALOG_SIZES.generateQuote : DIALOG_SIZES.main;
  Office.context.ui.displayDialogAsync(
    dialogUrl,
    { ...dialogSize, displayInIframe: isOfficeOnline },
    (result) => {
      const elapsedMs = Math.round(performance.now() - start);
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        console.log(
          `${TASKPANE_LOG_TEXT.dialogOpenedPrefix} ${elapsedMs}${TASKPANE_LOG_TEXT.dialogOpenedSuffix}`
        );
        const dialog = result.value;
        dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (args) => {
          dialog.close();
          let data: any = null;
          try {
            const dialogMessage = "message" in args ? args.message : "";
            data = JSON.parse(dialogMessage);
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
            const dialogDataModule = await getDialogDataModule();
            await retryExcelInternalError(() => dialogDataModule.handleDialogData(data));
          } catch (error: any) {
            const message = error?.message || String(error);
            console.error("写入报价配置表失败", error);
            setAuthFeedback(`写入报价配置表失败：${message}`, "error");
          }
        });
      } else {
        const errorMessage = result.error?.message || "打开窗口失败";
        notifyVisibleError(errorMessage);
        console.error(
          `${TASKPANE_LOG_TEXT.dialogOpenFailedPrefix} ${elapsedMs}${TASKPANE_LOG_TEXT.dialogOpenFailedSuffix}`,
          errorMessage
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
  await openQueryPriceDialogLazy();
}

async function handleGenerateSheetClick() {
  const confirmed = await showGenerateTemplateConfirm();
  if (!confirmed) {
    return;
  }
  clearTemplateCachesBeforeGenerate();
  await createQuotationSheetLazy();
}

function toggleGenerateTemplateDrawer(forceOpen?: boolean) {
  const willOpen =
    typeof forceOpen === "boolean" ? forceOpen : !taskpaneViewState.isGenerateTemplateDrawerOpen;
  taskpaneViewState.isGenerateTemplateDrawerOpen = willOpen;
  if (willOpen) {
    taskpaneViewState.isModifyDeviceDrawerOpen = false;
  }
  renderTaskpane();
}

function toggleModifyDeviceDrawer(forceOpen?: boolean) {
  const willOpen =
    typeof forceOpen === "boolean" ? forceOpen : !taskpaneViewState.isModifyDeviceDrawerOpen;
  taskpaneViewState.isModifyDeviceDrawerOpen = willOpen;
  if (willOpen) {
    taskpaneViewState.isGenerateTemplateDrawerOpen = false;
  }
  renderTaskpane();
}

async function handleGenerateSimpleTemplateClick() {
  await executeGenerateQuoteFlow("preliminary");
  toggleGenerateTemplateDrawer(false);
}

async function handleGenerateDetailTemplateClick() {
  await executeGenerateQuoteFlow("detail");
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
  return new Promise((resolve) => {
    generateTemplateConfirmResolver = resolve;
    taskpaneViewState.generateTemplateConfirmOpen = true;
    renderTaskpane();
  });
}

function showOperationErrorModal(message: string): Promise<void> {
  return new Promise((resolve) => {
    operationErrorResolver = resolve;
    taskpaneViewState.operationErrorMessage = String(message || "操作失败，请稍后重试。");
    taskpaneViewState.operationErrorOpen = true;
    renderTaskpane();
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
      .find(
        (name) =>
          name === SHEET_NAMES.quoteConfig || name === "配置报价表" || name.includes("报价配置")
      );
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
    void handleGraphEditorDialogMessage(dialog, args);
  });
  await pushGraphEditorPayloadToDialog(dialog);
}

async function handleGraphEditorDialogMessage(dialog: Office.Dialog, args: any) {
  try {
    const payload = JSON.parse(String(args?.message || "{}"));
    if (payload?.type === GRAPH_EDITOR_REQUEST_MSG) {
      await pushGraphEditorPayloadToDialog(dialog);
      return;
    }
    if (payload?.type === GRAPH_EDITOR_SAVE_REQUEST_MSG) {
      await handleGraphEditorSaveRequest(dialog, payload);
    }
  } catch {
    // ignore malformed dialog messages
  }
}

async function buildGraphEditorDialogPayload(): Promise<GraphEditorDialogPayload> {
  const workbookStore = await getWorkbookStoreModule();
  let cache: unknown = null;
  try {
    const raw = localStorage.getItem(GRAPH_STORE_DEV_CACHE_KEY);
    cache = raw ? JSON.parse(raw) : null;
  } catch {
    // ignore storage read or parse failure
  }
  const graph = await workbookStore.loadGraphFromWorkbook().catch((): null => null);
  const quoteProductNames = await workbookStore.loadQuoteConfigProductsFromWorkbook().catch((): string[] => []);
  const libraryEntries = await workbookStore.loadGraphProductLibraryEntries().catch((): import("../graph-editor/workbookStore").GraphProductLibraryEntry[] => []);
  return {
    cache,
    graph,
    quoteProductNames,
    libraryEntries,
  };
}

async function pushGraphEditorPayloadToDialog(dialog: Office.Dialog) {
  const payload = await buildGraphEditorDialogPayload();
  (dialog as any).messageChild(
    JSON.stringify({
      type: GRAPH_EDITOR_TEMPLATES_MSG,
      data: payload,
    })
  );
}

async function handleGraphEditorSaveRequest(dialog: Office.Dialog, payload: any) {
  const requestId = String(payload?.requestId || "").trim();
  let ok = false;
  let message = "";
  try {
    const workbookPayload = (payload?.payload || {}) as WorkbookGraphPayload;
    const workbookStore = await getWorkbookStoreModule();
    await workbookStore.saveGraphToWorkbook(workbookPayload);
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

async function executeGenerateQuoteFlow(mode: "detail" | "preliminary" = "detail") {
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

function isConfigHeaderRow(row: unknown[]) {
  const aText = String(row?.[0] ?? "").trim();
  const bText = String(row?.[1] ?? "").trim();
  return (
    aText === String(BUILDSHEET_TEXT.configHeaders?.[0] || "").trim() &&
    bText === String(BUILDSHEET_TEXT.configHeaders?.[1] || "").trim()
  );
}

type QuoteSummaryChildRow = {
  serial: string;
  name: string;
  quantity: number;
  cost: number;
  price: number;
  ratio: number;
  remark: string;
};

type QuoteSummarySectionRow = {
  serial: string;
  name: string;
  children: QuoteSummaryChildRow[];
  quantity: number;
  cost: number;
  price: number;
  ratio: number;
};

type QuotePreviewMergeCell = {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
};

function roundRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 10) / 10;
}

function toChineseSectionOrdinal(value: number): string {
  const map = [
    "",
    "一",
    "二",
    "三",
    "四",
    "五",
    "六",
    "七",
    "八",
    "九",
    "十",
    "十一",
    "十二",
    "十三",
    "十四",
    "十五",
  ];
  return map[value] || String(value);
}

function buildQuoteSummarySections(configValues: unknown[][]): QuoteSummarySectionRow[] {
  const sections: QuoteSummarySectionRow[] = [];
  let currentSection: QuoteSummarySectionRow | null = null;
  let sectionIndex = 0;

  configValues.forEach((row) => {
    const aText = String(row?.[0] ?? "").trim();
    const bText = String(row?.[1] ?? "").trim();

    if (isConfigSectionTitleRow(aText, bText)) {
      if (currentSection) {
        currentSection.quantity = currentSection.children.reduce(
          (sum, item) => sum + item.quantity,
          0
        );
        currentSection.cost = currentSection.children.reduce((sum, item) => sum + item.cost, 0);
        currentSection.price = currentSection.children.reduce((sum, item) => sum + item.price, 0);
        currentSection.ratio =
          currentSection.cost > 0 ? roundRatio(currentSection.price / currentSection.cost) : 0;
      }
      sectionIndex += 1;
      currentSection = {
        serial: toChineseSectionOrdinal(sectionIndex),
        name: bText,
        children: [],
        quantity: 0,
        cost: 0,
        price: 0,
        ratio: 0,
      };
      sections.push(currentSection);
      return;
    }

    if (!currentSection || isConfigHeaderRow(row)) {
      return;
    }

    const deviceName = bText;
    if (!deviceName) {
      return;
    }

    currentSection.children.push({
      serial: `${sectionIndex}.${currentSection.children.length + 1}`,
      name: deviceName,
      quantity: parseCellNumber(row?.[9]),
      cost: parseCellNumber(row?.[13]),
      price: parseCellNumber(row?.[15]),
      ratio: roundRatio(parseCellNumber(row?.[16])),
      remark: String(row?.[17] ?? "").trim(),
    });
  });

  if (currentSection) {
    currentSection.quantity = currentSection.children.reduce((sum, item) => sum + item.quantity, 0);
    currentSection.cost = currentSection.children.reduce((sum, item) => sum + item.cost, 0);
    currentSection.price = currentSection.children.reduce((sum, item) => sum + item.price, 0);
    currentSection.ratio =
      currentSection.cost > 0 ? roundRatio(currentSection.price / currentSection.cost) : 0;
  }

  return sections;
}

function buildQuoteSummaryDisplayRows(sections: QuoteSummarySectionRow[]) {
  const rows: Array<{
    level: "section" | "child";
    values: (string | number)[][];
  }> = [];

  sections.forEach((section) => {
    rows.push({
      level: "section",
      values: [
        [
          section.serial,
          section.name,
          "",
          1,
          section.cost ? Math.round(section.cost) : "",
          section.price ? Math.round(section.price) : "",
          section.ratio ? section.ratio : "",
          "",
        ],
      ],
    });

    section.children.forEach((child) => {
      rows.push({
        level: "child",
        values: [
          [
            child.serial,
            `    ${child.name}`,
            "",
            child.quantity ? Math.round(child.quantity) : "",
            child.cost ? Math.round(child.cost) : "",
            child.price ? Math.round(child.price) : "",
            child.ratio ? child.ratio : "",
            child.remark,
          ],
        ],
      });
    });
  });

  return rows;
}

function buildQuoteSummaryMergeCells(
  dataStartRow: number,
  displayRowCount: number,
  totalRow: number,
  notesStartRow: number,
  notesEndRow: number
): QuotePreviewMergeCell[] {
  const merges: QuotePreviewMergeCell[] = [
    { row: 1, col: 1, rowspan: 1, colspan: 8 },
    { row: 2, col: 1, rowspan: 1, colspan: 2 },
    { row: 2, col: 3, rowspan: 1, colspan: 6 },
    { row: 3, col: 1, rowspan: 1, colspan: 2 },
    { row: 3, col: 3, rowspan: 1, colspan: 3 },
    { row: 3, col: 6, rowspan: 1, colspan: 2 },
    { row: 4, col: 1, rowspan: 1, colspan: 2 },
    { row: 4, col: 3, rowspan: 1, colspan: 3 },
    { row: 4, col: 6, rowspan: 1, colspan: 2 },
    { row: 5, col: 1, rowspan: 1, colspan: 2 },
    { row: 5, col: 3, rowspan: 1, colspan: 3 },
    { row: 5, col: 6, rowspan: 1, colspan: 2 },
    { row: 6, col: 1, rowspan: 1, colspan: 2 },
    { row: 6, col: 3, rowspan: 1, colspan: 3 },
    { row: 6, col: 6, rowspan: 1, colspan: 2 },
    { row: 7, col: 1, rowspan: 1, colspan: 8 },
    { row: 8, col: 2, rowspan: 1, colspan: 2 },
    { row: totalRow, col: 1, rowspan: 1, colspan: 4 },
  ];

  for (let i = 0; i < displayRowCount; i += 1) {
    merges.push({ row: dataStartRow + i, col: 2, rowspan: 1, colspan: 2 });
  }

  if (notesEndRow >= notesStartRow) {
    merges.push({
      row: notesStartRow,
      col: 1,
      rowspan: notesEndRow - notesStartRow + 1,
      colspan: 2,
    });
    for (let row = notesStartRow; row <= notesEndRow; row += 1) {
      merges.push({ row, col: 3, rowspan: 1, colspan: 6 });
    }
  }

  return merges;
}

function formatCurrencyLikeText(value: unknown): string {
  const num = parseCellNumber(value);
  if (!num) return "";
  return `¥${Math.round(num).toLocaleString("zh-CN")}`;
}

function buildPreviewPdfFileName(
  customerMatrix: unknown[][] | null | undefined,
  mode: "detail" | "preliminary"
) {
  const customerRow = Array.isArray(customerMatrix?.[1]) ? customerMatrix[1] : [];
  const customerName = (customerRow || [])
    .map((cell) => String(cell || "").trim())
    .find((cell) => cell && cell !== "客户名称:");
  const sheetTitle = mode === "detail" ? "报价配置表" : "报价汇总表";
  return customerName ? `${sheetTitle}（${customerName}）.pdf` : `${sheetTitle}.pdf`;
}

function isQuoteConfigDetailHeaderRow(row: unknown[]) {
  const expected = BUILDSHEET_TEXT.configHeaders || [];
  return (
    String(row?.[0] ?? "").trim() === String(expected[0] || "").trim() &&
    String(row?.[1] ?? "").trim() === String(expected[1] || "").trim() &&
    String(row?.[2] ?? "").trim() === String(expected[2] || "").trim()
  );
}

function isQuoteConfigDetailSectionRow(row: unknown[]) {
  const aText = String(row?.[0] ?? "").trim();
  const bText = String(row?.[1] ?? "").trim();
  return !!aText && !!bText && CHINESE_ORDINAL_REGEX.test(aText);
}

function hasAnyConfigRowContent(row: unknown[]) {
  return Array.isArray(row) && row.some((cell) => String(cell ?? "").trim().length > 0);
}

function getLastMeaningfulConfigRowIndex(values: unknown[][]) {
  for (let i = (values || []).length - 1; i >= 0; i -= 1) {
    if (hasAnyConfigRowContent(values[i])) {
      return i;
    }
  }
  return -1;
}

function mapOriginalConfigColToDetailPreviewCol(originalCol: number, removedCols: Set<number>) {
  if (removedCols.has(originalCol)) return 0;
  let nextCol = originalCol;
  removedCols.forEach((removedCol) => {
    if (removedCol < originalCol) {
      nextCol -= 1;
    }
  });
  return nextCol;
}

function buildDetailQuotePreviewMerges(values: string[][], removedCols: Set<number>) {
  const merges: QuotePreviewMergeCell[] = [];
  const verticalMergeCols = [1, 2, 10, 11, 15, 16, 18];

  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const isSection = isQuoteConfigDetailSectionRow(row);
    const isHeader = isQuoteConfigDetailHeaderRow(row);

    if (isSection) {
      const startCol = mapOriginalConfigColToDetailPreviewCol(2, removedCols);
      const endCol = mapOriginalConfigColToDetailPreviewCol(11, removedCols);
      if (startCol > 0 && endCol >= startCol) {
        merges.push({
          row: rowIndex + 1,
          col: startCol,
          rowspan: 1,
          colspan: endCol - startCol + 1,
        });
      }
      continue;
    }

    if (isHeader) continue;

    verticalMergeCols.forEach((originalCol) => {
      const previewCol = mapOriginalConfigColToDetailPreviewCol(originalCol, removedCols);
      if (!previewCol) return;
      const cellValue = String(row[originalCol - 1] || "").trim();
      if (!cellValue) return;

      let rowspan = 1;
      for (let nextRowIndex = rowIndex + 1; nextRowIndex < values.length; nextRowIndex += 1) {
        const nextRow = values[nextRowIndex] || [];
        if (isQuoteConfigDetailSectionRow(nextRow) || isQuoteConfigDetailHeaderRow(nextRow)) break;
        if (String(nextRow[originalCol - 1] || "").trim()) break;
        rowspan += 1;
      }

      if (rowspan > 1) {
        merges.push({
          row: rowIndex + 1,
          col: previewCol,
          rowspan,
          colspan: 1,
        });
      }
    });
  }

  return merges;
}

function buildDetailQuotePreviewPayload(
  values: unknown[][],
  rowHeights: number[],
  colWidths: number[],
  alignments: string[][]
) {
  const removedCols = new Set([12, 13, 14, 17]); // L/M/N/Q
  const keptIndexes = Array.from({ length: 18 }, (_, idx) => idx).filter(
    (idx) => !removedCols.has(idx + 1)
  );
  const lastMeaningfulIndex = getLastMeaningfulConfigRowIndex(values);
  const trimmedValues = (values || [])
    .slice(0, lastMeaningfulIndex + 1)
    .map((row) => Array.from({ length: 18 }, (_, idx) => String(row?.[idx] ?? "")));
  const renderedRows = trimmedValues.map((row) => keptIndexes.map((idx) => String(row[idx] ?? "")));
  const merges = buildDetailQuotePreviewMerges(trimmedValues, removedCols);

  return {
    quoteSheetGrid: renderedRows,
    quoteSheetLayout: {
      rowHeights: rowHeights.slice(0, renderedRows.length),
      colWidths: keptIndexes.map((idx) => Number(colWidths[idx] || 0)),
      merges,
    },
    cellAlignments: alignments
      .slice(0, renderedRows.length)
      .map((row) => keptIndexes.map((idx) => String(row?.[idx] || ""))),
    totalPriceText: "",
    generatedAt: new Date().toISOString(),
    quotePreviewMode: "detail" as const,
  };
}

async function syncQuoteSummaryAndCachePreview(mode: "detail" | "preliminary" = "detail") {
  const payload = await Excel.run(async (context) => {
    const quoteConfigSheet = context.workbook.worksheets.getItemOrNullObject(
      SHEET_NAMES.quoteConfig
    );
    const quoteSummarySheet = context.workbook.worksheets.getItemOrNullObject(
      SHEET_NAMES.quoteSummary
    );

    // 把 sheet 存在性检查、客户信息、配置表数据全部挂在同一批 load，一次 sync 取回
    quoteConfigSheet.load("name,isNullObject");
    quoteSummarySheet.load("name,isNullObject");
    const summaryCustomerRange = quoteSummarySheet.getRange("A1:H6");
    summaryCustomerRange.load(["values", "text"]);
    const configUsedRange = quoteConfigSheet.getRange("A:P").getUsedRangeOrNullObject(false);
    configUsedRange.load(["values", "isNullObject"]);
    const summaryUsedRange = quoteSummarySheet.getUsedRangeOrNullObject(false);
    summaryUsedRange.load(["rowCount", "isNullObject"]);
    await context.sync(); // sync 1：取回所有基础信息

    if (quoteConfigSheet.isNullObject) {
      throw new Error("报价配置表不存在，请先生成并填写报价配置表。");
    }
    if (mode !== "detail" && quoteSummarySheet.isNullObject) {
      throw new Error("报价汇总表不存在，请先生成报价模板。");
    }
    if (configUsedRange.isNullObject) {
      throw new Error("报价配置表为空，无法生成报价。");
    }

    const summaryCustomerMatrix: unknown[][] = quoteSummarySheet.isNullObject
      ? []
      : (((summaryCustomerRange as any).text ||
          summaryCustomerRange.values ||
          []) as unknown[][]);

    const configValues = configUsedRange.values || [];

    if (mode === "detail") {
      // 用整块 Range 替代逐行逐格 load，大幅减少 Range 对象数量
      const rowCount = Math.max(1, Number(configValues.length || 0));
      const detailPreviewRange = quoteConfigSheet.getRange("A:R").getUsedRangeOrNullObject(false);
      detailPreviewRange.load(["values", "rowCount", "isNullObject"]);

      // 对齐方式：整块读取，而非 N×18 个独立 Cell
      const detailAlignmentRange = quoteConfigSheet.getRange(`A1:R${rowCount}`);
      detailAlignmentRange.load("format/horizontalAlignment");

      // 行高：整列行范围一次读取
      const rowHeightRange = quoteConfigSheet.getRange(`1:${rowCount}`);
      rowHeightRange.load("format/rowHeight");

      // 列宽：整行列范围一次读取（A:R = 18列）
      const colWidthRange = quoteConfigSheet.getRange("A:R");
      colWidthRange.load("format/columnWidth");

      await context.sync(); // sync 2：取回所有格式数据

      if (detailPreviewRange.isNullObject) {
        throw new Error("报价配置表为空，无法生成明细报价。");
      }

      const detailValues = detailPreviewRange.values || [];

      // horizontalAlignment 在 range-level 可能返回单一值或二维数组，做兼容处理
      const rawAlignment = (detailAlignmentRange.format as any).horizontalAlignment;
      const detailAlignments: string[][] = Array.isArray(rawAlignment)
        ? (rawAlignment as unknown[][])
            .slice(0, detailValues.length)
            .map((row) =>
              Array.isArray(row) ? row.map((v) => String(v || "")) : Array(18).fill("")
            )
        : Array.from({ length: detailValues.length }, () => Array(18).fill(String(rawAlignment || "")));

      // rowHeight 在 range-level 可能返回单一值或数组，做兼容处理
      const rawRowHeight = (rowHeightRange.format as any).rowHeight;
      const detailRowHeights: number[] = Array.isArray(rawRowHeight)
        ? (rawRowHeight as unknown[]).slice(0, detailValues.length).map((v) => Number(v || 0))
        : Array.from({ length: detailValues.length }, () => Number(rawRowHeight || 0));

      // columnWidth 同理
      const rawColWidth = (colWidthRange.format as any).columnWidth;
      const detailColWidths: number[] = Array.isArray(rawColWidth)
        ? (rawColWidth as unknown[]).slice(0, 18).map((v) => Number(v || 0))
        : Array(18).fill(Number(rawColWidth || 0));

      const detailPayload = buildDetailQuotePreviewPayload(
        detailValues,
        detailRowHeights,
        detailColWidths,
        detailAlignments
      ) as any;
      detailPayload.pdfFileName = buildPreviewPdfFileName(summaryCustomerMatrix, "detail");
      return detailPayload;
    }

    const summarySections = buildQuoteSummarySections(configValues);
    const displayRows = buildQuoteSummaryDisplayRows(summarySections);
    const dataStartRow = 9;
    const dataEndRow = dataStartRow + Math.max(displayRows.length - 1, 0);
    const totalRow = dataEndRow + 1;
    const notesStartRow = totalRow + 1;
    const notes = BUILDSHEET_TEXT.quoteNotes || [];
    const notesEndRow = notesStartRow + Math.max(notes.length - 1, 0);
    const usedRowCount = summaryUsedRange.isNullObject ? 0 : Number(summaryUsedRange.rowCount || 0);
    const clearEndRow = Math.max(usedRowCount, notesEndRow, 29);

    const bodyRange = quoteSummarySheet.getRange(`A8:H${clearEndRow}`);
    bodyRange.unmerge();
    bodyRange.clear();

    quoteSummarySheet.getRange("A8:H8").values = [BUILDSHEET_TEXT.quoteHeader];
    quoteSummarySheet.getRange("A8:H8").format.font.bold = true;
    quoteSummarySheet.getRange("A8:H8").format.horizontalAlignment = "Center";
    quoteSummarySheet.getRange("A8:H8").format.verticalAlignment = "Center";
    quoteSummarySheet.getRange("B8:C8").merge();

    // 把 section 行和普通行分组，各自批量设置格式，减少 Range 对象创建次数
    const sectionRows: number[] = [];
    const normalRows: number[] = [];
    displayRows.forEach((item, index) => {
      const rowNum = dataStartRow + index;
      quoteSummarySheet.getRange(`A${rowNum}:H${rowNum}`).values = item.values;
      quoteSummarySheet.getRange(`B${rowNum}:C${rowNum}`).merge();
      if (item.level === "section") {
        sectionRows.push(rowNum);
      } else {
        normalRows.push(rowNum);
      }
    });

    // 逐行对齐仍需保留（B:C 列对齐方式按行不同），但颜色/粗体批量处理
    displayRows.forEach((item, index) => {
      const rowNum = dataStartRow + index;
      quoteSummarySheet.getRange(`A${rowNum}`).format.horizontalAlignment = "Center";
      quoteSummarySheet.getRange(`B${rowNum}:C${rowNum}`).format.horizontalAlignment =
        item.level === "section" ? "Left" : "Center";
      quoteSummarySheet.getRange(`D${rowNum}:G${rowNum}`).format.horizontalAlignment = "Center";
      quoteSummarySheet.getRange(`H${rowNum}`).format.horizontalAlignment = "Left";
    });

    // 批量设置 section 行样式
    sectionRows.forEach((rowNum) => {
      const r = quoteSummarySheet.getRange(`A${rowNum}:H${rowNum}`);
      r.format.fill.color = "#16a6dc";
      r.format.font.bold = true;
      r.format.font.color = "#ffffff";
    });
    // 批量设置普通行样式
    normalRows.forEach((rowNum) => {
      quoteSummarySheet.getRange(`A${rowNum}:H${rowNum}`).format.fill.color = "#f3f3f3";
    });

    const totalCost = summarySections.reduce((sum, item) => sum + item.cost, 0);
    const totalPrice = summarySections.reduce((sum, item) => sum + item.price, 0);
    const totalRatio = totalCost > 0 ? roundRatio(totalPrice / totalCost) : 0;

    quoteSummarySheet.getRange(`A${totalRow}:D${totalRow}`).merge();
    quoteSummarySheet.getRange(`A${totalRow}`).values = [[BUILDSHEET_TEXT.totalLabel]];
    quoteSummarySheet.getRange(`E${totalRow}`).values = [[totalCost ? Math.round(totalCost) : ""]];
    quoteSummarySheet.getRange(`F${totalRow}`).values = [
      [totalPrice ? Math.round(totalPrice) : ""],
    ];
    quoteSummarySheet.getRange(`G${totalRow}`).values = [[totalRatio ? totalRatio : ""]];
    quoteSummarySheet.getRange(`H${totalRow}`).values = [[""]];
    quoteSummarySheet.getRange(`A${totalRow}:H${totalRow}`).format.font.bold = true;
    quoteSummarySheet.getRange(`A${totalRow}:H${totalRow}`).format.horizontalAlignment = "Center";

    if (notes.length > 0) {
      quoteSummarySheet.getRange(`A${notesStartRow}:B${notesEndRow}`).merge();
      quoteSummarySheet.getRange(`A${notesStartRow}`).values = [[BUILDSHEET_TEXT.remarkLabel]];
      quoteSummarySheet.getRange(`A${notesStartRow}`).format.horizontalAlignment = "Center";
      quoteSummarySheet.getRange(`A${notesStartRow}`).format.verticalAlignment = "Center";

      notes.forEach((text, idx) => {
        const rowNum = notesStartRow + idx;
        quoteSummarySheet.getRange(`C${rowNum}:H${rowNum}`).merge();
        quoteSummarySheet.getRange(`C${rowNum}`).values = [[text]];
      });
      quoteSummarySheet.getRange(`C${notesStartRow}:H${notesEndRow}`).format.wrapText = true;
      quoteSummarySheet.getRange(`C${notesStartRow}:H${notesEndRow}`).format.verticalAlignment =
        "Center";
    }

    const activeRange = quoteSummarySheet.getRange(`A8:H${notesEndRow}`);
    activeRange.format.font.name = "Microsoft YaHei";
    activeRange.format.font.size = 11;
    activeRange.format.borders.getItem("InsideHorizontal").style = "Continuous";
    activeRange.format.borders.getItem("InsideVertical").style = "Continuous";
    activeRange.format.borders.getItem("EdgeTop").style = "Continuous";
    activeRange.format.borders.getItem("EdgeBottom").style = "Continuous";
    activeRange.format.borders.getItem("EdgeLeft").style = "Continuous";
    activeRange.format.borders.getItem("EdgeRight").style = "Continuous";
    const summaryValueRowCount = Math.max(totalRow - dataStartRow + 1, 1);
    quoteSummarySheet.getRange(`D${dataStartRow}:F${totalRow}`).numberFormat = Array.from(
      { length: summaryValueRowCount },
      () => ["#,##0", "#,##0", "#,##0"]
    );
    quoteSummarySheet.getRange(`G${dataStartRow}:G${totalRow}`).numberFormat = Array.from(
      { length: summaryValueRowCount },
      () => ["0.0"]
    );

    // 行高：整行范围一次读取；列宽：整列范围一次读取
    const fullPreviewRange = quoteSummarySheet.getRange(`A1:H${notesEndRow}`);
    fullPreviewRange.load(["values", "text"]);
    const rowHeightRange = quoteSummarySheet.getRange(`1:${notesEndRow}`);
    rowHeightRange.load("format/rowHeight");
    const colWidthRange = quoteSummarySheet.getRange("A:H");
    colWidthRange.load("format/columnWidth");
    await context.sync(); // sync 2：写入完成后读取预览数据

    // 兼容 range-level 属性返回单一值或数组两种情况
    const rawRowHeight = (rowHeightRange.format as any).rowHeight;
    const rowHeights: number[] = Array.isArray(rawRowHeight)
      ? (rawRowHeight as unknown[]).slice(0, notesEndRow).map((v) => Number(v || 0))
      : Array.from({ length: notesEndRow }, () => Number(rawRowHeight || 0));

    const rawColWidth = (colWidthRange.format as any).columnWidth;
    const colWidths: number[] = Array.isArray(rawColWidth)
      ? (rawColWidth as unknown[]).slice(0, 8).map((v) => Number(v || 0))
      : Array(8).fill(Number(rawColWidth || 0));

    const mergeCells = buildQuoteSummaryMergeCells(
      dataStartRow,
      displayRows.length,
      totalRow,
      notesStartRow,
      notesEndRow
    );

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
      totalPriceText: formatCurrencyLikeText(totalPrice),
      generatedAt: new Date().toISOString(),
      quotePreviewMode: mode,
      pdfFileName: buildPreviewPdfFileName(summaryCustomerMatrix, mode),
    };
    return mode === "preliminary" ? toPreliminaryPreviewPayload(basePayload as any) : basePayload;
  });

  try {
    localStorage.setItem(QUOTE_PREVIEW_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage write failure (quota exceeded or private mode)
  }
}

function toPreliminaryPreviewPayload(payload: {
  quoteSheetGrid: string[][];
  quoteSheetLayout: {
    rowHeights?: number[];
    colWidths?: number[];
    merges?: Array<{ row: number; col: number; rowspan: number; colspan: number }>;
  };
  totalPriceText: string;
  generatedAt: string;
  quotePreviewMode: "detail" | "preliminary";
}) {
  const keptIdx = [0, 1, 2, 3, 5, 7];
  const removedCols = new Set([5, 7]); // 1-based: E(成本), G(系数)
  const remCount = (col: number) => {
    let n = 0;
    removedCols.forEach((x) => {
      if (x <= col) n += 1;
    });
    return n;
  };

  const nextGrid = (payload.quoteSheetGrid || []).map((row) =>
    keptIdx.map((i) => String(row?.[i] ?? ""))
  );
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

function parseA1MergeAddress(
  address: string
): { row: number; col: number; rowspan: number; colspan: number } | null {
  const normalized = String(address || "").trim();
  if (!normalized) return null;
  const local = normalized.includes("!") ? normalized.split("!").pop() || "" : normalized;
  const firstArea = local.split(",")[0].trim();
  const parts = firstArea.split(":");
  if (parts.length !== 2) return null;
  const start = parseCellRef(parts[0]);
  const end = parseCellRef(parts[1]);
  if (!start || !end) return null;
  if (end.row < 1 || start.col > 7 || end.col < 1) return null;
  const row = Math.max(1, start.row);
  const col = Math.max(1, start.col);
  const endRow = Math.max(row, end.row);
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

    sheet.visibility = Excel.SheetVisibility.hidden;

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
      sheet.getRange("A2").values = [
        ["A列: ENTRY标记；B=保存时间；C=项目；D=元数据JSON；E=图片分块数；F列起=图片分块"],
      ];
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
  const loginText = currentUser
    ? `退出（${currentUser.fullName || currentUser.username}）`
    : TASKPANE_HTML_TEXT.loginBtn;
  setText("loginBtn", loginText);
  setText(
    "loginStatusLabel",
    currentUser ? `已登录：${currentUser.fullName || currentUser.username}` : "未登录"
  );
  setText(
    "userInfoLabel",
    currentUser
      ? `当前用户：${currentUser.fullName || currentUser.username}（${currentUser.username}）`
      : ""
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
