#!/usr/bin/env node
"use strict";

const mysql = require("mysql2/promise");
const { DATABASE_CONFIG, ACTIVE_DB } = require("../serverConstants");

const DEFAULT_INDUSTRIES = ["lfp", "lfp_raw"];

async function ensureSchema(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS ht_sales_product_industry_config (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      product_id INT NOT NULL,
      industry_type VARCHAR(32) NOT NULL,
      config_product_id INT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_product_industry_config (product_id, industry_type),
      KEY idx_industry_product_lookup (industry_type, is_active, product_id),
      KEY idx_industry_config_product (config_product_id),
      CONSTRAINT fk_product_industry_config_product
        FOREIGN KEY (product_id) REFERENCES ht_sales_products(product_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
      CONSTRAINT fk_product_industry_config_config_product
        FOREIGN KEY (config_product_id) REFERENCES ht_sales_products(product_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品与行业下默认配置产品映射表';
  `);
}

async function seedMappings(conn) {
  const [products] = await conn.query(`
    SELECT product_id
    FROM ht_sales_products
    WHERE is_active = 1
    ORDER BY product_id ASC
  `);

  for (const product of products) {
    const productId = Number(product.product_id || 0);
    if (!productId) continue;
    for (const industryType of DEFAULT_INDUSTRIES) {
      await conn.query(
        `
        INSERT INTO ht_sales_product_industry_config (
          product_id,
          industry_type,
          config_product_id,
          is_active
        ) VALUES (?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          config_product_id = VALUES(config_product_id),
          is_active = VALUES(is_active)
        `,
        [productId, industryType, productId]
      );
    }
  }
}

async function summarize(conn) {
  const [rows] = await conn.query(`
    SELECT industry_type, COUNT(*) AS total_products
    FROM ht_sales_product_industry_config
    WHERE is_active = 1
    GROUP BY industry_type
    ORDER BY industry_type
  `);
  console.table(rows);
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
    await seedMappings(conn);
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
