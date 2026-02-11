/**
 * 数据库结构导出脚本
 * 用于导出数据库表和视图的结构信息，生成 Markdown 文档
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

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
const ACTIVE_DB = 'company';

// ==================== 文档输出目录 ====================
const DOCS_DIR = path.join(__dirname, '../docs/database');

// ==================== 工具函数 ====================

/**
 * 格式化字段类型为可读形式
 */
function formatFieldType(fieldType) {
  return fieldType.replace(/unsigned|zerofill/gi, '').trim();
}

/**
 * 格式化字段默认值
 */
function formatDefaultValue(defaultValue, extra) {
  if (defaultValue === null) return 'NULL';
  if (defaultValue === 'CURRENT_TIMESTAMP') return 'CURRENT_TIMESTAMP';
  if (extra && extra.includes('auto_increment')) return 'AUTO_INCREMENT';
  return `'${defaultValue}'`;
}

/**
 * 生成表格的 Markdown 文档
 */
async function generateTableDoc(connection, tableName) {
  // 获取表结构
  const [columns] = await connection.query(`
    SELECT
      COLUMN_NAME as Field,
      COLUMN_TYPE as Type,
      IS_NULLABLE as \`Null\`,
      COLUMN_KEY as \`Key\`,
      COLUMN_DEFAULT as \`Default\`,
      EXTRA as Extra,
      COLUMN_COMMENT as Comment
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
  `, [tableName]);

  // 获取表注释
  const [tableInfo] = await connection.query(`
    SELECT TABLE_COMMENT, ENGINE, TABLE_COLLATION
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
  `, [tableName]);

  const comment = tableInfo[0]?.TABLE_COMMENT || '';
  const engine = tableInfo[0]?.ENGINE || 'InnoDB';
  const collation = tableInfo[0]?.TABLE_COLLATION || '';

  // 获取索引信息
  const [indexes] = await connection.query(`
    SELECT
      INDEX_NAME as Key_name,
      GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as Column_name,
      NON_UNIQUE as Non_unique,
      INDEX_TYPE as Index_type
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE
  `, [tableName]);

  // 生成 Markdown
  let markdown = `# 表名：${tableName}\n\n`;

  // 基本信息
  markdown += `## 基本信息\n`;
  markdown += `- **表用途**：${comment || '暂无说明'}\n`;
  markdown += `- **引擎**：${engine}\n`;
  markdown += `- **字符集**：${collation}\n\n`;

  // 字段说明
  markdown += `## 字段说明\n\n`;
  markdown += `| 字段名 | 类型 | NULL | 键 | 默认值 | 额外 | 说明 |\n`;
  markdown += `|--------|------|------|-----|--------|------|------|\n`;

  columns.forEach(col => {
    const field = col.Field;
    const type = formatFieldType(col.Type);
    const nullable = col.Null === 'YES' ? '是' : '否';
    const key = col.Key || '';
    const defaultVal = formatDefaultValue(col.Default, col.Extra);
    const extra = col.Extra || '';
    const comment = col.Comment || '';

    markdown += `| ${field} | ${type} | ${nullable} | ${key} | ${defaultVal} | ${extra} | ${comment} |\n`;
  });

  markdown += `\n`;

  // 索引信息
  if (indexes.length > 0) {
    markdown += `## 索引\n\n`;
    markdown += `| 索引名 | 类型 | 字段 | 唯一 |\n`;
    markdown += `|--------|------|------|------|\n`;

    indexes.forEach(idx => {
      const keyName = idx.Key_name;
      const indexType = idx.Index_type;
      const columns = idx.Column_name;
      const unique = idx.Non_unique === 0 ? '是' : '否';

      markdown += `| ${keyName} | ${indexType} | ${columns} | ${unique} |\n`;
    });

    markdown += `\n`;
  }

  // 获取建表语句（可选）
  const [createTable] = await connection.query(`SHOW CREATE TABLE ${tableName}`);
  if (createTable && createTable[0]) {
    markdown += `## 建表语句\n\n`;
    markdown += `,\`\`\`sql\n`;
    markdown += `${createTable[0]['Create Table']}\n`;
    markdown += `\`\`\`\n`;
  }

  return markdown;
}

/**
 * 生成视图的 Markdown 文档
 */
