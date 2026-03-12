type ClientRuntimeConfig = {
  serverOrigin?: string;
  apiBase?: string;
  imageBase?: string;
};

declare global {
  interface Window {
    __QUOTATION_RUNTIME_CONFIG__?: ClientRuntimeConfig;
  }
}

export const SERVER_CONFIG = {
  protocol: "https",
  host: "localhost",
  port: 3001,
  apiPrefix: "/api",
  publicImagesPath: "/public/images/",
} as const;

function getClientRuntimeConfig(): ClientRuntimeConfig {
  if (typeof window === "undefined") {
    return {};
  }
  return window.__QUOTATION_RUNTIME_CONFIG__ || {};
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizePathPrefix(value: string): string {
  const trimmed = trimTrailingSlash(value.trim());
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function getPageOrigin(): string {
  if (typeof window === "undefined" || !window.location?.origin) {
    return `${SERVER_CONFIG.protocol}://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`;
  }
  return trimTrailingSlash(window.location.origin);
}

const runtimeConfig = getClientRuntimeConfig();
const serverOrigin = runtimeConfig.serverOrigin
  ? trimTrailingSlash(runtimeConfig.serverOrigin)
  : getPageOrigin();

const apiBase = runtimeConfig.apiBase
  ? normalizePathPrefix(runtimeConfig.apiBase)
  : SERVER_CONFIG.apiPrefix;

const imageBase = runtimeConfig.imageBase
  ? normalizePathPrefix(runtimeConfig.imageBase)
  : SERVER_CONFIG.publicImagesPath;

export const APP_URLS = {
  serverOrigin,
  apiBase,
  imageBase,
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
  warehouseCleanSearch: "/warehouse-clean-search",
  systemMapping: "/system-mapping",
  exportQuotePdf: "/export-quote-pdf",
  authLogin: "/auth/login",
  authLogout: "/auth/logout",
  authMe: "/auth/me",
  authResetPassword: "/auth/reset-password",
  graphTemplateImage: "/graph-template-image",
} as const;

export const DIALOG_PATHS = {
  main: "dialog.html",
  devModify: "devmodify.html",
  craftModify: "craftmodify.html",
  queryPrice: "queryprice.html",
  infoReference: "infoReference.html",
  generateQuote: "quoteSummaryPreview.html",
  graphEditor: "graphEditor.html",
} as const;

export const DIALOG_SIZES = {
  main: { width: 60, height: 65 },
  devModify: { width: 70, height: 50 },
  queryPrice: { width: 75, height: 60 },
  infoReference: { width: 99, height: 99 },
  generateQuote: { width: 80, height: 92 },
  graphEditor: { width: 99, height: 99 },
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
