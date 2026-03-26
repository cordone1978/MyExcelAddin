const mysql = require('mysql2/promise');
const { DATABASE_CONFIG, ACTIVE_DB } = require('../serverConstants');

const activeDbConfig = DATABASE_CONFIG[ACTIVE_DB];
if (!activeDbConfig) {
  throw new Error(`Unknown DB profile: ${ACTIVE_DB}`);
}
if (!activeDbConfig.password && process.env.QUOTATION_DB_ALLOW_EMPTY_PASSWORD !== "1") {
  throw new Error(
    `Missing database password for profile "${ACTIVE_DB}". Set QUOTATION_DB_${String(ACTIVE_DB).toUpperCase()}_PASSWORD or QUOTATION_DB_PASSWORD.`
  );
}

const pool = mysql.createPool({
  ...activeDbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = { pool };
