const fs = require('fs');
const https = require('https');
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
// 提供 dist 目录（Webpack 编译后的文件）
app.use(express.static(path.join(__dirname, 'dist')));

// MySQL 连接池
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Livsun24',
  database: 'quotation',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 测试连接
app.get('/api/test', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 1. 获取产品类型列表
app.get('/api/categories', async (req, res) => {
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. 获取某个类型下的产品型号列表
app.get('/api/projects/:categoryId', async (req, res) => {
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. 获取组件详细信息（添加 component_pic 和 image_url）
app.get('/api/details/:projectId', async (req, res) => {
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
          THEN CONCAT('https://localhost:3001/public/images/', component_pic, '.png')
          ELSE NULL
        END as image_url
      FROM ht_sales_product_default_config
      WHERE product_id = ?
        AND CAST(is_Assembly AS SIGNED) = 0
        AND whatkind NOT IN ('工艺', '标准件')
      ORDER BY component_sn
    `, [projectId]);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. 获取标注选项（添加 component_pic 和 image_url）
app.get('/api/annotations/:projectId', async (req, res) => {
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
          THEN CONCAT('https://localhost:3001/public/images/', component_pic, '.png')
          ELSE NULL
        END as image_url
      FROM ht_sales_product_default_config
      WHERE product_id = ?
        AND CAST(is_Assembly AS SIGNED) = 1
      ORDER BY component_sn
    `, [projectId]);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. 获取完整配置数据
app.get('/api/config/:projectId', async (req, res) => {
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. 获取表面处理配置
app.get('/api/crafting/:componentId', async (req, res) => {
  try {
    const { componentId } = req.params;
    
    const [rows] = await pool.query(`
      SELECT * FROM ht_sales_config_crafting
      WHERE component_id = ?
    `, [componentId]);
    
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. 获取材料配置
app.get('/api/materials/:componentId', async (req, res) => {
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== HTTPS 服务器 ====================

// 读取证书
const httpsOptions = {
    key: fs.readFileSync('./localhost+2-key.pem'),
    cert: fs.readFileSync('./localhost+2.pem')
};

// 启动 HTTPS 服务器（← 这里是关键修改）
const PORT = 3001;
https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log('========================================');
  console.log(`✅ HTTPS 服务运行在 https://localhost:${PORT}`);
  console.log('🔒 SSL 证书已加载');
  console.log('========================================');
  console.log('📍 API 端点:');
  console.log(`   测试: https://localhost:${PORT}/api/test`);
  console.log(`   分类: https://localhost:${PORT}/api/categories`);
  console.log(`   图片: https://localhost:${PORT}/public/images/`);
  console.log('========================================');
});