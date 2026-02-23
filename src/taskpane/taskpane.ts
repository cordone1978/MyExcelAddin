import { createQuotationSheet } from "../buildsheet";
import { handleDialogData } from "../dialog/handleDialogData";
import { API_PATHS, APP_URLS, DIALOG_PATHS, DIALOG_SIZES, UI_DEFAULTS } from "../shared/appConstants";
import { createDevCraftController } from "./devCraftController";
import { openQueryPriceDialogController } from "./querypriceController";
import { FLOW_MESSAGES } from "../shared/businessTextConstants";
import { TASKPANE_HTML_TEXT, TASKPANE_LOG_TEXT } from "../shared/dialogHtmlTextConstants";

/* global console, document, Excel, Office */

const devCraftController = createDevCraftController(displayDialog);
let authToken = "";
let currentUser: { username: string; fullName: string } | null = null;
let isResetPasswordMode = false;
let isAccountDockExpanded = false;

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
    (window as any).handleAddDeviceClick = () => withLoginGuard(() => openDialog());
    (window as any).handleModifyDeviceClick = () => withLoginGuard(() => devCraftController.openDevModifyDialog());
    (window as any).handleGenerateSheetClick = () => withLoginGuard(() => createQuotationSheet());
    (window as any).handleGenerateQuoteClick = () => withLoginGuard(() => openDialog("form3.html"));
    (window as any).handleQueryPriceClick = () => withLoginGuard(() => openQueryPriceDialog());
    (window as any).handleAccountDockToggle = handleAccountDockToggle;
    restoreAuthState();
    bindLoginInputEvents();
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
  setText("generateQuoteBtn", TASKPANE_HTML_TEXT.generateQuoteBtn);
  setText("queryPriceBtn", TASKPANE_HTML_TEXT.queryPriceBtn);
  setText("loginStatusLabel", "未登录");
  setText("userInfoLabel", "");
  setText("accountDockLabel", "");
  setText("logoutDockBtn", "退出");
  setAccountDockExpanded(false);
  setResetPasswordMode(false);
  setAuthFeedback("");
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
  if (!el) return;
  el.textContent = message;
  el.className = kind ? `auth-feedback ${kind}` : "auth-feedback";
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
  Office.context.ui.displayDialogAsync(
    dialogUrl,
    { ...DIALOG_SIZES.main, displayInIframe: isOfficeOnline },
    (result) => {
      const elapsedMs = Math.round(performance.now() - start);
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        console.log(`${TASKPANE_LOG_TEXT.dialogOpenedPrefix} ${elapsedMs}${TASKPANE_LOG_TEXT.dialogOpenedSuffix}`);
        const dialog = result.value;
        dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (args) => {
          dialog.close();
          try {
            const data = JSON.parse(args.message);
            await handleDialogData(data);
          } catch (error: any) {
            console.error(FLOW_MESSAGES.dialogParseFailed, error);
          }
        });
      } else {
        console.error(
          `${TASKPANE_LOG_TEXT.dialogOpenFailedPrefix} ${elapsedMs}${TASKPANE_LOG_TEXT.dialogOpenFailedSuffix}`,
          result.error.message
        );
      }
    }
  );
}

async function openQueryPriceDialog() {
  await openQueryPriceDialogController(displayDialog);
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
    setAuthFeedback("请先输入用户名和密码并登录。", "error");
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
