import { APP_URLS } from "./appConstants";

export function buildEquipmentImageUrl(componentPic: unknown): string | null {
  const raw = String(componentPic || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.replace(/^\/+/, "");
  return `/${normalized}`;
}