async function generateViewDoc(connection, viewName) {
  // 获取视图结构
  const [columns] = await connection.query(`
    SELECT
      COLUMN_NAME as Field,
      COLUMN_TYPE as Type,
      IS_NULLABLE as \`Null\`,
      COLUMN_DEFAULT as \`Default\`,
      COLUMN_COMMENT as Comment
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
  `, [viewName]);

  // 获取视图注释（某些 MySQL 版本可能不支持 TABLE_COMMENT）
  let comment = '';
  try {
    const [viewInfo] = await connection.query(`
      SELECT TABLE_COMMENT
      FROM INFORMATION_SCHEMA.VIEWS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    `, [viewName]);
    comment = viewInfo[0]?.TABLE_COMMENT || '';
  } catch (e) {
    comment = '';
  }

  // 获取创建视图语句
  const [createView] = await connection.query(`SHOW CREATE VIEW ${viewName}`);

  // 生成 Markdown
  let markdown = `# 视图名：${viewName}\n\n`;

  // 基本信息
  markdown += `## 基本信息\n`;
  markdown += `- **视图用途**：${comment || '暂无说明'}\n\n`;

  // 字段说明
  markdown += `## 字段说明\n\n`;
  markdown += `| 字段名 | 类型 | NULL | 默认值 | 说明 |\n`;
  markdown += `|--------|------|------|--------|------|\n`;

  columns.forEach(col => {
    const field = col.Field;
    const type = formatFieldType(col.Type);
    const nullable = col.Null === 'YES' ? '是' : '否';
    const defaultVal = col.Default === null ? 'NULL' : `'${col.Default}'`;
    const comment = col.Comment || '';

    markdown += `| ${field} | ${type} | ${nullable} | ${defaultVal} | ${comment} |\n`;
  });

  markdown += `\n`;

  // 创建视图语句
  if (createView && createView[0]) {
    markdown += `## 创建视图语句\n\n`;
    markdown += `\`\`\`sql\n`;
    markdown += `${createView[0]['Create View']}\n`;
    markdown += `\`\`\`\n`;
  }

  return markdown;
}

/**
 * 主函数
 */
async function main() {
  const config = DATABASE_CONFIG[ACTIVE_DB];

  console.log('========================================');
  console.log('📋 数据库结构导出工具');
  console.log('========================================');
  console.log(`📡 连接数据库：${config.host}`);
  console.log(`📝 数据库名称：${config.database}`);
  console.log(`📂 输出目录：${DOCS_DIR}`);
  console.log('========================================\n');

  let connection;

  try {
    // 连接数据库
    connection = await mysql.createConnection(config);
    console.log('✅ 数据库连接成功！\n');

    // 创建输出目录
    if (!fs.existsSync(DOCS_DIR)) {
      fs.mkdirSync(DOCS_DIR, { recursive: true });
    }

    // 获取所有表
    const [tables] = await connection.query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    console.log(`📊 发现 ${tables.length} 个数据表\n`);

    // 生成每个表的文档
    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      console.log(`  ⏳ 正在处理表：${tableName}...`);

      const doc = await generateTableDoc(connection, tableName);
      const fileName = `${tableName}.md`;
      const filePath = path.join(DOCS_DIR, fileName);

      fs.writeFileSync(filePath, doc, 'utf8');
      console.log(`  ✅ 已生成：${fileName}`);
    }

    // 获取所有视图
    const [views] = await connection.query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.VIEWS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME
    `);

    if (views.length > 0) {
      console.log(`\n📋 发现 ${views.length} 个视图\n`);

      // 生成每个视图的文档
      for (const view of views) {
        const viewName = view.TABLE_NAME;
        console.log(`  ⏳ 正在处理视图：${viewName}...`);

        const doc = await generateViewDoc(connection, viewName);
        const fileName = `view-${viewName}.md`;
        const filePath = path.join(DOCS_DIR, fileName);

        fs.writeFileSync(filePath, doc, 'utf8');
        console.log(`  ✅ 已生成：${fileName}`);
      }
    } else {
      console.log(`\n📋 未发现视图\n`);
    }

    // 生成总览文档
    await generateIndexDoc(connection, tables, views);

    console.log('\n========================================');
    console.log('✅ 所有文档生成完成！');
    console.log('========================================');

  } catch (error) {
    console.error('❌ 错误：', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 数据库连接已关闭\n');
    }
  }
}

/**
 * 生成总览文档
 */
async function generateIndexDoc(connection, tables, views) {
  let markdown = `# quotation 数据库文档\n\n`;
  markdown += `> 本文档由脚本自动生成，最后更新时间：${new Date().toLocaleString('zh-CN')}\n\n`;

  markdown += `## 数据库信息\n\n`;
  markdown += `- **数据库名**：quotation\n`;
  markdown += `- **数据表数量**：${tables.length}\n`;
  markdown += `- **视图数量**：${views.length}\n\n`;

  markdown += `## 数据表列表\n\n`;
  tables.forEach(table => {
    markdown += `- [${table.TABLE_NAME}](./${table.TABLE_NAME}.md)\n`;
  });

  if (views.length > 0) {
    markdown += `\n## 视图列表\n\n`;
    views.forEach(view => {
      markdown += `- [${view.TABLE_NAME}](./view-${view.TABLE_NAME}.md)\n`;
    });
  }

  const indexPath = path.join(DOCS_DIR, 'README.md');
  fs.writeFileSync(indexPath, markdown, 'utf8');
  console.log(`  ✅ 已生成：README.md（总览）`);
}

// 运行
main();
