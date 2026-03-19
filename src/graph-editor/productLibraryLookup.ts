/* global URL, window, fetch */
import { API_PATHS, APP_URLS } from "../shared/appConstants";
import { buildEquipmentImageUrl } from "../shared/equipmentImagePath";
import { ProductTemplate } from "./sceneTypes";
import { PRODUCT_LIBRARY } from "./productLibrary";

export type QuoteLibraryResolvedItem = {
  deviceName: string;
  templateId: string;
  thumbnailUrl: string;
};

const TEMPLATE_FAMILY_RULES: Array<{ templateId: string; keywords: string[] }> = [
  { templateId: "template_silo", keywords: ["暂存仓", "料仓", "仓"] },
  { templateId: "template_pipe", keywords: ["输送管", "管道", "管"] },
  { templateId: "template_cyclone", keywords: ["旋风", "分离器"] },
  { templateId: "template_diechamoji", keywords: ["碟巢磨机", "磨机", "DCM", "DCM", "dcm", "DCM500", "dcm500"] },
];

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

export function resolveTemplateFromProductName(productName: string) {
  const source = String(productName || "").trim();
  if (!source) return null;

  const familyRule = TEMPLATE_FAMILY_RULES.find((rule) =>
    rule.keywords.some((keyword) => source.includes(keyword))
  );
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
  }));
}
