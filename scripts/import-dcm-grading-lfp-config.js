#!/usr/bin/env node
"use strict";

const fs = require("fs");
const mysql = require("mysql2/promise");

const CSV_PATH = "E:\\BOM\\销售需求\\碟巢磨-分级（磷酸铁&磷酸铁锂行业）.csv";
const DB = { host: "localhost", user: "root", password: "Livsun24", database: "quotation" };
const TARGET_INDUSTRIES = ["lfp", "lfp_raw"];
const CONFIG_SUFFIX = "（铁锂磷酸铁分级配置）";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function loadDcmConfigRows(csvPath) {
  const text = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  const result = [];
  let currentModel = "";
  for (const cols of rows) {
    const seq = normalizeText(cols[0]);
    const searchModel = normalizeText(cols[2]);
    const componentName = normalizeText(cols[3]);
    const componentDesc = normalizeText(cols[4]);
    const backup = normalizeText(cols[6]);

    if (seq && searchModel && componentName === "型号") {
      currentModel = searchModel;
      continue;
    }
    if (!currentModel || !componentName || componentName === "型号") {
      continue;
    }
    result.push({
      productModel: currentModel,
      componentName,
      componentDesc,
      backup,
    });
  }
  return result;
}

async function main() {
  const conn = await mysql.createConnection(DB);
  try {
    const configRows = loadDcmConfigRows(CSV_PATH);
    const productModels = Array.from(new Set(configRows.map((item) => item.productModel)));
    await conn.beginTransaction();

    const [sourceProducts] = await conn.query(
      `
      SELECT product_id, product_type_id, product_model, base_description, is_active
      FROM ht_sales_products
      WHERE product_model IN (${productModels.map(() => "?").join(",")})
      `,
      productModels
    );

    const sourceByModel = new Map(sourceProducts.map((row) => [String(row.product_model), row]));
    const configProductIdByModel = new Map();

    for (const model of productModels) {
      const source = sourceByModel.get(model);
      if (!source) continue;
      const configDescription = `${String(source.base_description || `${model}碟巢磨机`)}${CONFIG_SUFFIX}`;
      await conn.query(
        `
        INSERT INTO ht_sales_products (
          product_type_id,
          product_model,
          base_description,
          sort_by,
          base_weight,
          standard_price,
          technical_params,
          InnerCode,
          is_active
        ) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, 1)
        ON DUPLICATE KEY UPDATE
          is_active = VALUES(is_active)
        `,
        [Number(source.product_type_id || 0), model, configDescription]
      );

      const [configProducts] = await conn.query(
        `
        SELECT product_id
        FROM ht_sales_products
        WHERE product_type_id = ?
          AND product_model = ?
          AND base_description = ?
        LIMIT 1
        `,
        [Number(source.product_type_id || 0), model, configDescription]
      );

      const configProductId = Number(configProducts[0]?.product_id || 0);
      if (!configProductId) continue;
      configProductIdByModel.set(model, configProductId);

      await conn.query(
        `DELETE FROM ht_sales_product_default_config WHERE product_id = ?`,
        [configProductId]
      );

      const modelRows = configRows.filter((item) => item.productModel === model);
      let componentSn = 1;
      for (const row of modelRows) {
        await conn.query(
          `
          INSERT INTO ht_sales_product_default_config (
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
            backup,
            whatkind,
            is_active,
            is_Assembly
          ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, 1, '项', NULL, NULL, NULL, NULL, ?, '组件', 1, 0)
          `,
          [configProductId, componentSn, row.componentName, row.componentDesc, row.backup]
        );
        componentSn += 1;
      }

      for (const industryType of TARGET_INDUSTRIES) {
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
          [Number(source.product_id || 0), industryType, configProductId]
        );
      }
    }

    await conn.commit();

    const [summaryRows] = await conn.query(
      `
      SELECT
        src.product_model,
        map.industry_type,
        map.config_product_id,
        COUNT(cfg.config_id) AS config_count
      FROM ht_sales_product_industry_config map
      JOIN ht_sales_products src ON src.product_id = map.product_id
      LEFT JOIN ht_sales_product_default_config cfg ON cfg.product_id = map.config_product_id
      WHERE src.product_model IN (${productModels.map(() => "?").join(",")})
        AND map.industry_type IN ('lfp', 'lfp_raw')
      GROUP BY src.product_model, map.industry_type, map.config_product_id
      ORDER BY src.product_model, map.industry_type
      `,
      productModels
    );
    console.table(summaryRows);
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
