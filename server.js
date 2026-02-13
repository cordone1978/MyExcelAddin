const fs = require('fs');
const https = require('https');
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

// Export active DB config for external modules
module.exports.DATABASE_CONFIG = DATABASE_CONFIG;
module.exports.ACTIVE_DB = ACTIVE_DB;

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
    
    const [rows] = await pool.query(`
      SELECT 
        product_id as id,
        product_model as name,
        '' as image_url
      FROM ht_sales_products
      WHERE product_type_id = ? AND is_active = 1
      ORDER BY product_model
    `, [categoryId]);
    
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
    
    const [rows] = await pool.query(`
      SELECT 
        config_id as id,
        component_name as name,
        component_pic,
        component_sn,
        CAST(is_active AS SIGNED) as is_required,
        CASE 
          WHEN component_pic IS NOT NULL AND component_pic != '' 
          THEN CONCAT('${URLS.imageBase}', component_pic, '.png')
          ELSE NULL
        END as image_url
      FROM ht_sales_product_default_config
      WHERE product_id = ?
        AND CAST(is_Assembly AS SIGNED) = 0
        AND whatkind NOT IN (?, ?)
      ORDER BY component_sn
    `, [projectId, DOMAIN_TERMS.craftingKind, DOMAIN_TERMS.standardPartKind]);
    
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
    
    const [rows] = await pool.query(`
      SELECT 
        config_id as id,
        component_name as name,
        component_pic,
        pic_level as position_x,
        NULL as position_y,
        CASE 
          WHEN component_pic IS NOT NULL AND component_pic != '' 
          THEN CONCAT('${URLS.imageBase}', component_pic, '.png')
          ELSE NULL
        END as image_url
      FROM ht_sales_product_default_config
      WHERE product_id = ?
        AND CAST(is_Assembly AS SIGNED) = 1
      ORDER BY component_sn
    `, [projectId]);
    
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
        CAST(is_Assembly AS SIGNED) as is_Assembly
      FROM ht_sales_product_default_config
      WHERE product_id = ?
      ORDER BY component_sn
    `, [projectId]);
    
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
    const [rows] = await pool.query(`
      SELECT product_id, product_model, product_type_id
      FROM ht_sales_products
      WHERE product_model = ?
      LIMIT 1
    `, [productModel]);

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

// 9. Get product type to system mapping
app.get(API_ROUTES.systemMapping, async (req, res) => {
  try {
    const { typeName } = req.params;

    console.log(`${SERVER_LOGS.querySystemMapping}:`, typeName);

    const [rows] = await pool.query(`
      SELECT DISTINCT
        system_name,
        type_name
      FROM v_system_config_simple
      WHERE type_name = ?
      LIMIT 1
    `, [typeName]);

    console.log(`${SERVER_LOGS.querySystemMappingResult}:`, rows);

    if (rows.length > 0) {
      console.log(`${SERVER_LOGS.foundSystemMapping}:`, rows[0].system_name);
      res.json({
        success: true,
        data: {
          typeName: rows[0].type_name,
          systemName: rows[0].system_name
        }
      });
    } else {
      console.log(SERVER_MESSAGES.systemMappingNotFound);
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

// Static file serving (must be after API routes)
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));

// HTTPS server

// Read SSL certificates from parent directory
const certBaseDir = path.resolve(__dirname, "..");
const certKeyPath = path.join(certBaseDir, SERVER_CONFIG.certKeyFile);
const certPemPath = path.join(certBaseDir, SERVER_CONFIG.certPemFile);

if (!fs.existsSync(certKeyPath) || !fs.existsSync(certPemPath)) {
  console.error(SERVER_LOGS.sslCertMissing);
  console.error(`   ${certBaseDir}`);
  console.error(`   ${SERVER_LOGS.sslCertRequiredFiles}`);
  process.exit(1);
}

const httpsOptions = {
  key: fs.readFileSync(certKeyPath),
  cert: fs.readFileSync(certPemPath)
};

// Start HTTPS server
const PORT = SERVER_CONFIG.port;
https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(SERVER_LOGS.startupDivider);
  console.log(`${SERVER_LOGS.startupServerRunning} ${URLS.serverOrigin}`);
  console.log(SERVER_LOGS.startupSslLoaded);
  console.log(SERVER_LOGS.startupDivider);
  console.log(SERVER_LOGS.startupApiEndpoints);
  console.log(`   ${SERVER_LOGS.startupApiTest}: ${URLS.serverOrigin}/api/test`);
  console.log(`   ${SERVER_LOGS.startupApiCategories}: ${URLS.serverOrigin}/api/categories`);
  console.log(`   ${SERVER_LOGS.startupApiConfig}: ${URLS.serverOrigin}/api/config/:projectId`);
  console.log(`   ${SERVER_LOGS.startupApiSystemMapping}: ${URLS.serverOrigin}/api/system-mapping/:productModel`);
  console.log(`   ${SERVER_LOGS.startupApiImages}: ${URLS.serverOrigin}/public/images/`);
  console.log(`   ${SERVER_LOGS.startupApiStatic}: ${URLS.serverOrigin}/`);
  console.log(SERVER_LOGS.startupDivider);
  console.log(`${SERVER_LOGS.startupExample}: ${URLS.serverOrigin}/api/system-mapping/demo`);
  console.log(SERVER_LOGS.startupDivider);
});



