import React from "react";

type FeedbackKind = "error" | "success" | "pending" | "";

export type TaskpaneViewState = {
  isExcelReady: boolean;
  itemSubject: string;
  currentUser: { username: string; fullName: string } | null;
  isResetPasswordMode: boolean;
  isAccountDockExpanded: boolean;
  isGenerateTemplateDrawerOpen: boolean;
  isModifyDeviceDrawerOpen: boolean;
  authFeedback: string;
  authFeedbackKind: FeedbackKind;
  actionFeedback: string;
  actionFeedbackKind: FeedbackKind;
  inputValues: Record<string, string>;
  inputDisabled: Record<string, boolean>;
  buttonDisabled: Record<string, boolean>;
  texts: Record<string, string>;
  generateTemplateConfirmOpen: boolean;
  operationErrorOpen: boolean;
  operationErrorMessage: string;
};

export type TaskpaneViewHandlers = {
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onLoginClick: () => void;
  onResetPasswordClick: () => void;
  onCancelResetPasswordClick: () => void;
  onConfirmResetPasswordClick: () => void;
  onAddDeviceClick: () => void;
  onModifyDeviceClick: () => void;
  onModifyDeviceLegacyClick: () => void;
  onModifyDeviceNewClick: () => void;
  onGenerateSheetClick: () => void;
  onQueryPriceClick: () => void;
  onGraphEditorClick: () => void;
  onInfoReferenceClick: () => void;
  onGenerateQuoteClick: () => void;
  onGenerateSimpleQuoteClick: () => void;
  onGenerateDetailQuoteClick: () => void;
  onAccountDockToggle: () => void;
  onConfirmGenerateTemplateOk: () => void;
  onConfirmGenerateTemplateCancel: () => void;
  onOperationErrorOk: () => void;
};

function feedbackClass(base: string, kind: FeedbackKind) {
  return kind ? `${base} ${kind}` : base;
}

