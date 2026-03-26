const crypto = require('crypto');
const { pool } = require('./db');
const { AUTH_CONFIG, SERVER_MESSAGES } = require('../serverConstants');

const AUTH_SESSION_TTL_DAYS = 7;
const AUTH_COOKIE_NAME = AUTH_CONFIG.cookieName;
const DEFAULT_CLIENT_APP = AUTH_CONFIG.defaultClientApp;
const PASSWORD_SCRYPT_PREFIX = "scrypt";
const PASSWORD_SCRYPT_KEYLEN = 64;

const AUTH_SESSIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  username VARCHAR(50) NOT NULL,
  full_name VARCHAR(100) NULL,
  client_app VARCHAR(64) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_token (token),
  KEY idx_user_id (user_id),
  KEY idx_expires_at (expires_at),
  KEY idx_revoked_at (revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一登录会话表';
`;

async function ensureAuthSessionsTable() {
  await pool.query(AUTH_SESSIONS_TABLE_SQL);
}

// ── Cookie 工具 ───────────────────────────────────────────────

function parseCookieHeader(headerValue) {
  const raw = String(headerValue || "");
  if (!raw) return {};
  const output = {};
  for (const segment of raw.split(";")) {
    const item = String(segment || "").trim();
    if (!item) continue;
    const index = item.indexOf("=");
    if (index <= 0) continue;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (!key) continue;
    output[key] = decodeURIComponent(value || "");
  }
  return output;
}

function getCookieToken(req) {
  const cookies = parseCookieHeader(req?.headers?.cookie || "");
  return String(cookies[AUTH_COOKIE_NAME] || "").trim();
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function getRequestAuthToken(req) {
  return getCookieToken(req) || getBearerToken(req);
}

function buildAuthCookie(token) {
  const maxAge = AUTH_SESSION_TTL_DAYS * 24 * 60 * 60;
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(String(token || ""))}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

function buildClearAuthCookie() {
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

// ── 密码工具 ──────────────────────────────────────────────────

function hashSha256(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function createScryptPasswordHash(text) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(text || ""), salt, PASSWORD_SCRYPT_KEYLEN).toString("hex");
  return `${PASSWORD_SCRYPT_PREFIX}$${salt}$${derived}`;
}

function verifyScryptPassword(inputPassword, storedPasswordHash) {
  const parts = String(storedPasswordHash || "").split("$");
  if (parts.length !== 3 || parts[0] !== PASSWORD_SCRYPT_PREFIX) return false;
  const salt = parts[1];
  const expectedHex = parts[2];
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = crypto.scryptSync(String(inputPassword || ""), salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function verifyPassword(inputPassword, storedPasswordHash) {
  const input = String(inputPassword || "");
  const stored = String(storedPasswordHash || "");
  if (!stored) return false;
  if (stored.startsWith(`${PASSWORD_SCRYPT_PREFIX}$`)) {
    return verifyScryptPassword(input, stored);
  }
  return stored === input || stored === hashSha256(input);
}

function needsPasswordUpgrade(storedPasswordHash) {
  const stored = String(storedPasswordHash || "");
  if (!stored) return false;
  return !stored.startsWith(`${PASSWORD_SCRYPT_PREFIX}$`);
}

// ── 会话管理 ──────────────────────────────────────────────────

function buildSessionExpiryDate() {
  return new Date(Date.now() + AUTH_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

async function createAuthSession(user, clientApp = DEFAULT_CLIENT_APP) {
  const token = crypto.randomUUID();
  const expiresAt = buildSessionExpiryDate();
  await pool.query(
    `
    INSERT INTO auth_sessions
      (token, user_id, username, full_name, client_app, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      token,
      Number(user?.id || 0),
      String(user?.username || ""),
      String(user?.full_name || user?.username || ""),
      String(clientApp || DEFAULT_CLIENT_APP),
      expiresAt,
    ]
  );
  return {
    token,
    userId: Number(user?.id || 0),
    username: String(user?.username || ""),
    fullName: String(user?.full_name || user?.username || ""),
  };
}

async function getAuthSession(token) {
  const value = String(token || "").trim();
  if (!value) return null;
  const [rows] = await pool.query(
    `
    SELECT
      s.token,
      s.user_id,
      s.username,
      s.full_name,
      s.last_seen_at,
      u.is_active
    FROM auth_sessions s
    LEFT JOIN app_users u ON u.id = s.user_id
    WHERE s.token = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
    `,
    [value]
  );
  if (!rows.length) return null;
  const row = rows[0];
  if (Number(row?.is_active) !== 1) return null;
  // 仅当 last_seen_at 超过 1 小时未更新时才写库，避免每次请求都触发写操作
  const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  if (Date.now() - lastSeen > 60 * 60 * 1000) {
    pool.query(`UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token = ?`, [value]).catch(() => {});
  }
  return {
    token: String(row.token || value),
    userId: Number(row.user_id || 0),
    username: String(row.username || ""),
    fullName: String(row.full_name || row.username || ""),
  };
}

async function revokeSession(token) {
  const value = String(token || "").trim();
  if (!value) return;
  await pool.query(
    `UPDATE auth_sessions SET revoked_at = IFNULL(revoked_at, NOW()) WHERE token = ?`,
    [value]
  );
}

async function clearUserSessions(userId) {
  await pool.query(
    `UPDATE auth_sessions SET revoked_at = IFNULL(revoked_at, NOW()) WHERE user_id = ? AND revoked_at IS NULL`,
    [Number(userId || 0)]
  );
}

// ── 中间件 ────────────────────────────────────────────────────

function buildSafeErrorMessage(error, fallback) {
  if (process.env.NODE_ENV === "production") return fallback;
  return error?.message || fallback;
}

async function requireAuth(req, res, next) {
  try {
    const token = getRequestAuthToken(req);
    const session = token ? await getAuthSession(token) : null;
    if (!session) {
      res.status(401).json({ success: false, error: SERVER_MESSAGES.authMissingToken });
      return;
    }
    req.authSession = session;
    next();
  } catch (error) {
    console.error("Auth middleware failed:", error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "认证失败") });
  }
}

function sanitizeClientApp(rawValue) {
  const normalized = String(rawValue || "").trim().replace(/[^a-zA-Z0-9._-]/g, "");
  return normalized || DEFAULT_CLIENT_APP;
}

module.exports = {
  ensureAuthSessionsTable,
  createAuthSession,
  getAuthSession,
  revokeSession,
  clearUserSessions,
  requireAuth,
  getRequestAuthToken,
  buildAuthCookie,
  buildClearAuthCookie,
  createScryptPasswordHash,
  verifyPassword,
  needsPasswordUpgrade,
  sanitizeClientApp,
  buildSafeErrorMessage,
};
