/* global URL, window, fetch */
import { API_PATHS, APP_URLS } from "../shared/appConstants";
import { buildEquipmentImageUrl } from "../shared/equipmentImagePath";
import { ProductTemplate } from "./sceneTypes";
import { PRODUCT_LIBRARY } from "./productLibrary";

export type QuoteLibraryResolvedItem = {
  deviceName: string;
  templateId: string;
  thumbnailUrl: string;
  overallUrl: string;
  assetFamily?: string;
};

type ProductPictureManifest = {
  product_code?: string;
  asset_family?: string;
  product_name?: string;
  template_type?: string;
  default_thumbnail?: string;
  default_overall?: string;
  pictures?: Array<{
    picture_code?: string;
    file_name?: string;
    label?: string;
  }>;
};

type ProductPictureResolution = {
  templateId: string;
  assetFamily: string;
  thumbnailUrl: string;
  overallUrl: string;
};

const TEMPLATE_FAMILY_RULES: Array<{
  templateId: string;
  assetFamily?: string;
  keywords: string[];
}> = [
  {
    templateId: "template_silo",
    assetFamily: "silo-2000l",
    keywords: ["暂存仓", "料仓", "仓", "SILO", "silo", "2000L", "2000l"],
  },
  {
    templateId: "template_pipe",
    keywords: ["输送管", "管道", "管"],
  },
  {
    templateId: "template_cyclone",
    assetFamily: "pre-dryer",
    keywords: ["旋风", "分离器", "预烘干机", "PRE-DRYER", "predryer", "pre dryer"],
  },
  {
    templateId: "template_diechamoji",
    assetFamily: "ddm6a",
    keywords: [
      "钉碟磨机",
      "钉碟",
      "碟巢磨机",
      "磨机",
      "DDM",
      "ddm",
      "DDM6A",
      "ddm6a",
      "DCM",
      "dcm",
      "DCM500",
      "dcm500",
      "FJM",
      "fjm",
      "FJM-1250",
      "fjm-1250",
    ],
  },
];

const manifestCache = new Map<string, Promise<ProductPictureManifest | null>>();

export function normalizeLibraryName(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[（）()【】\[\]\s\-_.]/g, "");
}

export function tokenizeLibraryName(value: string) {
  return (String(value || "").match(/[a-z0-9]+|[\u4e00-\u9fa5]+/g) || []) as string[];
}

export function resolveTemplateThumbnail(template: ProductTemplate) {
  const firstComponent = (template.components || [])[0];
  const firstLayer =
    (firstComponent?.layers || []).find((layer) => (layer.role || "base") === "base") ||
    firstComponent?.layers?.[0];
  return firstLayer?.imageUrl || firstLayer?.fallbackImageUrl || firstComponent?.imageUrl || "";
}

export function resolveTemplateOverall(template: ProductTemplate) {
  return resolveTemplateThumbnail(template);
}

function resolveTemplateRule(productName: string) {
  const source = String(productName || "").trim();
  return (
    TEMPLATE_FAMILY_RULES.find((rule) =>
      rule.keywords.some((keyword) => source.includes(keyword))
    ) || null
  );
}

function buildProductPictureUrl(assetFamily: string, fileName: string) {
  const family = String(assetFamily || "").trim().replace(/^\/+|\/+$/g, "");
  const file = String(fileName || "").trim().replace(/^\/+/, "");
  if (!family || !file) return "";
  return `/assets/equipment/${family}/${file}`;
}

function findManifestFile(manifest: ProductPictureManifest | null, pictureCode: string) {
  return (
    (manifest?.pictures || []).find(
      (item) => String(item?.picture_code || "").trim().toLowerCase() === pictureCode
    )?.file_name || ""
  );
}

async function fetchProductPictureManifest(assetFamily: string): Promise<ProductPictureManifest | null> {
  const key = String(assetFamily || "").trim().toLowerCase();
  if (!key) return null;
  if (!manifestCache.has(key)) {
    manifestCache.set(
      key,
      (async () => {
        try {
          const response = await fetch(buildProductPictureUrl(key, "picture.json"), {
            cache: "no-cache",
          });
          if (!response.ok) return null;
          return (await response.json()) as ProductPictureManifest;
        } catch {
          return null;
        }
      })()
    );
  }
  return (await manifestCache.get(key)) || null;
}

export function resolveAssetFamilyFromProductName(productName: string) {
  const source = String(productName || "").trim();
  if (!source) return "";

  const explicitRule = resolveTemplateRule(source);
  if (explicitRule?.assetFamily) {
    const normalizedSource = normalizeLibraryName(source);
    if (normalizedSource.includes("fjm1250") || normalizedSource.includes("fjm")) {
      return "fjm-1250";
    }
    return explicitRule.assetFamily;
  }

  const normalizedSource = normalizeLibraryName(source);
  if (normalizedSource.includes("ddm6a") || normalizedSource.includes("ddm")) {
    return "ddm6a";
  }
  if (normalizedSource.includes("fjm1250") || normalizedSource.includes("fjm")) {
    return "fjm-1250";
  }
  if (normalizedSource.includes("silo2000l") || normalizedSource.includes("silo")) {
    return "silo-2000l";
  }
  if (normalizedSource.includes("predryer")) {
    return "pre-dryer";
  }

  return "";
}

