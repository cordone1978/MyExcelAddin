const { Router } = require('express');
const { pool } = require('../lib/db');
const { requireAuth, buildSafeErrorMessage } = require('../lib/authService');
const { API_ROUTES, DOMAIN_TERMS, SERVER_LOGS, SERVER_MESSAGES } = require('../serverConstants');

const router = Router();

const ASSEMBLY_GROUP_SQL = `
CASE
  WHEN CAST(is_Assembly AS SIGNED) >= 100 THEN FLOOR(CAST(is_Assembly AS SIGNED) / 10)
  WHEN CAST(is_Assembly AS SIGNED) >= 1 THEN CAST(is_Assembly AS SIGNED)
  ELSE 0
END
`;

const INDUSTRY_CODE_ALIASES = {
  calcium: "CALCIUM_CARBONATE",
  lfp: "LITHIUM_IRON_PHOSPHATE",
  lfp_raw: "FERRIC_PHOSPHATE",
};

function normalizeIndustryCode(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return INDUSTRY_CODE_ALIASES[raw.toLowerCase()] || raw.toUpperCase();
}

function buildEquipmentImageUrl(componentPic) {
  const raw = String(componentPic || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.replace(/^\/+/, "");
  return `/${normalized}`;
}

async function resolveIndustryRecord(industryValue) {
  const industryCode = normalizeIndustryCode(industryValue);
  if (!industryCode) return null;
  const [rows] = await pool.query(
    `
    SELECT industry_id, industry_code, industry_name, short_name
    FROM ht_sales_industries
    WHERE industry_code = ?
      AND is_active = 1
    LIMIT 1
    `,
    [industryCode]
  );
  return rows.length ? rows[0] : null;
}

async function resolveProductIndustryConfigContext(productId, industryType) {
  const numericProductId = Number(productId || 0);
  const industry = await resolveIndustryRecord(industryType);
  if (!numericProductId) {
    return { productId: 0, configProductId: null, industryId: Number(industry?.industry_id || 0) || null };
  }
  if (industry?.industry_id) {
    const [mappingRows] = await pool.query(
      `
      SELECT product_id, config_product_id
      FROM ht_sales_product_industry_config
      WHERE product_id = ?
        AND industry_id = ?
      LIMIT 1
      `,
      [numericProductId, Number(industry.industry_id)]
    );
    if (mappingRows.length) {
      const mappedConfigProductId = mappingRows[0].config_product_id;
      return {
        productId: numericProductId,
        configProductId:
          mappedConfigProductId === null || mappedConfigProductId === undefined
            ? null
            : Number(mappedConfigProductId || 0) || null,
        industryId: Number(industry.industry_id),
      };
    }
  }
  return {
    productId: numericProductId,
    configProductId: numericProductId,
    industryId: Number(industry?.industry_id || 0) || null,
  };
}

// 0. Test DB connection
router.get(API_ROUTES.test, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.testConnectionFailed}:`, error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "数据库连接测试失败") });
  }
});

// 1. Get product categories
router.get(API_ROUTES.categories, requireAuth, async (req, res) => {
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
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "获取分类失败") });
  }
});

// 1.1 Get industries
router.get(API_ROUTES.industries, requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        industry_code as value,
        industry_name as label,
        short_name as shortName,
        sort_order as sortOrder
      FROM ht_sales_industries
      WHERE is_active = 1
      ORDER BY sort_order ASC, industry_id ASC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Fetch industries failed:", error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "获取行业列表失败") });
  }
});

// 2. Get products by category
router.get(API_ROUTES.projects, requireAuth, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const industryCode = normalizeIndustryCode(req.query.industryType || req.query.industryCode);
    let rows;
    if (industryCode) {
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
        INNER JOIN ht_sales_industries i
          ON i.industry_id = pi.industry_id
         AND i.industry_code = ?
         AND i.is_active = 1
        WHERE p.product_type_id = ?
          AND p.is_active = 1
        ORDER BY (p.sort_by IS NULL) ASC, p.sort_by ASC, p.product_model ASC
        `,
        [industryCode, categoryId]
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
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "获取产品列表失败") });
  }
});

// 3. Get component details
router.get(API_ROUTES.details, requireAuth, async (req, res) => {
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
        pic_level,
        CAST(is_active AS SIGNED) as is_required
      FROM ht_sales_product_default_config
      WHERE ${scope.whereSql}
        AND CAST(is_Assembly AS SIGNED) = 0
        AND whatkind NOT IN (?, ?)
      ORDER BY component_sn
    `, [...scope.params, DOMAIN_TERMS.craftingKind, DOMAIN_TERMS.standardPartKind]);
    (rows || []).forEach((row) => { row.image_url = buildEquipmentImageUrl(row.component_pic); });
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchDetailsFailed}:`, error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "获取组件明细失败") });
  }
});

// 4. Get annotation options
router.get(API_ROUTES.annotations, requireAuth, async (req, res) => {
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
        pic_level,
        CAST(is_Assembly AS SIGNED) as is_Assembly,
        ${ASSEMBLY_GROUP_SQL} as assembly_group
      FROM ht_sales_product_default_config
      WHERE ${scope.whereSql}
        AND CAST(is_Assembly AS SIGNED) >= 1
      ORDER BY component_sn
    `, scope.params);
    (rows || []).forEach((row) => { row.image_url = buildEquipmentImageUrl(row.component_pic); });
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchAnnotationsFailed}:`, error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "获取标注数据失败") });
  }
});

// 5. Get full config data
router.get(API_ROUTES.config, requireAuth, async (req, res) => {
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
    (rows || []).forEach((row) => { row.image_url = buildEquipmentImageUrl(row.component_pic); });
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchConfigFailed}:`, error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "获取配置数据失败") });
  }
});

// 8.2 Get product ID by product model
router.get(API_ROUTES.projectByModel, requireAuth, async (req, res) => {
  try {
    const { productModel } = req.params;
    const industryCode = normalizeIndustryCode(req.query.industryType || req.query.industryCode);
    let rows;
    if (industryCode) {
      [rows] = await pool.query(
        `
        SELECT p.product_id, p.product_model, p.product_type_id
        FROM ht_sales_products p
        INNER JOIN ht_sales_product_industry_config pi
          ON pi.product_id = p.product_id
        INNER JOIN ht_sales_industries i
          ON i.industry_id = pi.industry_id
         AND i.industry_code = ?
         AND i.is_active = 1
        WHERE p.product_model = ?
        ORDER BY p.product_id ASC
        LIMIT 1
        `,
        [industryCode, productModel]
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
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "按型号查询产品失败") });
  }
});

module.exports = router;
