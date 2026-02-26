export const SERVER_CONFIG = {
  protocol: "https",
  host: "localhost",
  port: 3001,
  apiPrefix: "/api",
  publicImagesPath: "/public/images/",
} as const;

const serverOrigin = `${SERVER_CONFIG.protocol}://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`;

export const APP_URLS = {
  serverOrigin,
  apiBase: `${serverOrigin}${SERVER_CONFIG.apiPrefix}`,
  imageBase: `${serverOrigin}${SERVER_CONFIG.publicImagesPath}`,
} as const;

export const API_PATHS = {
  test: "/test",
  categories: "/categories",
  projects: "/projects",
  details: "/details",
  annotations: "/annotations",
  config: "/config",
  crafting: "/crafting",
  materials: "/materials",
  systems: "/systems",
  craftPrices: "/craft-prices",
  projectByModel: "/project-by-model",
  priceSearch: "/price-search",
  systemMapping: "/system-mapping",
  exportQuotePdf: "/export-quote-pdf",
  authLogin: "/auth/login",
  authLogout: "/auth/logout",
  authMe: "/auth/me",
  authResetPassword: "/auth/reset-password",
} as const;

export const DIALOG_PATHS = {
  main: "dialog.html",
  devModify: "devmodify.html",
  craftModify: "craftmodify.html",
  queryPrice: "queryprice.html",
  generateQuote: "quoteSummaryPreview.html",
} as const;

export const DIALOG_SIZES = {
  main: { width: 60, height: 65 },
  devModify: { width: 70, height: 50 },
  queryPrice: { width: 75, height: 60 },
  generateQuote: { width: 71, height: 100 },
  default: { width: 50, height: 60 },
  toast: { width: 30, height: 20 },
} as const;

export const UI_DEFAULTS = {
  highlightColor: "yellow",
  defaultUnit: "个",
  defaultQuantity: 1,
  placeholderOptionText: "请选择...",
  defaultWarningMessage: "当前位置不允许插入数据",
  defaultSearchIcon: "🔎",
  defaultSearchPrompt: "请输入物料名称进行查询",
  defaultNoResultMessage: "未找到匹配的数据",
  defaultQueryFailMessage: "查询失败",
  defaultSelectPriceMessage: "请先选择一条价格记录",
  defaultRowDataMessage: "请选择数据行，不要选择表头。",
  authTokenStorageKey: "quotation_addin_auth_token",
} as const;

export const EXCEL_LAYOUT = {
  quoteConfigColumnIndex: 2,
  asciiColumnCodeOfA: 65,
} as const;

export const CRAFTING_CONSTANTS = {
  outsourcedKind: "外购件",
  standardPart: "标准件",
  craftTypeSeparator: "--",
  rmbSymbol: "￥",
} as const;
