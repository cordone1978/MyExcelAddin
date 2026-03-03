function envString(name, fallback) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }
  return value.trim();
}

function envPort(name, fallback) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DEFAULT_SERVER_CONFIG = {
  protocol: "https",
  host: "localhost",
  port: 3001,
  apiPrefix: "/api",
  publicImagesPath: "/public/images/",
  certKeyFile: "localhost+2-key.pem",
  certPemFile: "localhost+2.pem",
};

const SERVER_CONFIG = {
  ...DEFAULT_SERVER_CONFIG,
  protocol: envString("APP_PROTOCOL", DEFAULT_SERVER_CONFIG.protocol),
  host: envString("APP_HOST", DEFAULT_SERVER_CONFIG.host),
  port: envPort("APP_PORT", DEFAULT_SERVER_CONFIG.port),
  certKeyFile: envString("CERT_KEY_FILE", DEFAULT_SERVER_CONFIG.certKeyFile),
  certPemFile: envString("CERT_PEM_FILE", DEFAULT_SERVER_CONFIG.certPemFile),
};

const DATABASE_CONFIG = {
  localhost: {
    host: "localhost",
    user: "root",
    password: "Livsun24",
    database: "quotation",
  },
  company: {
    host: "192.168.1.79",
    user: "root",
    password: "ipanel",
    database: "quotation",
  },
};

const ACTIVE_DB = envString("DB_PROFILE", "localhost");

const API_ROUTES = {
  test: "/api/test",
  categories: "/api/categories",
  projects: "/api/projects/:categoryId",
  details: "/api/details/:projectId",
  annotations: "/api/annotations/:projectId",
  config: "/api/config/:projectId",
  crafting: "/api/crafting/:componentId",
  materials: "/api/materials/:componentId",
  systems: "/api/systems",
  craftPrices: "/api/craft-prices",
  projectByModel: "/api/project-by-model/:productModel",
  priceSearch: "/api/price-search",
  systemMapping: "/api/system-mapping/:typeName",
  authLogin: "/api/auth/login",
  authLogout: "/api/auth/logout",
  authMe: "/api/auth/me",
  authResetPassword: "/api/auth/reset-password",
  exportQuotePdf: "/api/export-quote-pdf",
  graphTemplateImage: "/api/graph-template-image",
};

const URLS = {
  serverOrigin: `${SERVER_CONFIG.protocol}://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`,
  imageBase: `${SERVER_CONFIG.protocol}://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}${SERVER_CONFIG.publicImagesPath}`,
};

const DOMAIN_TERMS = {
  craftingKind: "\u5de5\u827a",
  standardPartKind: "\u6807\u51c6\u4ef6",
  unknownCrafting: "\u672a\u77e5\u5de5\u827a",
  craftLabelSeparator: " -- ",
  rmbSymbol: "\u00a5",
};

const SERVER_MESSAGES = {
  projectModelNotFound: "\u672a\u627e\u5230\u5bf9\u5e94\u4ea7\u54c1\u578b\u53f7",
  systemMappingNotFound: "\u672a\u627e\u5230\u5bf9\u5e94\u7684\u7cfb\u7edf\u6620\u5c04",
  authMissingToken: "\u672a\u767b\u5f55\u6216\u767b\u5f55\u5df2\u5931\u6548",
  authInvalidCredentials: "\u7528\u6237\u540d\u6216\u5bc6\u7801\u9519\u8bef",
  authUserDisabled: "\u8d26\u53f7\u5df2\u505c\u7528",
  authResetPasswordFailed: "\u91cd\u7f6e\u5bc6\u7801\u5931\u8d25",
};

const SERVER_LOGS = {
  testConnectionFailed: "Test connection failed",
  fetchCategoriesFailed: "Fetch categories failed",
  fetchProjectsFailed: "Fetch projects failed",
  fetchDetailsFailed: "Fetch details failed",
  fetchAnnotationsFailed: "Fetch annotations failed",
  fetchConfigFailed: "Fetch config failed",
  fetchCraftingFailed: "Fetch crafting failed",
  fetchMaterialsFailed: "Fetch materials failed",
  fetchSystemsFailed: "Fetch systems failed",
  fetchCraftPricesFailed: "Fetch craft prices failed",
  fetchProjectByModelFailed: "Fetch project by model failed",
  priceSearchFailed: "Price search failed",
  querySystemMapping: "Query system mapping for type",
  querySystemMappingResult: "System mapping query result",
  foundSystemMapping: "Found system mapping",
  querySystemMappingFailed: "Query system mapping failed",
  authLoginFailed: "Auth login failed",
  authLogoutFailed: "Auth logout failed",
  authMeFailed: "Auth me failed",
  authResetPasswordFailed: "Auth reset password failed",
  sslCertMissing: "SSL certificate files are missing",
  sslCertRequiredFiles: `Required files: ${SERVER_CONFIG.certPemFile} and ${SERVER_CONFIG.certKeyFile}`,
  startupDivider: "========================================",
  startupServerRunning: "HTTPS server running at",
  startupSslLoaded: "SSL certificate loaded",
  startupApiEndpoints: "API endpoints:",
  startupApiTest: "test",
  startupApiCategories: "categories",
  startupApiConfig: "config",
  startupApiSystemMapping: "systemMapping",
  startupApiImages: "images",
  startupApiStatic: "static",
  startupExample: "example",
};

module.exports = {
  SERVER_CONFIG,
  DATABASE_CONFIG,
  ACTIVE_DB,
  API_ROUTES,
  URLS,
  DOMAIN_TERMS,
  SERVER_MESSAGES,
  SERVER_LOGS,
};
