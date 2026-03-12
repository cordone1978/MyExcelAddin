#!/usr/bin/env node
"use strict";

const mysql = require("mysql2/promise");
const { DATABASE_CONFIG, ACTIVE_DB } = require("../serverConstants");

const DEFAULT_TEMPLATE_NAME = "默认模板";
const DEFAULT_INDUSTRIES = ["lfp", "lfp_raw"];

async function columnExists(conn, tableName, columnName) {
  const [rows] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function indexExists(conn, tableName, indexName) {
  const [rows] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
    `,
    [tableName, indexName]
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function foreignKeyExists(conn, tableName, constraintName) {
  const [rows] = await conn.query(
    `
    SELECT COUNT(*) AS total
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND CONSTRAINT_NAME = ?
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    `,
    [tableName, constraintName]
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function ensureSchema(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS ht_sales_product_templates (
      template_id INT NOT NULL AUTO_INCREMENT,
      source_product_id INT NOT NULL,
      template_name VARCHAR(255) NOT NULL,
      notes TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (template_id),
      UNIQUE KEY uk_source_product_template (source_product_id, template_name),
      KEY idx_template_source_product (source_product_id),
      CONSTRAINT fk_product_templates_source_product
        FOREIGN KEY (source_product_id) REFERENCES ht_sales_products(product_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品默认配置模板主表';
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS ht_sales_product_industries (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      product_id INT NOT NULL,
      industry_type VARCHAR(32) NOT NULL,
      template_id INT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_product_industry (product_id, industry_type),
      KEY idx_product_industry_lookup (industry_type, is_active, product_id),
      KEY idx_product_industry_template (template_id),
      CONSTRAINT fk_product_industries_product
        FOREIGN KEY (product_id) REFERENCES ht_sales_products(product_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
      CONSTRAINT fk_product_industries_template
        FOREIGN KEY (template_id) REFERENCES ht_sales_product_templates(template_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品与行业可用性及模板映射表';
  `);

  if (!(await columnExists(conn, "ht_sales_product_default_config", "template_id"))) {
    await conn.query(`
      ALTER TABLE ht_sales_product_default_config
      ADD COLUMN template_id INT NULL COMMENT '所属默认配置模板ID' AFTER product_id
    `);
  }

  if (!(await indexExists(conn, "ht_sales_product_default_config", "idx_default_config_template_id"))) {
    await conn.query(`
      ALTER TABLE ht_sales_product_default_config
      ADD KEY idx_default_config_template_id (template_id)
    `);
  }

  if (!(await foreignKeyExists(conn, "ht_sales_product_default_config", "fk_default_config_template"))) {
    await conn.query(`
      ALTER TABLE ht_sales_product_default_config
      ADD CONSTRAINT fk_default_config_template
      FOREIGN KEY (template_id) REFERENCES ht_sales_product_templates(template_id)
      ON DELETE RESTRICT ON UPDATE RESTRICT
    `);
  }
}

async function seedTemplatesAndMappings(conn) {
  const [products] = await conn.query(`
    SELECT p.product_id, p.product_model
    FROM ht_sales_products p
    WHERE p.is_active = 1
    ORDER BY p.product_id ASC
  `);

  const templateIdByProductId = new Map();

  for (const product of products) {
    const productId = Number(product.product_id || 0);
    const productModel = String(product.product_model || "").trim() || `product_${productId}`;
    await conn.query(
      `
      INSERT INTO ht_sales_product_templates (
        source_product_id,
        template_name,
        notes,
        is_active
      ) VALUES (?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        notes = VALUES(notes),
        is_active = VALUES(is_active)
      `,
      [productId, DEFAULT_TEMPLATE_NAME, `${productModel} 迁移生成默认模板`]
    );

    const [templateRows] = await conn.query(
      `
      SELECT template_id
      FROM ht_sales_product_templates
      WHERE source_product_id = ?
        AND template_name = ?
      LIMIT 1
      `,
      [productId, DEFAULT_TEMPLATE_NAME]
    );
    const templateId = Number(templateRows[0]?.template_id || 0);
    if (templateId > 0) {
      templateIdByProductId.set(productId, templateId);
      await conn.query(
        `
        UPDATE ht_sales_product_default_config
        SET template_id = ?
        WHERE product_id = ?
          AND (template_id IS NULL OR template_id = 0)
        `,
        [templateId, productId]
      );
    }
  }

  for (const product of products) {
    const productId = Number(product.product_id || 0);
    const templateId = templateIdByProductId.get(productId) || null;
    for (const industryType of DEFAULT_INDUSTRIES) {
      await conn.query(
        `
        INSERT INTO ht_sales_product_industries (
          product_id,
          industry_type,
          template_id,
          is_active
        ) VALUES (?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          template_id = VALUES(template_id),
          is_active = VALUES(is_active)
        `,
        [productId, industryType, templateId]
      );
    }
  }
}

async function summarize(conn) {
  const [templateRows] = await conn.query(`
    SELECT COUNT(*) AS total_templates
    FROM ht_sales_product_templates
  `);
  const [industryRows] = await conn.query(`
    SELECT industry_type, COUNT(*) AS total_products
    FROM ht_sales_product_industries
    WHERE is_active = 1
    GROUP BY industry_type
    ORDER BY industry_type
  `);
  const [configRows] = await conn.query(`
    SELECT COUNT(*) AS total_configs, SUM(CASE WHEN template_id IS NOT NULL THEN 1 ELSE 0 END) AS templated_configs
    FROM ht_sales_product_default_config
  `);

  console.log(`[OK] templates=${Number(templateRows[0]?.total_templates || 0)}`);
  console.table(industryRows);
  console.table(configRows);
}

async function main() {
  const dbConfig = DATABASE_CONFIG[ACTIVE_DB];
  if (!dbConfig) {
    throw new Error(`Unknown DB profile: ${ACTIVE_DB}`);
  }
  const conn = await mysql.createConnection(dbConfig);
  try {
    await conn.beginTransaction();
    await ensureSchema(conn);
    await seedTemplatesAndMappings(conn);
    await conn.commit();
    await summarize(conn);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(`[ERR] ${error.message || error}`);
  process.exit(1);
});
