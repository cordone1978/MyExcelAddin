import { ComponentRecord, JsonMap } from "./devCraftTypes";

const API_BASE = "https://localhost:3001/api";

export async function fetchJson<T = unknown>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const response = await fetch(url);
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || result.message || "请求失败");
  }
  return result.data as T;
}

export async function resolveProjectId(categoryName: string, projectModel: string): Promise<number> {
  const categories = await fetchJson<Array<JsonMap>>("/categories");
  const category = (categories || []).find((item) => String(item.name || "").trim() === categoryName.trim());

  if (category) {
    const projects = await fetchJson<Array<JsonMap>>(`/projects/${category.id}`);
    const project = (projects || []).find((item) => String(item.name || "").trim() === projectModel.trim());
    if (project) return Number(project.id);
  }

  const fallback = await fetchJson<JsonMap>(`/project-by-model/${encodeURIComponent(projectModel)}`);
  if (fallback?.product_id) return Number(fallback.product_id);

  throw new Error(`未找到项目型号: ${projectModel}`);
}

export function findComponent(configData: ComponentRecord[], componentName: string) {
  const target = componentName.trim().toLowerCase();
  return configData.find((item) =>
    String(item.component_name || "").trim().toLowerCase() === target
  );
}

export function getStandardPartPrice(configData: ComponentRecord[]): number | null {
  if (!Array.isArray(configData)) return null;
  const byName = configData.find((item) => String(item.component_name || "").trim() === "标准件");
  const byKind = configData.find((item) => String(item.whatkind || "").trim() === "标准件");
  const target = byName || byKind;
  if (!target) return null;
  return parseNumber(target.component_unitprice) || 0;
}

export function getCraftFieldNumber(config: JsonMap | null, field: string): number | null {
  if (!config) return null;
  const value = config[field] ?? config[field.toLowerCase()] ?? config[field.toUpperCase()];
  return parseNumber(value);
}

export function getCraftFieldString(config: JsonMap | null, field: string): string {
  if (!config) return "";
  const value = config[field] ?? config[field.toLowerCase()] ?? config[field.toUpperCase()];
  return value ? String(value).trim() : "";
}

export function buildCraftItems(config: JsonMap | null, prefix: "Inner" | "Outter") {
  const items = [] as Array<{ area: number | null; type: string | null }>;
  for (let i = 1; i <= 3; i++) {
    const area = getCraftFieldNumber(config, `${prefix}Area${i}`);
    const type = getCraftFieldString(config, `${prefix}CraftType${i}`);
    items.push({ area, type: type || null });
  }
  return items;
}

export function buildImageUrl(pic: unknown): string | null {
  if (!pic) return null;
  const file = String(pic).trim();
  if (!file) return null;
  return `${API_BASE.replace("/api", "")}/public/images/${file}.png`;
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
