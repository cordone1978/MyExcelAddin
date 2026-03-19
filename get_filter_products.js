const https = require('https');

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function getProductsByCategory(categoryId) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://localhost:3001/api/projects/${categoryId}`, { agent }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            resolve(result.data);
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
  console.log('过滤器相关产品类型详细数据：\n');
  
  // 过滤器相关的产品类型ID和名称
  const filterTypes = [
    { id: 16, name: '除尘器' },
    { id: 17, name: '二次过滤器' },
    { id: 18, name: '初效过滤器' },
    { id: 19, name: '中效过滤器' },
    { id: 20, name: '仓顶除尘器' }
  ];
  
  for (const type of filterTypes) {
    console.log(`产品类型: ${type.name} (ID: ${type.id})`);
    console.log('-' .repeat(50));
    
    const products = await getProductsByCategory(type.id);
    
    if (products.length === 0) {
      console.log('  暂无产品型号\n');
    } else {
      products.forEach((product, index) => {
        console.log(`  ${(index + 1).toString().padStart(2)}. ${product.name}${product.base_description ? ` - ${product.base_description}` : ''}`);
      });
      console.log(`  总计: ${products.length} 个产品型号\n`);
    }
  }
  
  // 特别显示"2025年过滤器成本汇总表"可能涉及的产品类型
  console.log('\n可能涉及"2025年过滤器成本汇总表"的产品类型分析：');
  console.log('=' .repeat(60));
  
  const possibleFilterTypes = [
    { id: 16, name: '除尘器', count: 16 },
    { id: 17, name: '二次过滤器', count: 1 },
    { id: 20, name: '仓顶除尘器', count: 7 }
  ];
  
  console.log('根据现有数据，以下产品类型可能有相关成本数据：\n');
  
  possibleFilterTypes.forEach(type => {
    console.log(`${type.name.padEnd(15)}: ${type.count} 个产品型号`);
  });
  
  console.log('\n建议：');
  console.log('1. 检查"2025年过滤器成本汇总表.xlsx"文件中的产品型号');
  console.log('2. 匹配上述产品类型中的产品型号');
  console.log('3. 在"整理产品型号"页面中查看对应的产品类型数据');
}

main();