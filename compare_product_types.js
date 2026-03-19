const https = require('https');

const agent = new https.Agent({
  rejectUnauthorized: false
});

// 1. 获取标准产品类型（从ht_sales_product_types表）
async function getStandardProductTypes() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://localhost:3001/api/categories', { agent }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            resolve(result.data.map(item => ({
              id: item.id,
              name: item.name,
              source: '标准产品类型表'
            })));
          } else {
            reject(new Error(result.error || 'Failed to get product types'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

// 2. 获取仓库统计中的产品类型（从ht_sales_warehouse_statistics表）
async function getWarehouseProductTypes() {
  return new Promise((resolve, reject) => {
    // 搜索一个通用关键词来获取仓库数据
    const req = https.get('https://localhost:3001/api/warehouse-clean-search?keyword=过滤器&limit=50&detailLimit=100', { agent }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            const rows = result.data || [];
            // 从仓库数据中提取产品类型
            const productTypes = new Map();
            
            rows.forEach(row => {
              // 尝试从不同字段提取产品类型
              const possibleFields = [
                'category_name',
                'category',
                '产品类型',
                'type_name',
                'system_name',
                '系统'
              ];
              
              for (const field of possibleFields) {
                const value = row[field];
                if (value && typeof value === 'string' && value.trim()) {
                  const typeName = value.trim();
                  if (!productTypes.has(typeName)) {
                    productTypes.set(typeName, {
                      name: typeName,
                      source: '仓库统计表',
                      field: field,
                      count: 1
                    });
                  } else {
                    productTypes.get(typeName).count++;
                  }
                  break;
                }
              }
            });
            
            resolve(Array.from(productTypes.values()));
          } else {
            resolve([]); // 返回空数组而不是拒绝
          }
        } catch (error) {
          resolve([]); // 出错时返回空数组
        }
      });
    });
    
    req.on('error', () => resolve([]));
    req.end();
  });
}

// 3. 获取所有仓库数据中的产品类型（更全面的搜索）
async function getAllWarehouseProductTypes() {
  const searchKeywords = ['', '仓', '器', '机', '过滤器', '除尘器'];
  const allTypes = new Map();
  
  for (const keyword of searchKeywords) {
    const types = await getWarehouseProductTypesByKeyword(keyword);
    types.forEach(type => {
      if (!allTypes.has(type.name)) {
        allTypes.set(type.name, type);
      } else {
        // 合并计数
        allTypes.get(type.name).count += type.count;
      }
    });
  }
  
  return Array.from(allTypes.values());
}

async function getWarehouseProductTypesByKeyword(keyword) {
  return new Promise((resolve, reject) => {
    const url = keyword ? 
      `https://localhost:3001/api/warehouse-clean-search?keyword=${encodeURIComponent(keyword)}&limit=30&detailLimit=200` :
      'https://localhost:3001/api/warehouse-clean-search?limit=30&detailLimit=200';
    
    const req = https.get(url, { agent }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            const rows = result.data || [];
            const productTypes = new Map();
            
            rows.forEach(row => {
              // 从category_name字段提取产品类型
              const categoryName = row.category_name;
              if (categoryName && typeof categoryName === 'string' && categoryName.trim()) {
                const typeName = categoryName.trim();
                if (!productTypes.has(typeName)) {
                  productTypes.set(typeName, {
                    name: typeName,
                    source: '仓库统计表',
                    field: 'category_name',
                    count: 1
                  });
                } else {
                  productTypes.get(typeName).count++;
                }
              }
            });
            
            resolve(Array.from(productTypes.values()));
          } else {
            resolve([]);
          }
        } catch (error) {
          resolve([]);
        }
      });
    });
    
    req.on('error', () => resolve([]));
    req.end();
  });
}

