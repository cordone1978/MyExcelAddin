#!/usr/bin/env node
"use strict";

const mysql = require("mysql2/promise");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local"), override: false });
const { DATABASE_CONFIG, ACTIVE_DB } = require("../serverConstants");

const DB = DATABASE_CONFIG[ACTIVE_DB];

async function columnExists(conn, tableName, columnName) {
  const [rows] = await conn.query(
    `
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    LIMIT 1
    `,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function indexExists(conn, tableName, indexName) {
  const [rows] = await conn.query(
    `
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
    LIMIT 1
    `,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function fkExists(conn, tableName, fkName) {
  const [rows] = await conn.query(
    `
    SELECT 1
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND CONSTRAINT_NAME = ?
    LIMIT 1
    `,
    [tableName, fkName]
  );
  return rows.length > 0;
}

function resolveComponentKind(raw) {
  const text = String(raw || "");
  if (text.includes("标准件")) return "标准件";
  if (text.includes("外购件")) return "外购件";
  if (text.includes("工艺")) return "工艺";
  return "组件";
}

async function ensureComponentRow(conn, item, orderCache) {
  const typeId = Number(item.product_type_id || 0);
  const name = String(item.component_name || "").trim();
  if (!typeId || !name) {
    throw new Error(`Invalid component seed row: typeId=${typeId}, name=${name}`);
  }

  if (!orderCache.has(typeId)) {
    const [rows] = await conn.query(
      `
      SELECT component_order
      FROM ht_sales_components
      WHERE product_type_id = ?
      ORDER BY component_order ASC
      `,
      [typeId]
    );
    orderCache.set(typeId, new Set(rows.map((r) => Number(r.component_order || 0)).filter((n) => n > 0)));
  }
  const usedOrders = orderCache.get(typeId);
  const desiredOrder = Number(item.component_sn || 0);
  let order = desiredOrder > 0 ? desiredOrder : 1;
  while (usedOrders.has(order)) {
    order += 1;
  }
  usedOrders.add(order);

  const code = `AUTO_${typeId}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  await conn.query(
    `
    INSERT INTO ht_sales_components (
      component_code,
      component_name,
      component_kind,
      component_pic,
      component_order,
      product_type_id,
      parent_component_id,
      description,
      is_active
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1)
    `,
    [
      code,
      name,
      resolveComponentKind(item.whatkind),
      String(item.component_pic || "").trim() || null,
      order,
      typeId,
      String(item.component_desc || "").trim() || null,
    ]
  );
}

async function main() {
  const conn = await mysql.createConnection(DB);
  try {
    await conn.beginTransaction();

    const hasComponentId = await columnExists(conn, "ht_sales_product_default_config", "component_id");
    if (!hasComponentId) {
      await conn.query(`
        ALTER TABLE ht_sales_product_default_config
        ADD COLUMN component_id INT NULL AFTER material_id
      `);
    }

    if (!(await indexExists(conn, "ht_sales_product_default_config", "idx_component_id"))) {
      await conn.query(`
        ALTER TABLE ht_sales_product_default_config
        ADD KEY idx_component_id (component_id)
      `);
    }

    if (!(await indexExists(conn, "ht_sales_components", "uk_type_component_name"))) {
      await conn.query(`
        ALTER TABLE ht_sales_components
        ADD UNIQUE KEY uk_type_component_name (product_type_id, component_name)
      `);
    }
    if (!(await indexExists(conn, "ht_sales_components", "uk_type_component_order"))) {
      await conn.query(`
        ALTER TABLE ht_sales_components
        ADD UNIQUE KEY uk_type_component_order (product_type_id, component_order)
      `);
    }

    await conn.query(
      `
      UPDATE ht_sales_product_default_config c
      INNER JOIN ht_sales_products p
        ON p.product_id = c.product_id
      INNER JOIN ht_sales_components s
        ON s.product_type_id = p.product_type_id
       AND s.component_name = c.component_name
      SET c.component_id = s.component_id
      WHERE c.component_id IS NULL
      `
    );

    const [missingBefore] = await conn.query(
      `
      SELECT
        c.config_id,
        c.product_id,
        p.product_type_id,
        c.component_sn,
        c.component_name,
        c.component_desc,
        c.component_pic,
        c.whatkind
      FROM ht_sales_product_default_config c
      INNER JOIN ht_sales_products p
        ON p.product_id = c.product_id
      WHERE c.component_id IS NULL
      ORDER BY p.product_type_id ASC, c.component_sn ASC, c.config_id ASC
      `
    );

    const seeds = new Map();
    (missingBefore || []).forEach((row) => {
      const key = `${Number(row.product_type_id || 0)}||${String(row.component_name || "").trim()}`;
      if (!seeds.has(key)) {
        seeds.set(key, row);
      }
    });

    const orderCache = new Map();
    for (const seed of seeds.values()) {
      await ensureComponentRow(conn, seed, orderCache);
    }

    await conn.query(
      `
      UPDATE ht_sales_product_default_config c
      INNER JOIN ht_sales_products p
        ON p.product_id = c.product_id
      INNER JOIN ht_sales_components s
        ON s.product_type_id = p.product_type_id
       AND s.component_name = c.component_name
      SET c.component_id = s.component_id
      WHERE c.component_id IS NULL
      `
    );

    const [leftRows] = await conn.query(
      `
      SELECT COUNT(*) AS cnt
      FROM ht_sales_product_default_config
      WHERE component_id IS NULL
      `
    );
    const unresolved = Number(leftRows[0]?.cnt || 0);
    if (unresolved > 0) {
      throw new Error(`Backfill component_id failed, unresolved rows: ${unresolved}`);
    }

    await conn.query(`
      ALTER TABLE ht_sales_product_default_config
      MODIFY COLUMN component_id INT NOT NULL
    `);

    if (!(await indexExists(conn, "ht_sales_product_default_config", "idx_product_id"))) {
      await conn.query(`
        ALTER TABLE ht_sales_product_default_config
        ADD KEY idx_product_id (product_id)
      `);
    }

    if (!(await indexExists(conn, "ht_sales_product_default_config", "uk_product_component"))) {
      await conn.query(`
        ALTER TABLE ht_sales_product_default_config
        ADD UNIQUE KEY uk_product_component (product_id, component_id, is_Assembly)
      `);
    }

    if (!(await fkExists(conn, "ht_sales_product_default_config", "fk_default_config_component"))) {
      await conn.query(`
        ALTER TABLE ht_sales_product_default_config
        ADD CONSTRAINT fk_default_config_component
          FOREIGN KEY (component_id) REFERENCES ht_sales_components(component_id)
          ON DELETE RESTRICT
          ON UPDATE RESTRICT
      `);
    }

    await conn.commit();

    const [summary] = await conn.query(`
      SELECT
        (SELECT COUNT(*) FROM ht_sales_product_default_config) AS cfg_rows,
        (SELECT COUNT(*) FROM ht_sales_product_default_config WHERE component_id IS NULL) AS cfg_null_component_id,
        (SELECT COUNT(*) FROM ht_sales_components) AS components_rows
    `);
    console.log("[migration] success");
    console.log(summary[0]);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(`[migration] failed: ${error.message || error}`);
  process.exit(1);
});
