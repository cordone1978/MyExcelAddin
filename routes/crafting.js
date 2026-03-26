const { Router } = require('express');
const { pool } = require('../lib/db');
const { requireAuth, buildSafeErrorMessage } = require('../lib/authService');
const { API_ROUTES, DOMAIN_TERMS, SERVER_LOGS } = require('../serverConstants');

const router = Router();

const CRAFT_AREA_SLOTS = 6;

// 6. Get crafting config
router.get(API_ROUTES.crafting, requireAuth, async (req, res) => {
  try {
    const { componentId } = req.params;
    const [mappedRows] = await pool.query(`
      SELECT
        map.component_id,
        m.material_name
      FROM ht_sales_component_craft_map map
      INNER JOIN ht_sales_materials m
        ON m.material_id = map.craft_id
       AND m.material_type = '工艺'
       AND m.is_active = 1
      WHERE map.component_id = ?
      ORDER BY m.sort_order ASC, m.material_id ASC
    `, [componentId]);

    const synthesized = {
      component_id: Number(componentId || 0),
      MaterialsPrice: null,
      InnerArea1: null, InnerArea2: null, InnerArea3: null,
      OutterArea1: null, OutterArea2: null, OutterArea3: null,
      InnerCraftType1: null, InnerCraftType2: null, InnerCraftType3: null,
      OutterCraftType1: null, OutterCraftType2: null, OutterCraftType3: null,
    };
    (mappedRows || []).slice(0, CRAFT_AREA_SLOTS).forEach((row, index) => {
      const slot = index < 3 ? `InnerCraftType${index + 1}` : `OutterCraftType${index - 2}`;
      synthesized[slot] = String(row.material_name || "").trim() || null;
    });

    const rows = mappedRows.length ? [synthesized] : [];
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchCraftingFailed}:`, error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "获取工艺配置失败") });
  }
});

// 7. Get material config
router.get(API_ROUTES.materials, requireAuth, async (req, res) => {
  try {
    const { componentId } = req.params;
    let [rows] = await pool.query(`
      SELECT
        material_id,
        product_id,
        component_id,
        material_type,
        totalprice
      FROM ht_sales_config_materials
      WHERE component_id = ?
    `, [componentId]);

    if (!rows.length) {
      [rows] = await pool.query(`
        SELECT
          m.material_id,
          c.product_id,
          c.config_id AS component_id,
          m.material_name AS material_type,
          m.material_unitprice AS totalprice
        FROM ht_sales_product_default_config c
        INNER JOIN ht_sales_materials m
          ON m.material_id = c.material_id
         AND m.material_type = '材料'
         AND m.is_active = 1
        WHERE c.config_id = ?
        LIMIT 1
      `, [componentId]);
    }
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchMaterialsFailed}:`, error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "获取材料配置失败") });
  }
});

// 7.1 Get component craft mappings
router.get(API_ROUTES.componentCrafts, requireAuth, async (req, res) => {
  try {
    const { componentId } = req.params;
    const [rows] = await pool.query(
      `
      SELECT
        map.component_id,
        map.craft_id,
        m.material_name AS craft_name,
        m.material_unit AS craft_unit,
        m.material_unitprice AS craft_price
      FROM ht_sales_component_craft_map map
      INNER JOIN ht_sales_materials m
        ON m.material_id = map.craft_id
       AND m.material_type = '工艺'
       AND m.is_active = 1
      WHERE map.component_id = ?
      ORDER BY m.sort_order ASC, m.material_id ASC
      `,
      [componentId]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Fetch component crafts failed:", error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "获取组件工艺映射失败") });
  }
});

// 8. Get system list
router.get(API_ROUTES.systems, requireAuth, async (req, res) => {
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
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "获取系统列表失败") });
  }
});

// 8.1 Get craft price options
router.get(API_ROUTES.craftPrices, requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT
        material_name,
        material_unitprice
      FROM ht_sales_materials
      WHERE material_type = ?
        AND is_active = 1
      ORDER BY material_name
    `, [DOMAIN_TERMS.craftingKind]);

    const data = rows.map((row) => {
      const name = row.material_name || DOMAIN_TERMS.unknownCrafting;
      const price = Number(row.material_unitprice || 0);
      return {
        craftType: name,
        price,
        label: `${name}${DOMAIN_TERMS.craftLabelSeparator}${DOMAIN_TERMS.rmbSymbol} ${price}`,
      };
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error(`${SERVER_LOGS.fetchCraftPricesFailed}:`, error);
    res.status(500).json({ success: false, error: buildSafeErrorMessage(error, "获取工艺价格失败") });
  }
});

module.exports = router;