export function TaskpaneApp({
  state,
  handlers,
}: {
  state: TaskpaneViewState;
  handlers: TaskpaneViewHandlers;
}) {
  const loginText = state.currentUser
    ? `退出（${state.currentUser.fullName || state.currentUser.username}）`
    : state.texts.loginBtn;
  const accountDockLabel = state.currentUser ? state.currentUser.fullName || state.currentUser.username : "";
  const showAuthPanel = !state.currentUser;
  const showActionPanel = !!state.currentUser;

  return (
    <div className="app-shell ui-page-shell">
      <header className="ms-welcome__header app-header">
        <img src="../../assets/logo-large.png" alt="报价系统" title="报价系统" />
        <h1 className="app-title">报价系统</h1>
      </header>

      {!state.isExcelReady ? (
        <section id="sideload-msg" className="ms-welcome__main">
          <h2 className="app-subtitle">
            请先
            <a
              target="_blank"
              rel="noreferrer"
              href="https://learn.microsoft.com/office/dev/add-ins/testing/test-debug-office-add-ins#sideload-an-office-add-in-for-testing"
            >
              旁加载
            </a>
            加载项后查看功能界面。
          </h2>
        </section>
      ) : (
        <main id="app-body" className="ms-welcome__main app-main">
          <p className="app-meta">
            <label>{state.itemSubject}</label>
          </p>

          {showAuthPanel ? (
            <section className="panel panel-auth" id="authPanel" aria-labelledby="authPanelTitle">
              <div className="auth-hero">
                <h2 className="panel-title auth-title" id="authPanelTitle">
                  账号登录
                </h2>
                <p className="auth-subtitle">登录后可继续设备配置、报价生成和信息参考。</p>
              </div>

              <div className="field-list">
                <input
                  className="login-input"
                  id="usernameInput"
                  type="text"
                  placeholder="用户名"
                  autoComplete="username"
                  value={state.inputValues.usernameInput || ""}
                  disabled={!!state.inputDisabled.usernameInput}
                  onChange={(e) => handlers.onUsernameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handlers.onLoginClick();
                    }
                  }}
                />
                <input
                  className="login-input"
                  id="passwordInput"
                  type="password"
                  placeholder="密码"
                  autoComplete="current-password"
                  value={state.inputValues.passwordInput || ""}
                  disabled={!!state.inputDisabled.passwordInput}
                  onChange={(e) => handlers.onPasswordChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handlers.onLoginClick();
                    }
                  }}
                />
                <input
                  className={`login-input ${state.isResetPasswordMode ? "" : "is-hidden"}`}
                  id="newPasswordInput"
                  type="password"
                  placeholder="新密码（重置用）"
                  autoComplete="new-password"
                  value={state.inputValues.newPasswordInput || ""}
                  disabled={!!state.inputDisabled.newPasswordInput}
                  onChange={(e) => handlers.onNewPasswordChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handlers.onConfirmResetPasswordClick();
                    }
                  }}
                />
              </div>

              <div className={`reset-password-tip ${state.isResetPasswordMode ? "" : "is-hidden"}`} id="resetPasswordTip" role="note">
                重置密码需要填写“用户名 + 当前密码 + 新密码”，提交后请使用新密码重新登录。
              </div>

              <div className="btn-grid two-cols">
                {!state.isResetPasswordMode ? (
                  <>
                    <button
                      className="ui-btn ui-btn--primary"
                      id="loginBtn"
                      disabled={!!state.buttonDisabled.loginBtn}
                      onClick={handlers.onLoginClick}
                    >
                      {loginText}
                    </button>
                    <button className="ui-btn ui-btn--secondary" id="resetPasswordBtn" onClick={handlers.onResetPasswordClick}>
                      {state.texts.resetPasswordBtn}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="ui-btn ui-btn--secondary" id="cancelResetPasswordBtn" onClick={handlers.onCancelResetPasswordClick}>
                      {state.texts.cancelResetPasswordBtn}
                    </button>
                    <button
                      className="ui-btn ui-btn--primary"
                      id="confirmResetPasswordBtn"
                      disabled={!!state.buttonDisabled.confirmResetPasswordBtn}
                      onClick={handlers.onConfirmResetPasswordClick}
                    >
                      {state.texts.confirmResetPasswordBtn}
                    </button>
                  </>
                )}
              </div>

              <p className={feedbackClass("auth-feedback", state.authFeedbackKind)} id="authFeedbackLabel">
                {state.authFeedback}
              </p>
            </section>
          ) : null}

          {showActionPanel ? (
            <section className="panel panel-actions" id="actionPanel" aria-label="功能区">
              <p className={feedbackClass("action-feedback", state.actionFeedbackKind)} id="actionFeedbackLabel">
                {state.actionFeedback}
              </p>
              <div className="btn-grid">
                <button className="ui-btn ui-btn--secondary" id="addDeviceBtn" onClick={handlers.onAddDeviceClick}>
                  {state.texts.addDeviceBtn}
                </button>
                <button className="ui-btn ui-btn--secondary" id="modifyDeviceBtn" onClick={handlers.onModifyDeviceClick}>
                  {state.texts.modifyDeviceBtn}
                </button>
                <div id="modifyDeviceDrawer" className={`template-action-drawer ${state.isModifyDeviceDrawerOpen ? "" : "is-hidden"}`}>
                  <button className="ui-btn ui-btn--secondary" id="modifyDeviceLegacyBtn" onClick={handlers.onModifyDeviceLegacyClick}>
                    {state.texts.modifyDeviceLegacyBtn}
                  </button>
                  <button className="ui-btn ui-btn--secondary" id="modifyDeviceNewBtn" onClick={handlers.onModifyDeviceNewClick}>
                    {state.texts.modifyDeviceNewBtn}
                  </button>
                </div>
                <button className="ui-btn ui-btn--secondary" id="generateSheetBtn" onClick={handlers.onGenerateSheetClick}>
                  {state.texts.generateSheetBtn}
                </button>
                <button className="ui-btn ui-btn--secondary" id="queryPriceBtn" onClick={handlers.onQueryPriceClick}>
                  {state.texts.queryPriceBtn}
                </button>
                <button className="ui-btn ui-btn--secondary" id="graphEditorBtn" onClick={handlers.onGraphEditorClick}>
                  {state.texts.graphEditorBtn}
                </button>
                <button className="ui-btn ui-btn--secondary" id="infoReferenceBtn" onClick={handlers.onInfoReferenceClick}>
                  {state.texts.infoReferenceBtn}
                </button>
                <button className="ui-btn ui-btn--secondary" id="generateQuoteBtn" onClick={handlers.onGenerateQuoteClick}>
                  {state.texts.generateQuoteBtn}
                </button>
                <div id="generateTemplateDrawer" className={`template-action-drawer ${state.isGenerateTemplateDrawerOpen ? "" : "is-hidden"}`}>
                  <button className="ui-btn ui-btn--secondary" id="generateSimpleQuoteBtn" onClick={handlers.onGenerateSimpleQuoteClick}>
                    {state.texts.generateSimpleQuoteBtn}
                  </button>
                  <button className="ui-btn ui-btn--secondary" id="generateDetailQuoteBtn" onClick={handlers.onGenerateDetailQuoteClick}>
                    {state.texts.generateDetailQuoteBtn}
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {state.currentUser ? (
            <div className={`account-dock ui-surface ui-surface--compact ${state.isAccountDockExpanded ? "is-expanded" : ""}`} id="accountDock">
              <button className="account-dock-toggle" id="accountDockToggle" onClick={handlers.onAccountDockToggle}>
                <span className="account-dock-label" id="accountDockLabel">
                  {accountDockLabel}
                </span>
              </button>
              <button className="account-dock-btn" id="logoutDockBtn" onClick={handlers.onLoginClick}>
                退出
              </button>
            </div>
          ) : null}

          <div
            className={`confirm-modal ui-modal-backdrop ${state.generateTemplateConfirmOpen ? "" : "is-hidden"}`}
            id="generateTemplateConfirmModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="generateTemplateConfirmTitle"
          >
            <div className="confirm-modal-card ui-modal-card">
              <h3 className="confirm-modal-title ui-modal-title" id="generateTemplateConfirmTitle">
                确认生成模板
              </h3>
              <p className="confirm-modal-message ui-modal-message">生成新模板会清除掉原有模板及所有数据，是否确定继续。</p>
              <div className="confirm-modal-actions ui-modal-actions">
                <button className="ui-btn ui-btn--secondary" id="confirmGenerateTemplateCancel" type="button" onClick={handlers.onConfirmGenerateTemplateCancel}>
                  取消
                </button>
                <button className="ui-btn ui-btn--primary" id="confirmGenerateTemplateOk" type="button" onClick={handlers.onConfirmGenerateTemplateOk}>
                  确定
                </button>
              </div>
            </div>
          </div>

          <div
            className={`confirm-modal ui-modal-backdrop ${state.operationErrorOpen ? "" : "is-hidden"}`}
            id="operationErrorModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="operationErrorTitle"
          >
            <div className="confirm-modal-card ui-modal-card">
              <h3 className="confirm-modal-title ui-modal-title" id="operationErrorTitle">
                操作失败
              </h3>
              <p className="confirm-modal-message ui-modal-message" id="operationErrorMessage">
                {state.operationErrorMessage || "请稍后重试。"}
              </p>
              <div className="confirm-modal-actions ui-modal-actions ui-modal-actions--single single">
                <button className="ui-btn ui-btn--primary" id="operationErrorOk" type="button" onClick={handlers.onOperationErrorOk}>
                  确定
                </button>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
