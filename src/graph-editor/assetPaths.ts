export const EQUIPMENT_ASSET_BASE = "assets/equipment";

export function equipmentAssetPath(...segments: string[]) {
  const normalized = segments
    .map((segment) => String(segment || "").trim().replace(/\\/g, "/"))
    .filter(Boolean);
  return `${EQUIPMENT_ASSET_BASE}/${normalized.join("/")}`;
}
