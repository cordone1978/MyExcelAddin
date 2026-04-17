export function extractInfo(text: string, keywords: string[]): string {
  if (!text) return "";
  for (const keyword of keywords) {
    const pos = text.indexOf(keyword);
    if (pos >= 0) {
      const remaining = text.substring(pos + keyword.length).replace(/^[:：\s]+/, "");
      const match = remaining.match(/^[^;；，,。\s]+/);
      if (match) return match[0].trim();
    }
  }
  return "";
}

export function extractBrand(text: string, brandKeywords: string[]): string {
  return extractInfo(text, brandKeywords);
}

export function extractMaterial(text: string, materialKeywords: string[]): string {
  return extractInfo(text, materialKeywords);
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatPriceInteger(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return String(Math.round(value));
}

export function formatPriceDecimal(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(num)) return "-";
  return num.toFixed(2);
}
