const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const {
  SERVER_CONFIG,
  DATABASE_CONFIG,
  ACTIVE_DB,
  API_ROUTES,
  URLS,
  DOMAIN_TERMS,
  SERVER_MESSAGES,
  SERVER_LOGS,
} = require("./serverConstants");

const app = express();
const AUTH_SESSION_TTL_DAYS = 7;
const AUTH_COOKIE_NAME = "dc_auth_session";
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

// Middleware
app.use(cors());
app.use(express.json());

// MySQL connection pool
const pool = mysql.createPool({
  ...DATABASE_CONFIG[ACTIVE_DB],
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

function buildEquipmentImageUrl(componentPic) {
  const raw = String(componentPic || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.replace(/^\/+/, "");
  return `/${normalized}`;
}

// Export active DB config for external modules
module.exports.DATABASE_CONFIG = DATABASE_CONFIG;
module.exports.ACTIVE_DB = ACTIVE_DB;

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

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

function hashSha256(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function verifyPassword(inputPassword, storedPasswordHash) {
  const input = String(inputPassword || "");
  const stored = String(storedPasswordHash || "");
  if (!stored) return false;
  return stored === input || stored === hashSha256(input);
}

function isSha256Hex(text) {
  return /^[a-f0-9]{64}$/i.test(String(text || ""));
}

async function ensureAuthSessionsTable() {
  await pool.query(AUTH_SESSIONS_TABLE_SQL);
}

function buildSessionExpiryDate() {
  return new Date(Date.now() + AUTH_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

async function createAuthSession(user, clientApp = "quotationaddin") {
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
      String(clientApp || "quotationaddin"),
      expiresAt
    ]
  );
  return {
    token,
    userId: Number(user?.id || 0),
    username: String(user?.username || ""),
    fullName: String(user?.full_name || user?.username || "")
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
  await pool.query(`UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token = ?`, [value]);
  return {
    token: String(row.token || value),
    userId: Number(row.user_id || 0),
    username: String(row.username || ""),
    fullName: String(row.full_name || row.username || "")
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

const ASSEMBLY_GROUP_SQL = `
CASE
  WHEN CAST(is_Assembly AS SIGNED) >= 100 THEN FLOOR(CAST(is_Assembly AS SIGNED) / 10)
  WHEN CAST(is_Assembly AS SIGNED) >= 1 THEN CAST(is_Assembly AS SIGNED)
  ELSE 0
END
`;

const ALLOWED_INDUSTRY_TYPES = new Set(["calcium", "lfp", "lfp_raw"]);

function normalizeIndustryType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ALLOWED_INDUSTRY_TYPES.has(normalized) ? normalized : "";
}

async function resolveProductIndustryConfigContext(productId, industryType) {
  const numericProductId = Number(productId || 0);
  const normalizedIndustryType = normalizeIndustryType(industryType);
  if (!numericProductId) {
    return { productId: 0, configProductId: null, industryType: normalizedIndustryType };
  }

  if (normalizedIndustryType) {
    const [mappingRows] = await pool.query(
      `
      SELECT product_id, config_product_id
      FROM ht_sales_product_industry_config
      WHERE product_id = ?
        AND industry_type = ?
        AND is_active = 1
      LIMIT 1
      `,
      [numericProductId, normalizedIndustryType]
    );
    if (mappingRows.length) {
      const mappedConfigProductId = mappingRows[0].config_product_id;
      return {
        productId: numericProductId,
        configProductId:
          mappedConfigProductId === null || mappedConfigProductId === undefined
            ? null
            : Number(mappedConfigProductId || 0) || null,
        industryType: normalizedIndustryType,
      };
    }
  }
  return {
    productId: numericProductId,
    configProductId: numericProductId,
    industryType: normalizedIndustryType,
  };
}

// API routes (must be defined before static file serving)

// 0. Test DB connection
app.get(API_ROUTES.test, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.testConnectionFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 1. Get product categories
app.get(API_ROUTES.categories, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        product_type_id as id,
        type_name as name
      FROM ht_sales_product_types
      WHERE is_active = 1
      ORDER BY product_type_id
    `);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchCategoriesFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Get products by category
app.get(API_ROUTES.projects, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const industryType = normalizeIndustryType(req.query.industryType);
    let rows;
    if (industryType) {
      [rows] = await pool.query(
        `
        SELECT 
          p.product_id as id,
          p.product_model as name,
          COALESCE(p.base_description, '') as base_description,
          '' as image_url
        FROM ht_sales_products p
        INNER JOIN ht_sales_product_industry_config pi
          ON pi.product_id = p.product_id
         AND pi.industry_type = ?
         AND pi.is_active = 1
        WHERE p.product_type_id = ?
          AND p.is_active = 1
        ORDER BY (p.sort_by IS NULL) ASC, p.sort_by ASC, p.product_model ASC
        `,
        [industryType, categoryId]
      );
    } else {
      [rows] = await pool.query(
        `
        SELECT 
          product_id as id,
          product_model as name,
          COALESCE(base_description, '') as base_description,
          '' as image_url
        FROM ht_sales_products
        WHERE product_type_id = ? AND is_active = 1
        ORDER BY (sort_by IS NULL) ASC, sort_by ASC, product_model ASC
        `,
        [categoryId]
      );
    }
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchProjectsFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Get component details
app.get(API_ROUTES.details, async (req, res) => {
  try {
    const { projectId } = req.params;
    const context = await resolveProductIndustryConfigContext(projectId, req.query.industryType);
    if (!context.configProductId) {
      res.json({ success: true, data: [] });
      return;
    }
    const scope = { whereSql: "product_id = ?", params: [Number(context.configProductId || projectId)] };

    const [rows] = await pool.query(`
      SELECT 
        config_id as id,
        component_name as name,
        component_pic,
        component_sn,
        CAST(is_active AS SIGNED) as is_required
      FROM ht_sales_product_default_config
      WHERE ${scope.whereSql}
        AND CAST(is_Assembly AS SIGNED) = 0
        AND whatkind NOT IN (?, ?)
      ORDER BY component_sn
    `, [...scope.params, DOMAIN_TERMS.craftingKind, DOMAIN_TERMS.standardPartKind]);
    (rows || []).forEach((row) => {
      row.image_url = buildEquipmentImageUrl(row.component_pic);
    });
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchDetailsFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Get annotation options
app.get(API_ROUTES.annotations, async (req, res) => {
  try {
    const { projectId } = req.params;
    const context = await resolveProductIndustryConfigContext(projectId, req.query.industryType);
    if (!context.configProductId) {
      res.json({ success: true, data: [] });
      return;
    }
    const scope = { whereSql: "product_id = ?", params: [Number(context.configProductId || projectId)] };

    const [rows] = await pool.query(`
      SELECT 
        config_id as id,
        component_name as name,
        component_pic,
        pic_level as position_x,
        NULL as position_y,
        CAST(is_Assembly AS SIGNED) as is_Assembly,
        ${ASSEMBLY_GROUP_SQL} as assembly_group
      FROM ht_sales_product_default_config
      WHERE ${scope.whereSql}
        AND CAST(is_Assembly AS SIGNED) >= 1
      ORDER BY component_sn
    `, scope.params);
    (rows || []).forEach((row) => {
      row.image_url = buildEquipmentImageUrl(row.component_pic);
    });
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchAnnotationsFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Get full config data
app.get(API_ROUTES.config, async (req, res) => {
  try {
    const { projectId } = req.params;
    const context = await resolveProductIndustryConfigContext(projectId, req.query.industryType);
    if (!context.configProductId) {
      res.json({ success: true, data: [] });
      return;
    }
    const scope = { whereSql: "product_id = ?", params: [Number(context.configProductId || projectId)] };

    const [rows] = await pool.query(`
      SELECT 
        config_id,
        product_id,
        component_sn,
        component_name,
        component_desc,
        component_type,
        component_material,
        component_brand,
        component_quantity,
        component_unit,
        component_unitprice,
        component_totalprice,
        component_pic,
        pic_level,
        whatkind,
        CAST(is_active AS SIGNED) as is_active,
        CAST(is_Assembly AS SIGNED) as is_Assembly,
        ${ASSEMBLY_GROUP_SQL} as assembly_group
      FROM ht_sales_product_default_config
      WHERE ${scope.whereSql}
      ORDER BY component_sn
    `, scope.params);
    (rows || []).forEach((row) => {
      row.image_url = buildEquipmentImageUrl(row.component_pic);
    });
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchConfigFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Get crafting config
app.get(API_ROUTES.crafting, async (req, res) => {
  try {
    const { componentId } = req.params;
    
    const [rows] = await pool.query(`
      SELECT * FROM ht_sales_config_crafting
      WHERE component_id = ?
    `, [componentId]);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchCraftingFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Get material config
app.get(API_ROUTES.materials, async (req, res) => {
  try {
    const { componentId } = req.params;

    const [rows] = await pool.query(`
      SELECT
        material_id,
        product_id,
        component_id,
        material_type,
        totalprice
      FROM ht_sales_config_materials
      WHERE component_id = ?
    `, [componentId]);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchMaterialsFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Get system list
app.get(API_ROUTES.systems, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        system_id as id,
        system_name as name,
        system_order as \`order\`
      FROM ht_sales_systems
      WHERE is_active = 1
      ORDER BY system_order ASC, system_id ASC
    `);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchSystemsFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8.1 Get craft price options
app.get(API_ROUTES.craftPrices, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT
        material_name,
        material_unitprice
      FROM ht_sales_materials
      WHERE material_type = ?
      ORDER BY material_name
    `, [DOMAIN_TERMS.craftingKind]);

    const data = rows.map((row) => {
      const name = row.material_name || DOMAIN_TERMS.unknownCrafting;
      const price = Number(row.material_unitprice || 0);
      return {
        craftType: name,
        price,
        label: `${name}${DOMAIN_TERMS.craftLabelSeparator}${DOMAIN_TERMS.rmbSymbol} ${price}`
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchCraftPricesFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8.2 Get product ID by product model
app.get(API_ROUTES.projectByModel, async (req, res) => {
  try {
    const { productModel } = req.params;
    const industryType = normalizeIndustryType(req.query.industryType);
    let rows;
    if (industryType) {
      [rows] = await pool.query(
        `
        SELECT p.product_id, p.product_model, p.product_type_id
        FROM ht_sales_products p
        INNER JOIN ht_sales_product_industry_config pi
          ON pi.product_id = p.product_id
         AND pi.industry_type = ?
         AND pi.is_active = 1
        WHERE p.product_model = ?
        ORDER BY p.product_id ASC
        LIMIT 1
        `,
        [industryType, productModel]
      );
    } else {
      [rows] = await pool.query(
        `
        SELECT product_id, product_model, product_type_id
        FROM ht_sales_products
        WHERE product_model = ?
        LIMIT 1
        `,
        [productModel]
      );
    }

    if (rows.length === 0) {
      res.json({ success: false, message: SERVER_MESSAGES.projectModelNotFound });
      return;
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchProjectByModelFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8.3 Price search
app.get(API_ROUTES.priceSearch, async (req, res) => {
  try {
    const keyword = (req.query.keyword || "").toString().trim();
    if (!keyword) {
      res.json({ success: true, data: [] });
      return;
    }

    const [rows] = await pool.query(`
      SELECT
        ItemName,
        ItemDesc,
        ItemType,
        ItemPrice,
        ItemUnit,
        OrderDate
      FROM (
        SELECT
          *,
          ROW_NUMBER() OVER (PARTITION BY ItemName ORDER BY OrderDate DESC) AS rn
        FROM ht_sales_price_list
        WHERE ItemName LIKE ?
      ) AS subquery
      WHERE rn = 1
      LIMIT 100
    `, [`%${keyword}%`]);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.priceSearchFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8.31 Warehouse statistics fuzzy search
app.get(API_ROUTES.warehouseCleanSearch, async (req, res) => {
  try {
    const keyword = String(req.query.keyword || "").trim();
    const sheetLimitRaw = Number(req.query.limit || 20);
    const sheetLimit = Number.isFinite(sheetLimitRaw)
      ? Math.max(5, Math.min(80, Math.floor(sheetLimitRaw)))
      : 20;
    const detailLimitRaw = Number(req.query.detailLimit || 2500);
    const detailLimit = Number.isFinite(detailLimitRaw)
      ? Math.max(200, Math.min(5000, Math.floor(detailLimitRaw)))
      : 2500;
    if (!keyword) {
      res.json({ success: true, data: [] });
      return;
    }

    const like = `%${keyword}%`;
    const [matchedSheets] = await pool.query(
      `
      SELECT DISTINCT sheet_name
      FROM ht_sales_warehouse_sheet_meta
      WHERE custom_product_model LIKE ?
      ORDER BY sheet_name
      LIMIT ?
      `,
      [like, sheetLimit]
    );
    const sheetNames = (matchedSheets || [])
      .map((x) => String(x.sheet_name || "").trim())
      .filter(Boolean);
    if (!sheetNames.length) {
      res.json({ success: true, data: [] });
      return;
    }

    const placeholders = sheetNames.map(() => "?").join(",");
    const [rows] = await pool.query(
      `
      SELECT
        id,
        source_file,
        sheet_name,
        row_index,
        key_param,
        category_name,
        content_spec,
        model_name,
        brand_name,
        material_name,
        skip_spec_columns,
        weight_kg,
        category_amount,
        price_ratio,
        category_row_count,
        quantity_value,
        sheet_total_weight_kg,
        sheet_total_amount,
        sheet_total_row_count
      FROM ht_sales_warehouse_statistics
      WHERE sheet_name IN (${placeholders})
      ORDER BY sheet_name ASC, row_index ASC
      LIMIT ?
      `,
      [...sheetNames, detailLimit]
    );

    const [metaRows] = await pool.query(
      `
      SELECT
        m.sheet_name,
        m.project_name,
        m.project_code,
        m.device_name,
        m.device_drawing_no,
        m.tag_no,
        m.order_qty,
        m.order_unit,
        m.surface_process,
        m.vendor_name
      FROM ht_sales_warehouse_sheet_meta m
      INNER JOIN (
        SELECT sheet_name, MAX(id) AS max_id
        FROM ht_sales_warehouse_sheet_meta
        WHERE sheet_name IN (${placeholders})
        GROUP BY sheet_name
      ) x ON x.max_id = m.id
      `,
      [...sheetNames]
    );

    const metaBySheet = {};
    (metaRows || []).forEach((row) => {
      const sheetName = String(row.sheet_name || "").trim();
      if (!sheetName) return;
      metaBySheet[sheetName] = {
        project_name: row.project_name || "",
        project_code: row.project_code || "",
        device_name: row.device_name || "",
        device_drawing_no: row.device_drawing_no || "",
        tag_no: row.tag_no || "",
        order_qty: row.order_qty || "",
        order_unit: row.order_unit || "",
        surface_process: row.surface_process || "",
        vendor_name: row.vendor_name || "",
      };
    });

    res.json({ success: true, data: rows || [], metaBySheet });
  } catch (error) {
    console.error("Warehouse statistics search failed:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8.4 Auth login
app.post(API_ROUTES.authLogin, async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      res.status(401).json({ success: false, error: SERVER_MESSAGES.authInvalidCredentials });
      return;
    }

    const [rows] = await pool.query(
      `
      SELECT
        id,
        username,
        full_name,
        password_hash,
        is_active
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

    const storedPassword = String(user.password_hash || "");
    if (storedPassword === password && !isSha256Hex(storedPassword)) {
      try {
        await pool.query(
          `
          UPDATE app_users
          SET password_hash = ?
          WHERE id = ?
        `,
          [hashSha256(password), user.id]
        );
      } catch (updateError) {
        console.warn("Password hash upgrade failed:", updateError.message || updateError);
      }
    }

    const session = await createAuthSession(
      {
        id: user.id,
        username: String(user.username || username),
        full_name: String(user.full_name || user.username || username)
      },
      "quotationaddin"
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8.5 Auth logout
app.post(API_ROUTES.authLogout, async (req, res) => {
  try {
    const token = getRequestAuthToken(req);
    if (token) {
      await revokeSession(token);
    }
    res.setHeader("Set-Cookie", buildClearAuthCookie());
    res.json({ success: true, data: { loggedOut: true } });
  } catch (error) {
    console.error(`${SERVER_LOGS.authLogoutFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8.6 Auth me
app.get(API_ROUTES.authMe, async (req, res) => {
  try {
    const token = getRequestAuthToken(req);
    const session = token ? await getAuthSession(token) : null;
    if (!session) {
      res.status(401).json({ success: false, error: SERVER_MESSAGES.authMissingToken });
      return;
    }

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
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8.7 Auth reset password
app.post(API_ROUTES.authResetPassword, async (req, res) => {
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
      SELECT
        id,
        username,
        password_hash,
        is_active
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
    `,
      [hashSha256(newPassword), user.id]
    );

    await clearUserSessions(user.id);

    res.json({ success: true, data: { username } });
  } catch (error) {
    console.error(`${SERVER_LOGS.authResetPasswordFailed}:`, error);
    res.status(500).json({ success: false, error: error.message || SERVER_MESSAGES.authResetPasswordFailed });
  }
});

// 9. Get product type to system mapping
app.get(API_ROUTES.systemMapping, async (req, res) => {
  try {
    const { typeName } = req.params;

    const [rows] = await pool.query(`
      SELECT DISTINCT
        system_name,
        type_name
      FROM v_system_config_simple
      WHERE type_name = ?
      LIMIT 1
    `, [typeName]);

    if (rows.length > 0) {
      res.json({
        success: true,
        data: {
          typeName: rows[0].type_name,
          systemName: rows[0].system_name
        }
      });
    } else {
      res.json({
        success: false,
        message: SERVER_MESSAGES.systemMappingNotFound
      });
    }
  } catch (error) {
    console.error(`${SERVER_LOGS.querySystemMappingFailed}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Export quote preview page as PDF
app.post(API_ROUTES.exportQuotePdf, async (req, res) => {
  let browser;
  try {
    const html = String(req.body?.html || "").trim();
    const fileName = String(req.body?.fileName || "报价汇总表").trim() || "报价汇总表";
    const landscape = Boolean(req.body?.landscape);

    if (!html) {
      res.status(400).json({ success: false, error: "缺少导出内容" });
      return;
    }

    let puppeteer;
    try {
      puppeteer = require("puppeteer");
    } catch (err) {
      res.status(500).json({
        success: false,
        error: "服务器未安装 puppeteer，请先执行 npm i puppeteer",
      });
      return;
    }

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");

    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape,
      printBackground: true,
      margin: {
        top: "10mm",
        right: "10mm",
        bottom: "10mm",
        left: "10mm",
      },
    });

    const encodedName = encodeURIComponent(`${fileName}.pdf`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedName}`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Export quote PDF failed:", error);
    res.status(500).json({ success: false, error: error.message || "导出PDF失败" });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
});

// Static file serving (must be after API routes)
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));

// HTTPS server

// Prefer external cert directory to avoid certificate files being coupled to code updates.
const certBaseDir = process.env.CERT_BASE_DIR
  ? path.resolve(process.env.CERT_BASE_DIR)
  : path.resolve(__dirname, "..");
const certKeyPath = path.join(certBaseDir, SERVER_CONFIG.certKeyFile);
const certPemPath = path.join(certBaseDir, SERVER_CONFIG.certPemFile);

if (!fs.existsSync(certKeyPath) || !fs.existsSync(certPemPath)) {
  console.error(SERVER_LOGS.sslCertMissing);
  console.error(`   ${certBaseDir}`);
  console.error(`   ${SERVER_LOGS.sslCertRequiredFiles}`);
  console.error("   Tip: set CERT_BASE_DIR to an external certificate directory.");
  process.exit(1);
}

const httpsOptions = {
  key: fs.readFileSync(certKeyPath),
  cert: fs.readFileSync(certPemPath)
};

// Start HTTPS server
const PORT = SERVER_CONFIG.port;
ensureAuthSessionsTable()
  .then(() => {
    const server = https.createServer(httpsOptions, app);
    server.on("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        console.warn(`Port ${PORT} is already in use. Reusing existing API service.`);
        process.exit(0);
        return;
      }
      console.error("HTTPS server error:", error?.message || error);
      process.exit(1);
    });
    server.listen(PORT, () => {
      console.log(SERVER_LOGS.startupDivider);
      console.log(`${SERVER_LOGS.startupServerRunning} ${URLS.serverOrigin}`);
      console.log(SERVER_LOGS.startupSslLoaded);
      console.log(`SSL cert dir: ${certBaseDir}`);
      console.log(SERVER_LOGS.startupDivider);
      console.log(SERVER_LOGS.startupApiEndpoints);
      console.log(`   ${SERVER_LOGS.startupApiTest}: ${URLS.serverOrigin}/api/test`);
      console.log(`   ${SERVER_LOGS.startupApiCategories}: ${URLS.serverOrigin}/api/categories`);
      console.log(`   ${SERVER_LOGS.startupApiConfig}: ${URLS.serverOrigin}/api/config/:projectId`);
      console.log(`   ${SERVER_LOGS.startupApiWarehouseCleanSearch}: ${URLS.serverOrigin}/api/warehouse-clean-search?keyword=xxx`);
      console.log(`   ${SERVER_LOGS.startupApiSystemMapping}: ${URLS.serverOrigin}/api/system-mapping/:productModel`);
      console.log(`   ${SERVER_LOGS.startupApiImages}: ${URLS.serverOrigin}/assets/equipment/`);
      console.log(`   ${SERVER_LOGS.startupApiStatic}: ${URLS.serverOrigin}/`);
      console.log(SERVER_LOGS.startupDivider);
      console.log(`${SERVER_LOGS.startupExample}: ${URLS.serverOrigin}/api/system-mapping/demo`);
      console.log(SERVER_LOGS.startupDivider);
    });
  })
  .catch((error) => {
    console.error("Auth session table init failed:", error?.message || error);
    process.exit(1);
  });