export function resolveTemplateFromProductName(productName: string) {
  const source = String(productName || "").trim();
  if (!source) return null;

  const familyRule = resolveTemplateRule(source);
  if (familyRule) {
    return (
      PRODUCT_LIBRARY.find((template) => template.templateId === familyRule.templateId) || null
    );
  }

  const normalizedSource = normalizeLibraryName(source);
  const sourceTokens = tokenizeLibraryName(source);
  return (
    PRODUCT_LIBRARY.find((template) => {
      const templateName = normalizeLibraryName(template.name);
      const templateTokens = tokenizeLibraryName(template.name);
      return (
        normalizedSource.includes(templateName) ||
        templateName.includes(normalizedSource) ||
        sourceTokens.some((token) => templateTokens.includes(token))
      );
    }) || null
  );
}

export async function resolveProductPictureSet(
  productName: string,
  fallbackThumbnailUrl = "",
  fallbackOverallUrl = ""
): Promise<ProductPictureResolution | null> {
  const template = resolveTemplateFromProductName(productName);
  const templateId = String(template?.templateId || "").trim();
  const assetFamily = resolveAssetFamilyFromProductName(productName);
  const templateThumb = template ? resolveTemplateThumbnail(template) : "";
  const templateOverall = template ? resolveTemplateOverall(template) : templateThumb;
  const fallbackThumb = String(fallbackThumbnailUrl || templateThumb || "").trim();
  const fallbackOverall = String(fallbackOverallUrl || templateOverall || fallbackThumb).trim();

  if (!templateId && !assetFamily) {
    return null;
  }

  if (!assetFamily) {
    return {
      templateId: templateId || "template_diechamoji",
      assetFamily: "",
      thumbnailUrl: fallbackThumb,
      overallUrl: fallbackOverall,
    };
  }

  const manifest = await fetchProductPictureManifest(assetFamily);
  const thumbnailFile =
    String(manifest?.default_thumbnail || "").trim() ||
    String(findManifestFile(manifest, "thumbnail") || "").trim() ||
    String(manifest?.default_overall || "").trim() ||
    String(findManifestFile(manifest, "overall") || "").trim() ||
    "overall.png";
  const overallFile =
    String(manifest?.default_overall || "").trim() ||
    String(findManifestFile(manifest, "overall") || "").trim() ||
    thumbnailFile ||
    "overall.png";

  const thumbnailUrl = buildProductPictureUrl(assetFamily, thumbnailFile) || fallbackThumb;
  const overallUrl =
    buildProductPictureUrl(assetFamily, overallFile) || thumbnailUrl || fallbackOverall;

  return {
    templateId: templateId || "template_diechamoji",
    assetFamily,
    thumbnailUrl: thumbnailUrl || fallbackThumb,
    overallUrl: overallUrl || fallbackOverall || thumbnailUrl || fallbackThumb,
  };
}

function normalizeGraphImageUrl(rawUrl: unknown) {
  if (!rawUrl || !String(rawUrl).trim()) {
    return "";
  }
  const source = String(rawUrl).trim();
  if (source.startsWith("data:") || source.startsWith("blob:")) {
    return source;
  }
  try {
    const url = new URL(source, window.location.origin);
    url.protocol = window.location.protocol;
    return url.toString();
  } catch {
    return "";
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${APP_URLS.apiBase}${path}`);
  const result = await response.json();
  if (!response.ok || !result || !result.success) {
    throw new Error((result && (result.error || result.message)) || "请求失败");
  }
  return result.data as T;
}

export async function resolveProductThumbnail(productName: string, fallbackUrl: string) {
  try {
    const product = await apiGet<{ product_id?: number }>(
      `${API_PATHS.projectByModel}/${encodeURIComponent(productName)}`
    );
    const productId = Number(product?.product_id || 0);
    if (!productId) return fallbackUrl;

    const configRows = await apiGet<
      Array<{ component_sn?: number; image_url?: string; component_pic?: string }>
    >(`${API_PATHS.config}/${productId}`);
    const mainRow =
      (configRows || []).find((row) => Number(row?.component_sn || 0) === 1) ||
      (configRows || []).find(
        (row) => String(row?.image_url || "").trim() || String(row?.component_pic || "").trim()
      );

    const configImageUrl =
      normalizeGraphImageUrl(mainRow?.image_url) ||
      normalizeGraphImageUrl(buildEquipmentImageUrl(mainRow?.component_pic) || "");

    if (configImageUrl) {
      return configImageUrl;
    }

    const annotations = await apiGet<Array<{ image_url?: string }>>(
      `${API_PATHS.annotations}/${productId}`
    );
    return normalizeGraphImageUrl(annotations?.[0]?.image_url) || fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}

export function buildFallbackLibraryItems(): QuoteLibraryResolvedItem[] {
  return PRODUCT_LIBRARY.map((template) => ({
    deviceName: template.name,
    templateId: template.templateId,
    thumbnailUrl: resolveTemplateThumbnail(template),
    overallUrl: resolveTemplateOverall(template),
  }));
}
