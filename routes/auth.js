const { Router } = require('express');
const { pool } = require('../lib/db');
const {
  requireAuth,
  buildSafeErrorMessage,
  getRequestAuthToken,
  buildAuthCookie,
  buildClearAuthCookie,
  createAuthSession,
  revokeSession,
  clearUserSessions,
  verifyPassword,
  needsPasswordUpgrade,
  createScryptPasswordHash,
  sanitizeClientApp,
} = require('../lib/authService');
const { API_ROUTES, SERVER_MESSAGES, SERVER_LOGS } = require('../serverConstants');

const router = Router();

// 8.4 Auth login
router.post(API_ROUTES.authLogin, async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const clientApp = sanitizeClientApp(req.body?.clientApp);

    if (!username || !password) {
      res.status(401).json({ success: false, error: SERVER_MESSAGES.authInvalidCredentials });
      return;
    }

    const [rows] = await pool.query(
      `
      SELECT id, username, full_name, password_hash, is_active
      FROM app_users
      WHERE username = ?
      LIMIT 1
      `,
      [username]
    );

    if (!rows.length) {
      res.status(401).json({ success: false, error: SERVER_MESSAGES.authInvalidCredentials });
      return;
    }

    const user = rows[0];
    if (Number(user.is_active) !== 1) {
      res.status(403).json({ success: false, error: SERVER_MESSAGES.authUserDisabled });
      return;
    }

    if (!verifyPassword(password, user.password_hash)) {
      res.status(401).json({ success: false, error: SERVER_MESSAGES.authInvalidCredentials });
      return;
    }

    if (needsPasswordUpgrade(user.password_hash)) {
      try {
        await pool.query(
          `
          UPDATE app_users
          SET password_hash = ?
          WHERE id = ?
            AND password_hash = ?
          `,
          [createScryptPasswordHash(password), user.id, String(user.password_hash || "")]
        );
      } catch (updateError) {
        console.warn("Password hash upgrade failed:", updateError.message || updateError);
      }
    }

    const session = await createAuthSession(
      {
        id: user.id,
        username: String(user.username || username),
        full_name: String(user.full_name || user.username || username),
      },
      clientApp
    );

    res.setHeader("Set-Cookie", buildAuthCookie(session.token));
    res.json({
      success: true,
      data: {
        token: session.token,
        userId: session.userId,
        username: session.username,
        fullName: session.fullName,
      },
    });
  } catch (error) {
    console.error(`${SERVER_LOGS.authLoginFailed}:`, error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "登录失败") });
  }
});

// 8.5 Auth logout
router.post(API_ROUTES.authLogout, async (req, res) => {
  try {
    const token = getRequestAuthToken(req);
    if (token) {
      await revokeSession(token);
    }
    res.setHeader("Set-Cookie", buildClearAuthCookie());
    res.json({ success: true, data: { loggedOut: true } });
  } catch (error) {
    console.error(`${SERVER_LOGS.authLogoutFailed}:`, error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "登出失败") });
  }
});

// 8.6 Auth me
router.get(API_ROUTES.authMe, requireAuth, async (req, res) => {
  try {
    const session = req.authSession;
    res.json({
      success: true,
      data: {
        userId: session.userId,
        username: session.username,
        fullName: session.fullName,
      },
    });
  } catch (error) {
    console.error(`${SERVER_LOGS.authMeFailed}:`, error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "获取当前用户失败") });
  }
});

// 8.7 Auth reset password
router.post(API_ROUTES.authResetPassword, async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const oldPassword = String(req.body?.oldPassword || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!username || !oldPassword || !newPassword) {
      res.status(400).json({ success: false, error: SERVER_MESSAGES.authResetPasswordFailed });
      return;
    }

    const [rows] = await pool.query(
      `
      SELECT id, username, password_hash, is_active
      FROM app_users
      WHERE username = ?
      LIMIT 1
      `,
      [username]
    );

    if (!rows.length) {
      res.status(401).json({ success: false, error: SERVER_MESSAGES.authInvalidCredentials });
      return;
    }

    const user = rows[0];
    if (Number(user.is_active) !== 1) {
      res.status(403).json({ success: false, error: SERVER_MESSAGES.authUserDisabled });
      return;
    }

    if (!verifyPassword(oldPassword, user.password_hash)) {
      res.status(401).json({ success: false, error: SERVER_MESSAGES.authInvalidCredentials });
      return;
    }

    await pool.query(
      `
      UPDATE app_users
      SET password_hash = ?
      WHERE id = ?
        AND password_hash = ?
      `,
      [createScryptPasswordHash(newPassword), user.id, String(user.password_hash || "")]
    );

    await clearUserSessions(user.id);

    res.json({ success: true, data: { username } });
  } catch (error) {
    console.error(`${SERVER_LOGS.authResetPasswordFailed}:`, error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, SERVER_MESSAGES.authResetPasswordFailed) });
  }
});

module.exports = router;
