const mysql = require('mysql2/promise');
const { DATABASE_CONFIG, ACTIVE_DB } = require("./serverConstants");

async function checkWarehouseData() {
  const connection = await mysql.createConnection(DATABASE_CONFIG[ACTIVE_DB]);

  try {
    console.log('检查仓库相关表的数据...\n');
    
    // 1. 检查表是否存在
    const [tables] = await connection.execute(`
      SHOW TABLES LIKE 'ht_sales_warehouse_%'
    `);
    
    console.log('1. 仓库相关表:');
    tables.forEach(table => {
      const tableName = Object.values(table)[0];
      console.log(`   - ${tableName}`);
    });
    console.log();
    
    // 2. 检查ht_sales_warehouse_statistics表结构
    console.log('2. ht_sales_warehouse_statistics表结构:');
    const [statsColumns] = await connection.execute(`
      DESCRIBE ht_sales_warehouse_statistics
    `);
    
    statsColumns.forEach(col => {
      console.log(`   ${col.Field.padEnd(25)} ${col.Type.padEnd(20)} ${col.Null} ${col.Key}`);
    });
    console.log();
    
    // 3. 检查表中的数据
    console.log('3. 表中的数据统计:');
    
    // 检查统计表
    const [statsCount] = await connection.execute(`
      SELECT COUNT(*) as count FROM ht_sales_warehouse_statistics
    `);
    console.log(`   ht_sales_warehouse_statistics: ${statsCount[0].count} 条记录`);
    
    // 检查元数据表
    const [metaCount] = await connection.execute(`
      SELECT COUNT(*) as count FROM ht_sales_warehouse_sheet_meta
    `);
    console.log(`   ht_sales_warehouse_sheet_meta: ${metaCount[0].count} 条记录`);
    console.log();
    
    // 4. 查看统计表中的产品类型数据
    if (statsCount[0].count > 0) {
      console.log('4. 统计表中的产品类型示例:');
      
      // 查看不同的category_name
      const [categories] = await connection.execute(`
        SELECT DISTINCT category_name, COUNT(*) as count
        FROM ht_sales_warehouse_statistics
        WHERE category_name IS NOT NULL AND category_name != ''
        GROUP BY category_name
        ORDER BY count DESC
        LIMIT 20
      `);
      
      if (categories.length > 0) {
        categories.forEach((cat, index) => {
          console.log(`   ${(index + 1).toString().padStart(3)}. ${cat.category_name.padEnd(20)} - ${cat.count} 条记录`);
        });
      } else {
        console.log('   表中没有category_name数据');
        
        // 查看其他可能的字段
        console.log('\n   查看其他字段示例:');
        const [sampleRows] = await connection.execute(`
          SELECT * FROM ht_sales_warehouse_statistics
          LIMIT 3
        `);
        
        if (sampleRows.length > 0) {
          console.log('   第一条记录字段:');
          Object.keys(sampleRows[0]).forEach(key => {
            console.log(`      ${key}: ${sampleRows[0][key]}`);
          });
        }
      }
    }
    
    // 5. 对比标准产品类型表
    console.log('\n5. 与标准产品类型表对比:');
    
    const [standardTypes] = await connection.execute(`
      SELECT type_name FROM ht_sales_product_types
      WHERE is_active = 1
      ORDER BY product_type_id
    `);
    
    console.log(`   标准产品类型表有 ${standardTypes.length} 个类型`);
    
    if (statsCount[0].count > 0) {
      const [warehouseTypes] = await connection.execute(`
        SELECT DISTINCT category_name FROM ht_sales_warehouse_statistics
        WHERE category_name IS NOT NULL AND category_name != ''
      `);
      
      console.log(`   仓库统计表有 ${warehouseTypes.length} 个不同的category_name`);
      
      // 找出匹配和不匹配的
      const standardTypeSet = new Set(standardTypes.map(t => t.type_name));
      const warehouseTypeSet = new Set(warehouseTypes.map(t => t.category_name));
      
      const matchingTypes = Array.from(warehouseTypeSet).filter(t => standardTypeSet.has(t));
      const nonMatchingTypes = Array.from(warehouseTypeSet).filter(t => !standardTypeSet.has(t));
      
      console.log(`   匹配的类型: ${matchingTypes.length} 个`);
      console.log(`   不匹配的类型: ${nonMatchingTypes.length} 个`);
      
      if (nonMatchingTypes.length > 0) {
        console.log('\n   不匹配的类型示例:');
        nonMatchingTypes.slice(0, 10).forEach((type, index) => {
          console.log(`     ${index + 1}. ${type}`);
        });
      }
    }
    
  } catch (error) {
    console.error('数据库查询错误:', error.message);
  } finally {
    await connection.end();
  }
}

checkWarehouseData();
