const SERVER_CONFIG = {
  protocol: "https",
  host: "localhost",
  port: 3001,
  apiPrefix: "/api",
  publicImagesPath: "/public/images/",
  certKeyFile: "localhost+2-key.pem",
  certPemFile: "localhost+2.pem",
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

const ACTIVE_DB = "localhost";

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
  sslCertMissing: "SSL certificate files are missing",
  sslCertRequiredFiles: "Required files: localhost+2.pem and localhost+2-key.pem",
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
