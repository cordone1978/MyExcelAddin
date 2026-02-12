const fs = require('fs');
const https = require('https');
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();

// ==================== 数据库配置 ====================
const DATABASE_CONFIG = {
  // 本机数据库
  localhost: {
    host: 'localhost',
    user: 'root',
    password: 'Livsun24',
    database: 'quotation'
  },
  // 公司数据库
  company: {
    host: '192.168.1.79',
    user: 'root',
    password: 'ipanel',
    database: 'quotation'
  }
};

// 选择要使用的数据库配置：'localhost' 或 'company'
const ACTIVE_DB = 'localhost';

// ==================== 中间件配置 ====================
app.use(cors());
app.use(express.json());

// MySQL 连接池
const pool = mysql.createPool({
  ...DATABASE_CONFIG[ACTIVE_DB],
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 导出配置供其他模块使用
module.exports.DATABASE_CONFIG = DATABASE_CONFIG;
module.exports.ACTIVE_DB = ACTIVE_DB;

// ==================== API 路由（必须在静态文件之前）====================

// 0. 测试连接
app.get('/api/test', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('❌ 测试连接失败:', error);
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
    console.error('❌ 获取产品类型失败:', error);
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
    console.error('❌ 获取产品型号失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. 获取组件详细信息
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
    console.error('❌ 获取组件详细信息失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. 获取标注选项
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
    console.error('❌ 获取标注选项失败:', error);
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
    console.error('❌ 获取完整配置数据失败:', error);
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
    console.error('❌ 获取表面处理配置失败:', error);
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
    console.error('❌ 获取材料配置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. 获取系统列表（用于报价汇总表）
app.get('/api/systems', async (req, res) => {
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
    console.error('❌ 获取系统列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8.1 获取工艺单价列表（用于表面工艺下拉）
app.get('/api/craft-prices', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT
        material_name,
        material_unitprice
      FROM ht_sales_materials
      WHERE material_type = '工艺'
      ORDER BY material_name
    `);

    const data = rows.map((row) => {
      const name = row.material_name || "未知工艺";
      const price = Number(row.material_unitprice || 0);
      return {
        craftType: name,
        price,
        label: `${name} -- ￥, ${price}`
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('获取工艺单价列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8.2 根据产品型号获取产品ID（用于更改设备/工艺）
app.get('/api/project-by-model/:productModel', async (req, res) => {
  try {
    const { productModel } = req.params;
    const [rows] = await pool.query(`
      SELECT product_id, product_model, product_type_id
      FROM ht_sales_products
      WHERE product_model = ?
      LIMIT 1
    `, [productModel]);

    if (rows.length === 0) {
      res.json({ success: false, message: '未找到对应产品型号' });
      return;
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('获取产品ID失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8.3 价格查询（用于外购件查询价格）
app.get('/api/price-search', async (req, res) => {
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
    console.error('价格查询失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. 获取产品类型到系统的映射关系
app.get('/api/system-mapping/:typeName', async (req, res) => {
  try {
    const { typeName } = req.params;

    console.log('🔍 查询系统映射 - 产品类型:', typeName);

    const [rows] = await pool.query(`
      SELECT DISTINCT
        system_name,
        type_name
      FROM v_system_config_simple
      WHERE type_name = ?
      LIMIT 1
    `, [typeName]);

    console.log('📋 查询结果:', rows);

    if (rows.length > 0) {
      console.log('✅ 找到映射:', rows[0].system_name);
      res.json({
        success: true,
        data: {
          typeName: rows[0].type_name,
          systemName: rows[0].system_name
        }
      });
    } else {
      console.log('⚠️ 未找到映射');
      res.json({
        success: false,
        message: '未找到对应的系统映射'
      });
    }
  } catch (error) {
    console.error('❌ 查询系统映射失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 静态文件服务（必须在 API 之后）====================
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));

// ==================== HTTPS 服务器 ====================

// 读取 SSL 证书
const httpsOptions = {
  key: fs.readFileSync('./localhost+2-key.pem'),
  cert: fs.readFileSync('./localhost+2.pem')
};

// 启动 HTTPS 服务器
const PORT = 3001;
https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log('========================================');
  console.log(`✅ HTTPS 服务运行在 https://localhost:${PORT}`);
  console.log('🔒 SSL 证书已加载');
  console.log('========================================');
  console.log('📍 API 端点:');
  console.log(`   测试:       https://localhost:${PORT}/api/test`);
  console.log(`   分类:       https://localhost:${PORT}/api/categories`);
  console.log(`   配置数据:   https://localhost:${PORT}/api/config/:projectId`);
  console.log(`   系统映射:   https://localhost:${PORT}/api/system-mapping/:productModel`);
  console.log(`   图片服务:   https://localhost:${PORT}/public/images/`);
  console.log(`   静态文件:   https://localhost:${PORT}/`);
  console.log('========================================');
  console.log('💡 示例:');
  console.log(`   https://localhost:${PORT}/api/system-mapping/暂存仓（2000L）`);
  console.log('========================================');
});
