export const SHEET_NAMES = {
  quoteSummary: "报价汇总表",
  quoteConfig: "报价配置表",
  wearParts: "易损件表",
} as const;

export const SHEET_NAME_ALIASES = {
  wearParts: ["易损件表", "易损表"],
} as const;

export function isWearPartsSheetName(sheetName: string): boolean {
  const normalized = String(sheetName || "").trim();
  return SHEET_NAME_ALIASES.wearParts.some((alias) => alias === normalized);
}
