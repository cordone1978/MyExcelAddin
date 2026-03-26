const mysql = require('mysql2/promise');
const { DATABASE_CONFIG, ACTIVE_DB } = require("./serverConstants");

async function analyzeDiscrepancy() {
  const connection = await mysql.createConnection(DATABASE_CONFIG[ACTIVE_DB]);

  try {
    console.log('分析元信息入库与整理产品型号页面产品类型不一致的原因\n');
    console.log('=' .repeat(100));
    
    // 1. 获取标准产品类型
    const [standardTypes] = await connection.execute(`
      SELECT product_type_id as id, type_name as name
      FROM ht_sales_product_types
      WHERE is_active = 1
      ORDER BY product_type_id
    `);
    
    console.log('1. 标准产品类型表 (ht_sales_product_types):');
    console.log(`   共有 ${standardTypes.length} 个产品类型\n`);
    
    // 2. 获取仓库统计表中的产品类型（按出现频率排序）
    const [warehouseCategories] = await connection.execute(`
      SELECT category_name, COUNT(*) as count
      FROM ht_sales_warehouse_statistics
      WHERE category_name IS NOT NULL AND category_name != ''
      GROUP BY category_name
      ORDER BY count DESC
      LIMIT 50
    `);
    
    console.log('2. 仓库统计表 (ht_sales_warehouse_statistics) 中的产品类型:');
    console.log(`   共有 ${warehouseCategories.length} 个不同的 category_name\n`);
    
    // 3. 特别关注过滤器相关的类型
    console.log('3. 过滤器相关类型对比:');
    console.log('-' .repeat(80));
    
    const filterKeywords = ['过滤器', '除尘器', '过滤', '除尘'];
    
    // 标准表中的过滤器类型
    const standardFilterTypes = standardTypes.filter(t => 
      filterKeywords.some(keyword => t.name.includes(keyword))
    );
    
    console.log('   A. 标准产品类型表中的过滤器类型:');
    standardFilterTypes.forEach((type, index) => {
      console.log(`      ${index + 1}. ${type.name} (ID: ${type.id})`);
    });
    console.log();
    
    // 仓库表中的过滤器类型
    const warehouseFilterTypes = warehouseCategories.filter(cat => 
      filterKeywords.some(keyword => cat.category_name.includes(keyword))
    );
    
    console.log('   B. 仓库统计表中的过滤器类型:');
    if (warehouseFilterTypes.length > 0) {
      warehouseFilterTypes.forEach((cat, index) => {
        console.log(`      ${index + 1}. ${cat.category_name.padEnd(20)} - ${cat.count} 条记录`);
      });
    } else {
      console.log('      没有找到明确的过滤器类型');
      
      // 查找可能相关的
      console.log('\n   C. 查找可能相关的类型:');
      const [relatedTypes] = await connection.execute(`
        SELECT DISTINCT category_name
        FROM ht_sales_warehouse_statistics
        WHERE category_name LIKE '%器%' OR category_name LIKE '%机%'
        ORDER BY category_name
        LIMIT 20
      `);
      
      relatedTypes.forEach((type, index) => {
        console.log(`      ${index + 1}. ${type.category_name}`);
      });
    }
    console.log();
    
    // 4. 分析数据不一致的根本原因
    console.log('4. 数据不一致的根本原因分析:');
    console.log('-' .repeat(80));
    
    console.log('   a) 数据源完全不同:');
    console.log('      • 整理产品型号页面 → ht_sales_product_types 表');
    console.log('         - 标准化的产品类型定义');
    console.log('         - 用于产品型号管理');
    console.log('         - 通过 product_type_id 关联产品');
    console.log();
    
    console.log('      • 元信息入库页面 → ht_sales_warehouse_statistics 表');
    console.log('         - 从Excel文件导入的原始数据');
    console.log('         - category_name 字段包含各种非标准化名称');
    console.log('         - 可能包含部件、组件、工艺等分类');
    console.log();
    
    console.log('   b) 字段含义不同:');
    console.log('      • ht_sales_product_types.type_name: 标准产品类型（如"除尘器"）');
    console.log('      • ht_sales_warehouse_statistics.category_name: 原始分类（如"壳体部分"、"标准件"）');
    console.log();
    
    console.log('   c) 数据粒度不同:');
    console.log('      • 产品类型表: 产品级别分类');
    console.log('      • 仓库统计表: 部件/组件级别分类');
    console.log();
    
    // 5. 查看具体的仓库数据示例
    console.log('5. 仓库数据示例分析:');
    console.log('-' .repeat(80));
    
    // 查找包含"除尘器"的sheet
    const [dustSheets] = await connection.execute(`
      SELECT DISTINCT sheet_name, product_model
      FROM ht_sales_warehouse_statistics
      WHERE product_model LIKE '%除尘器%' OR sheet_name LIKE '%除尘器%'
      LIMIT 10
    `);
    
    console.log('   包含"除尘器"的工作表示例:');
    if (dustSheets.length > 0) {
      dustSheets.forEach((sheet, index) => {
        console.log(`      ${index + 1}. ${sheet.sheet_name} - 产品型号: ${sheet.product_model || '未知'}`);
      });
    } else {
      console.log('      没有找到包含"除尘器"的工作表');
    }
    console.log();
    
    // 6. 解决方案建议
    console.log('6. 解决方案建议:');
    console.log('-' .repeat(80));
    
    console.log('   方案一: 数据清洗和映射');
    console.log('      • 建立 category_name 到 type_name 的映射关系');
    console.log('      • 例如: "480除尘器" → "除尘器"');
    console.log('      • "标准件"、"外购件" → 特殊分类');
    console.log();
    
    console.log('   方案二: 修改元信息入库页面');
    console.log('      • 从标准产品类型表获取类型列表');
    console.log('      • 让用户选择标准类型，而不是显示原始category_name');
    console.log();
    
    console.log('   方案三: 统一数据源');
    console.log('      • 修改仓库数据导入流程，使用标准产品类型');
    console.log('      • 在导入时进行类型匹配和标准化');
    console.log();
    
    // 7. 验证映射关系
    console.log('7. 验证可能的映射关系:');
    console.log('-' .repeat(80));
    
    // 查找可能映射到标准类型的仓库分类
    const potentialMappings = [];
    
    for (const stdType of standardFilterTypes) {
      const [matchingCats] = await connection.execute(`
        SELECT DISTINCT category_name, COUNT(*) as count
        FROM ht_sales_warehouse_statistics
        WHERE category_name LIKE ?
        GROUP BY category_name
        ORDER BY count DESC
        LIMIT 5
      `, [`%${stdType.name}%`]);
      
      if (matchingCats.length > 0) {
        potentialMappings.push({
          standardType: stdType.name,
          warehouseCategories: matchingCats
        });
      }
    }
    
    if (potentialMappings.length > 0) {
      potentialMappings.forEach(mapping => {
        console.log(`   标准类型: ${mapping.standardType}`);
        mapping.warehouseCategories.forEach(cat => {
          console.log(`     → ${cat.category_name} (${cat.count} 条记录)`);
        });
        console.log();
      });
    } else {
      console.log('   没有找到直接的映射关系');
    }
    
  } catch (error) {
    console.error('分析错误:', error.message);
  } finally {
    await connection.end();
  }
}

analyzeDiscrepancy();