async function main() {
  console.log('对比分析：元信息入库 vs 整理产品型号页面的产品类型\n');
  console.log('=' .repeat(80));
  
  try {
    // 获取标准产品类型
    console.log('1. 获取标准产品类型（整理产品型号页面使用）...');
    const standardTypes = await getStandardProductTypes();
    console.log(`   从 ht_sales_product_types 表获取到 ${standardTypes.length} 个产品类型\n`);
    
    // 获取仓库中的产品类型
    console.log('2. 获取仓库统计中的产品类型（元信息入库使用）...');
    const warehouseTypes = await getAllWarehouseProductTypes();
    console.log(`   从 ht_sales_warehouse_statistics 表获取到 ${warehouseTypes.length} 个产品类型\n`);
    
    // 对比分析
    console.log('3. 数据对比分析：');
    console.log('-' .repeat(80));
    
    // 创建名称映射
    const standardTypeNames = new Set(standardTypes.map(t => t.name));
    const warehouseTypeNames = new Set(warehouseTypes.map(t => t.name));
    
    // 找出只在标准表中的类型
    const onlyInStandard = standardTypes.filter(t => !warehouseTypeNames.has(t.name));
    console.log(`   A. 只在标准产品类型表中存在的类型 (${onlyInStandard.length}个):`);
    if (onlyInStandard.length > 0) {
      onlyInStandard.forEach((type, index) => {
        console.log(`      ${index + 1}. ${type.name}`);
      });
    } else {
      console.log('      无');
    }
    console.log();
    
    // 找出只在仓库表中的类型
    const onlyInWarehouse = warehouseTypes.filter(t => !standardTypeNames.has(t.name));
    console.log(`   B. 只在仓库统计表中存在的类型 (${onlyInWarehouse.length}个):`);
    if (onlyInWarehouse.length > 0) {
      onlyInWarehouse.forEach((type, index) => {
        console.log(`      ${index + 1}. ${type.name} (出现次数: ${type.count})`);
      });
    } else {
      console.log('      无');
    }
    console.log();
    
    // 找出共同存在的类型
    const commonTypes = standardTypes.filter(t => warehouseTypeNames.has(t.name));
    console.log(`   C. 在两个表中都存在的类型 (${commonTypes.length}个):`);
    if (commonTypes.length > 0) {
      commonTypes.forEach((type, index) => {
        const warehouseType = warehouseTypes.find(t => t.name === type.name);
        console.log(`      ${index + 1}. ${type.name} (仓库中出现次数: ${warehouseType?.count || 0})`);
      });
    } else {
      console.log('      无');
    }
    console.log();
    
    // 特别关注过滤器相关的类型
    console.log('4. 过滤器相关产品类型对比：');
    console.log('-' .repeat(80));
    
    const filterKeywords = ['过滤器', '除尘器', '过滤', '除尘'];
    
    const standardFilterTypes = standardTypes.filter(t => 
      filterKeywords.some(keyword => t.name.includes(keyword))
    );
    
    const warehouseFilterTypes = warehouseTypes.filter(t => 
      filterKeywords.some(keyword => t.name.includes(keyword))
    );
    
    console.log('   标准产品类型表中的过滤器相关类型:');
    standardFilterTypes.forEach((type, index) => {
      console.log(`      ${index + 1}. ${type.name}`);
    });
    if (standardFilterTypes.length === 0) console.log('      无');
    console.log();
    
    console.log('   仓库统计表中的过滤器相关类型:');
    warehouseFilterTypes.forEach((type, index) => {
      console.log(`      ${index + 1}. ${type.name} (出现次数: ${type.count})`);
    });
    if (warehouseFilterTypes.length === 0) console.log('      无');
    console.log();
    
    // 总结
    console.log('5. 问题分析总结：');
    console.log('-' .repeat(80));
    console.log('   不一致的原因可能包括：');
    console.log('   a) 数据源不同：');
    console.log('      - 整理产品型号页面 → ht_sales_product_types 表');
    console.log('      - 元信息入库页面 → ht_sales_warehouse_statistics 表');
    console.log('   b) 数据同步问题：两个表之间的数据没有同步更新');
    console.log('   c) 字段映射问题：仓库表中的 category_name 字段与标准类型名称不一致');
    console.log('   d) 数据清洗问题：仓库数据可能包含非标准化的类型名称');
    
  } catch (error) {
    console.error('错误:', error.message);
  }
}

main();