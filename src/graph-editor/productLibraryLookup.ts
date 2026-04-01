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
    relative_path?: string;
  }>;
};

type ProductPictureApiRow = {
  pictureCode?: string;
  fileName?: string;
  relativePath?: string;
  isDefault?: boolean;
  sortOrder?: number | null;
  versionNo?: number | null;
};

type ProductPictureApiResponse = {
  productCode?: string;
  productName?: string;
  assetFamily?: string;
  thumbnailPath?: string;
  overallPath?: string;
  pictures?: ProductPictureApiRow[];
};

type ProductPictureResolution = {
  templateId: string;
  assetFamily: string;
  thumbnailUrl: string;
  overallUrl: string;
};

const TEMPLATE_TYPE_TEMPLATE_IDS: Record<string, string> = {
  mill: "template_diechamoji",
  silo: "template_silo",
  cyclone: "template_cyclone",
  pipe: "template_pipe",
};

const ASSET_FAMILY_TEMPLATE_IDS: Record<string, string> = {
  ddm6a: "template_diechamoji",
  "fjm-1250": "template_diechamoji",
  "pre-dryer": "template_cyclone",
  "silo-2000l": "template_silo",
};

const manifestCache = new Map<string, Promise<ProductPictureManifest | null>>();
const pictureApiCache = new Map<string, Promise<ProductPictureApiResponse | null>>();

function normalizeKey(value: string) {
  return String(value || "").trim().toLowerCase();
}

function buildProductPictureUrl(assetFamily: string, fileName: string) {
  const family = String(assetFamily || "").trim().replace(/^\/+|\/+$/g, "");
  const file = String(fileName || "").trim().replace(/^\/+/, "");
  if (!family || !file) return "";
  return `/assets/equipment/${family}/${file}`;
}

function normalizePicturePath(rawPath: unknown) {
  const source = String(rawPath || "").trim();
  if (!source) return "";
  if (source.startsWith("data:") || source.startsWith("blob:") || /^https?:\/\//i.test(source)) {
    return source;
  }
  const normalized = source.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.startsWith("assets/equipment/")) {
    return `/${normalized}`;
  }
  return normalized ? `/${normalized}` : "";
}

function findManifestFile(manifest: ProductPictureManifest | null, pictureCode: string) {
  return (
    (manifest?.pictures || []).find(
      (item) => normalizeKey(String(item?.picture_code || "")) === normalizeKey(pictureCode)
    )?.file_name || ""
  );
}

async function fetchProductPictureManifest(assetFamily: string): Promise<ProductPictureManifest | null> {
  const key = normalizeKey(assetFamily);
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

async function fetchProductPictureData(productCode: string): Promise<ProductPictureApiResponse | null> {
  const key = String(productCode || "").trim();
  if (!key) return null;
  if (!pictureApiCache.has(key)) {
    pictureApiCache.set(
      key,
      (async () => {
        try {
          const response = await fetch(
            `${APP_URLS.apiBase}${API_PATHS.productPictures}/${encodeURIComponent(key)}`,
            { cache: "no-cache" }
          );
          const result = await response.json();
          if (!response.ok || !result?.success) {
            return null;
          }
          return (result.data || null) as ProductPictureApiResponse | null;
        } catch {
          return null;
        }
      })()
    );
  }
  return (await pictureApiCache.get(key)) || null;
}

function resolveTemplateId(explicitTemplateType: string, assetFamily: string) {
  const templateFromType = TEMPLATE_TYPE_TEMPLATE_IDS[normalizeKey(explicitTemplateType)];
  if (templateFromType) return templateFromType;
  return ASSET_FAMILY_TEMPLATE_IDS[normalizeKey(assetFamily)] || "";
}

export function resolveTemplateById(templateId: string) {
  return (
    PRODUCT_LIBRARY.find((template) => template.templateId === String(templateId || "").trim()) || null
  );
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

function resolveUrlFromManifest(
  manifest: ProductPictureManifest | null,
  assetFamily: string,
  pictureCode: string,
  defaultFile: string
) {
  const directPath =
    (manifest?.pictures || []).find(
      (item) => normalizeKey(String(item?.picture_code || "")) === normalizeKey(pictureCode)
    )?.relative_path || "";
  if (directPath) {
    return normalizePicturePath(directPath);
  }
  const fileName = String(defaultFile || "").trim() || String(findManifestFile(manifest, pictureCode) || "").trim();
  return fileName ? buildProductPictureUrl(assetFamily, fileName) : "";
}

export async function resolveProductPictureSet(
  productCode: string,
  fallbackThumbnailUrl = "",
  fallbackOverallUrl = ""
): Promise<ProductPictureResolution | null> {
  const apiData = await fetchProductPictureData(productCode);
  const assetFamily = String(apiData?.assetFamily || "").trim();
  const manifest = assetFamily ? await fetchProductPictureManifest(assetFamily) : null;
  const templateId = resolveTemplateId(String(manifest?.template_type || ""), assetFamily);
  const template = templateId ? resolveTemplateById(templateId) : null;

  const templateThumb = template ? resolveTemplateThumbnail(template) : "";
  const templateOverall = template ? resolveTemplateOverall(template) : templateThumb;
  const fallbackThumb = String(fallbackThumbnailUrl || templateThumb || "").trim();
  const fallbackOverall = String(fallbackOverallUrl || templateOverall || fallbackThumb).trim();

  const thumbnailUrl =
    normalizePicturePath(apiData?.thumbnailPath) ||
    resolveUrlFromManifest(
      manifest,
      assetFamily,
      "thumbnail",
      String(manifest?.default_thumbnail || "").trim() ||
        String(manifest?.default_overall || "").trim() ||
        "overall.png"
    ) ||
    resolveUrlFromManifest(
      manifest,
      assetFamily,
      "overall",
      String(manifest?.default_overall || "").trim() || "overall.png"
    ) ||
    fallbackThumb;

  const overallUrl =
    normalizePicturePath(apiData?.overallPath) ||
    resolveUrlFromManifest(
      manifest,
      assetFamily,
      "overall",
      String(manifest?.default_overall || "").trim() || "overall.png"
    ) ||
    thumbnailUrl ||
    fallbackOverall;

  if (!templateId || !thumbnailUrl) {
    return null;
  }

  return {
    templateId,
    assetFamily,
    thumbnailUrl,
    overallUrl: overallUrl || thumbnailUrl,
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
