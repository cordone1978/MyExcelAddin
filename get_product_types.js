const https = require('https');

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function getProductTypes() {
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
            resolve(result.data);
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
            resolve([]); // 返回空数组而不是拒绝
          }
        } catch (error) {
          resolve([]); // 出错时返回空数组
        }
      });
    });
    
    req.on('error', () => resolve([])); // 出错时返回空数组
    req.end();
  });
}

async function main() {
  try {
    console.log('正在获取产品类型数据...\n');
    
    // 获取所有产品类型
    const productTypes = await getProductTypes();
    
    console.log('产品类型列表：');
    console.log('=' .repeat(60));
    
    // 为每个产品类型获取产品型号数量
    for (const type of productTypes) {
      const products = await getProductsByCategory(type.id);
      console.log(`${type.id.toString().padStart(3)}. ${type.name.padEnd(20)} - 产品型号数量: ${products.length}`);
      
      // 如果需要显示具体的产品型号，可以取消下面的注释
      // if (products.length > 0) {
      //   products.forEach((product, index) => {
      //     console.log(`    ${index + 1}. ${product.name}${product.base_description ? ` (${product.base_description})` : ''}`);
      //   });
      // }
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log(`总计: ${productTypes.length} 个产品类型`);
    
    // 特别显示过滤器相关的产品类型
    console.log('\n过滤器相关产品类型：');
    console.log('-' .repeat(40));
    
    const filterTypes = productTypes.filter(type => 
      type.name.includes('过滤器') || 
      type.name.includes('除尘器')
    );
    
    filterTypes.forEach(type => {
      console.log(`${type.id.toString().padStart(3)}. ${type.name}`);
    });
    
  } catch (error) {
    console.error('错误:', error.message);
  }
}

main();