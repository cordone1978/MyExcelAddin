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

function envList(name, fallback = []) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    return [...fallback];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function envStringAny(names, fallback) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return fallback;
}

function buildDbProfileConfig(profileName, defaults) {
  const prefix = String(profileName || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return {
    host: envStringAny([`QUOTATION_DB_${prefix}_HOST`, `DB_${prefix}_HOST`, "QUOTATION_DB_HOST", "DB_HOST"], defaults.host),
    user: envStringAny([`QUOTATION_DB_${prefix}_USER`, `DB_${prefix}_USER`, "QUOTATION_DB_USER", "DB_USER"], defaults.user),
    password: envStringAny(
      [`QUOTATION_DB_${prefix}_PASSWORD`, `DB_${prefix}_PASSWORD`, "QUOTATION_DB_PASSWORD", "DB_PASSWORD"],
      ""
    ),
    database: envStringAny(
      [`QUOTATION_DB_${prefix}_NAME`, `DB_${prefix}_NAME`, "QUOTATION_DB_NAME", "DB_NAME"],
      defaults.database
    ),
  };
}

const DEFAULT_SERVER_CONFIG = {
  protocol: "https",
  host: "localhost",
  port: 3001,
  apiPrefix: "/api",
  publicImagesPath: "/assets/equipment/",
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
  allowedOrigins: envList("ALLOWED_ORIGINS", []),
};

const DATABASE_CONFIG = {
  localhost: buildDbProfileConfig("localhost", {
    host: "localhost",
    user: "root",
    database: "quotation",
  }),
  company: buildDbProfileConfig("company", {
    host: "192.168.1.79",
    user: "root",
    database: "quotation",
  }),
};

const ACTIVE_DB = envString("DB_PROFILE", "localhost");
const AUTH_CONFIG = {
  cookieName: envString("AUTH_COOKIE_NAME", "dc_auth_session"),
  defaultClientApp: envString("AUTH_CLIENT_APP", "quotationaddin"),
};

const API_ROUTES = {
  test: "/api/test",
  categories: "/api/categories",
  industries: "/api/industries",
  projects: "/api/projects/:categoryId",
  details: "/api/details/:projectId",
  annotations: "/api/annotations/:projectId",
  config: "/api/config/:projectId",
  crafting: "/api/crafting/:componentId",
  componentCrafts: "/api/component-crafts/:componentId",
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
  warehouseCleanSearch: "/api/warehouse-clean-search",
};

const URLS = {
  serverOrigin: `${SERVER_CONFIG.protocol}://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`,
  imageBase: `${SERVER_CONFIG.protocol}://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}${SERVER_CONFIG.publicImagesPath}`,
};

const DOMAIN_TERMS = {
  craftingKind: "工艺",
  standardPartKind: "标准件",
  unknownCrafting: "未知工艺",
  craftLabelSeparator: " -- ",
  rmbSymbol: "¥",
};

const SERVER_MESSAGES = {
  projectModelNotFound: "未找到对应产品型号",
  systemMappingNotFound: "未找到对应的系统映射",
  authMissingToken: "未登录或登录已失效",
  authInvalidCredentials: "用户名或密码错误",
  authUserDisabled: "账号已停用",
  authResetPasswordFailed: "重置密码失败",
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
};

module.exports = {
  SERVER_CONFIG,
  DATABASE_CONFIG,
  ACTIVE_DB,
  AUTH_CONFIG,
  API_ROUTES,
  URLS,
  DOMAIN_TERMS,
  SERVER_MESSAGES,
  SERVER_LOGS,
};
