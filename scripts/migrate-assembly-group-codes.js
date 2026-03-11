const mysql = require("mysql2/promise");
const { DATABASE_CONFIG, ACTIVE_DB } = require("../serverConstants");

const MIGRATION_SQL = `
UPDATE ht_sales_product_default_config
SET is_Assembly = CASE
  WHEN CAST(is_Assembly AS SIGNED) = 1 THEN 101
  WHEN CAST(is_Assembly AS SIGNED) = 2 THEN 102
  ELSE CAST(is_Assembly AS SIGNED)
END
WHERE CAST(is_Assembly AS SIGNED) IN (1, 2)
`;

async function main() {
  const profile = String(process.env.DB_PROFILE || ACTIVE_DB || "localhost");
  const config = DATABASE_CONFIG[profile];
  if (!config) {
    throw new Error(`Unknown DB profile: ${profile}`);
  }

  const connection = await mysql.createConnection(config);
  try {
    const [beforeRows] = await connection.query(`
      SELECT CAST(is_Assembly AS SIGNED) as is_Assembly, COUNT(*) as row_count
      FROM ht_sales_product_default_config
      GROUP BY CAST(is_Assembly AS SIGNED)
      ORDER BY CAST(is_Assembly AS SIGNED)
    `);
    console.log("[assembly-migration] before:", beforeRows);

    const [result] = await connection.query(MIGRATION_SQL);
    console.log("[assembly-migration] affectedRows:", result.affectedRows);

    const [afterRows] = await connection.query(`
      SELECT CAST(is_Assembly AS SIGNED) as is_Assembly, COUNT(*) as row_count
      FROM ht_sales_product_default_config
      GROUP BY CAST(is_Assembly AS SIGNED)
      ORDER BY CAST(is_Assembly AS SIGNED)
    `);
    console.log("[assembly-migration] after:", afterRows);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[assembly-migration] failed:", error);
  process.exitCode = 1;
});
