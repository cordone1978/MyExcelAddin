const { Router } = require('express');
const { pool } = require('../lib/db');
const { requireAuth, buildSafeErrorMessage } = require('../lib/authService');
const { API_ROUTES, SERVER_LOGS, SERVER_MESSAGES } = require('../serverConstants');

const router = Router();

const MAX_SEARCH_KEYWORD_LENGTH = 100;

function sanitizeKeyword(rawValue) {
  return String(rawValue || "").trim().slice(0, MAX_SEARCH_KEYWORD_LENGTH);
}

// 8.3 Price search
router.get(API_ROUTES.priceSearch, requireAuth, async (req, res) => {
  try {
    const keyword = sanitizeKeyword(req.query.keyword);
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
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "价格查询失败") });
  }
});

// 8.31 Warehouse statistics fuzzy search
router.get(API_ROUTES.warehouseCleanSearch, requireAuth, async (req, res) => {
  try {
    const keyword = sanitizeKeyword(req.query.keyword);
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
      WHERE device_name LIKE ?
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
        id, source_file, sheet_name, row_index, key_param,
        category_name, content_spec, model_name, brand_name, material_name,
        skip_spec_columns, weight_kg, category_amount, price_ratio,
        category_row_count, quantity_value,
        sheet_total_weight_kg, sheet_total_amount, sheet_total_row_count
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
        m.sheet_name, m.project_name, m.project_code, m.device_name,
        m.device_drawing_no, m.tag_no, m.order_qty, m.order_unit,
        m.surface_process, m.vendor_name
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
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "仓库数据查询失败") });
  }
});

// 9. Get product type to system mapping
router.get(API_ROUTES.systemMapping, requireAuth, async (req, res) => {
  try {
    const { typeName } = req.params;
    const [rows] = await pool.query(`
      SELECT DISTINCT system_name, type_name
      FROM v_system_config_simple
      WHERE type_name = ?
      LIMIT 1
    `, [typeName]);

    if (rows.length > 0) {
      res.json({ success: true, data: { typeName: rows[0].type_name, systemName: rows[0].system_name } });
    } else {
      res.json({ success: false, message: SERVER_MESSAGES.systemMappingNotFound });
    }
  } catch (error) {
    console.error(`${SERVER_LOGS.querySystemMappingFailed}:`, error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "查询系统映射失败") });
  }
});

module.exports = router;
