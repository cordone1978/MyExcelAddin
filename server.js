const fs = require('fs');
const https = require('https');
const express = require('express');
const cors = require('cors');
const path = require('path');

// 加载 .env.local（如果存在），早于其他所有 require，确保环境变量在模块初始化前生效
require('dotenv').config({ path: path.join(__dirname, '.env.local'), override: false });

const { SERVER_CONFIG, DATABASE_CONFIG, ACTIVE_DB, URLS } = require('./serverConstants');
const { ensureAuthSessionsTable } = require('./lib/authService');

// 路由模块
const productsRouter = require('./routes/products');
const craftingRouter = require('./routes/crafting');
const searchRouter = require('./routes/search');
const authRouter = require('./routes/auth');
const exportRouter = require('./routes/export');

const app = express();

// ── Middleware ────────────────────────────────────────────────

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (!SERVER_CONFIG.allowedOrigins.length || SERVER_CONFIG.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "6mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// ── 路由挂载（必须在静态文件之前）────────────────────────────

app.use(productsRouter);
app.use(craftingRouter);
app.use(searchRouter);
app.use(authRouter);
app.use(exportRouter);

// ── 静态文件 ──────────────────────────────────────────────────

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));

// ── HTTPS 启动 ────────────────────────────────────────────────

const certBaseDir = process.env.CERT_BASE_DIR
  ? path.resolve(process.env.CERT_BASE_DIR)
  : path.resolve(__dirname, "..");
const certKeyPath = path.join(certBaseDir, SERVER_CONFIG.certKeyFile);
const certPemPath = path.join(certBaseDir, SERVER_CONFIG.certPemFile);

if (!fs.existsSync(certKeyPath) || !fs.existsSync(certPemPath)) {
  const { SERVER_LOGS } = require('./serverConstants');
  console.error(SERVER_LOGS.sslCertMissing);
  console.error(`   ${certBaseDir}`);
  console.error(`   ${SERVER_LOGS.sslCertRequiredFiles}`);
  console.error("   Tip: set CERT_BASE_DIR to an external certificate directory.");
  process.exit(1);
}

const httpsOptions = {
  key: fs.readFileSync(certKeyPath),
  cert: fs.readFileSync(certPemPath),
};

const PORT = SERVER_CONFIG.port;
ensureAuthSessionsTable()
  .then(() => {
    const server = https.createServer(httpsOptions, app);
    server.on("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        console.warn(`Port ${PORT} is already in use. Reusing existing API service.`);
        process.exit(0);
        return;
      }
      console.error("HTTPS server error:", error?.message || error);
      process.exit(1);
    });
    server.listen(PORT, () => {
      console.log(`[server] HTTPS API 已启动  ${URLS.serverOrigin}`);
      console.log(`[server] 测试接口          ${URLS.serverOrigin}/api/test`);
      console.log(`[server] DB profile        ${ACTIVE_DB}`);
    });
  })
  .catch((error) => {
    console.error("Auth session table init failed:", error?.message || error);
    process.exit(1);
  });

// Export for external modules that depend on DB config
module.exports.DATABASE_CONFIG = DATABASE_CONFIG;
module.exports.ACTIVE_DB = ACTIVE_DB;
