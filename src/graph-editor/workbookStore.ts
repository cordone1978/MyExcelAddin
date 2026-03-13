/* global Excel */
import { BUILDSHEET_TEXT } from "../shared/businessTextConstants";
import { SHEET_NAMES } from "../shared/sheetNames";

export type WorkbookGraphPayload = {
  schemaVersion: string;
  updatedAt: string;
  graph: {
    nodes: unknown[];
    edges: unknown[];
    updatedAt: string;
  };
  images: Record<string, string>;
};

export type GraphProductLibraryEntry = {
  deviceName: string;
  templateId: string;
  thumbnailUrl: string;
  productId?: number | null;
  productName?: string | null;
  updatedAt: string;
};

const SHEET_NAME = "_graph_store";
const SCHEMA_MARK = "GRAPH_SCHEMA_V1";
const CELL_SCHEMA = "A1";
const CELL_GRAPH = "A2";
const CELL_IMAGE_INDEX = "A3";
const IMAGE_DATA_START_ROW = 10;
const MAX_CELL_CHARS = 30000;
const PRODUCT_LIBRARY_SHEET = "_graph_product_library";
const PRODUCT_LIBRARY_MARK = "GRAPH_PRODUCT_LIBRARY_V1";
const PRODUCT_LIBRARY_HEADER_ROW = 2;
const PRODUCT_LIBRARY_DATA_START_ROW = 3;

type ImageIndexItem = {
  key: string;
  startRow: number;
  chunkCount: number;
};

function chunkText(text: string, size: number) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [""];
}

function ensureHiddenStoreSheet(context: Excel.RequestContext) {
  const sheet = context.workbook.worksheets.getItemOrNullObject(SHEET_NAME);
  sheet.load("name,isNullObject");
  return sheet;
}

export async function saveGraphToWorkbook(payload: WorkbookGraphPayload) {
  await Excel.run(async (context) => {
    let sheet = ensureHiddenStoreSheet(context);
    await context.sync();

    if (sheet.isNullObject) {
      sheet = context.workbook.worksheets.add(SHEET_NAME);
    }

    sheet.visibility = Excel.SheetVisibility.hidden;

    const graphJson = JSON.stringify(payload.graph || { nodes: [], edges: [], updatedAt: "" });
    const imageEntries = Object.entries(payload.images || {});
    const imageIndex: ImageIndexItem[] = [];
    const cellValues: string[][] = [];

    let rowCursor = IMAGE_DATA_START_ROW;
    imageEntries.forEach(([key, data]) => {
      const chunks = chunkText(String(data || ""), MAX_CELL_CHARS);
      imageIndex.push({ key, startRow: rowCursor, chunkCount: chunks.length });
      chunks.forEach((chunk) => {
        cellValues.push([chunk]);
        rowCursor += 1;
      });
    });

    sheet.getRange(CELL_SCHEMA).values = [[SCHEMA_MARK]];
    sheet.getRange(CELL_GRAPH).values = [[graphJson]];
    sheet.getRange(CELL_IMAGE_INDEX).values = [[JSON.stringify(imageIndex)]];

    const used = sheet.getUsedRangeOrNullObject(true);
    used.load("isNullObject,rowCount");
    await context.sync();
    if (!used.isNullObject && used.rowCount > IMAGE_DATA_START_ROW) {
      const clearEnd = Math.max(IMAGE_DATA_START_ROW, used.rowCount + 20);
      sheet.getRange(`A${IMAGE_DATA_START_ROW}:A${clearEnd}`).clear(Excel.ClearApplyTo.contents);
    }

    if (cellValues.length > 0) {
      const endRow = IMAGE_DATA_START_ROW + cellValues.length - 1;
      sheet.getRange(`A${IMAGE_DATA_START_ROW}:A${endRow}`).values = cellValues;
    }

    await context.sync();
  });
}

export async function loadGraphFromWorkbook(): Promise<WorkbookGraphPayload | null> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItemOrNullObject(SHEET_NAME);
    sheet.load("name,isNullObject");
    await context.sync();
    if (sheet.isNullObject) {
      return null;
    }

    const metaRange = sheet.getRange("A1:A3");
    metaRange.load("values");
    await context.sync();

    const schema = String(metaRange.values?.[0]?.[0] || "").trim();
    if (schema !== SCHEMA_MARK) {
      return null;
    }

    const graphJson = String(metaRange.values?.[1]?.[0] || "").trim();
    const imageIndexJson = String(metaRange.values?.[2]?.[0] || "[]").trim();
    if (!graphJson) {
      return null;
    }

    const graph = JSON.parse(graphJson) as WorkbookGraphPayload["graph"];
    const imageIndex = (JSON.parse(imageIndexJson || "[]") as ImageIndexItem[]).filter(
      (item) => item && item.key && item.startRow >= IMAGE_DATA_START_ROW && item.chunkCount > 0
    );

    const images: Record<string, string> = {};
    for (const item of imageIndex) {
      const endRow = item.startRow + item.chunkCount - 1;
      const range = sheet.getRange(`A${item.startRow}:A${endRow}`);
      range.load("values");
      await context.sync();
      const chunks = (range.values || []).map((row) => String(row?.[0] || ""));
      images[item.key] = chunks.join("");
    }

    return {
      schemaVersion: "1.0",
      updatedAt: String((graph && graph.updatedAt) || ""),
      graph: graph || { nodes: [], edges: [], updatedAt: "" },
      images,
    };
  });
}

export async function loadQuoteConfigProductsFromWorkbook(): Promise<string[]> {
  return Excel.run(async (context) => {
    const workbookSheets = context.workbook.worksheets;
    workbookSheets.load("items/name");
    await context.sync();

    const quoteSheetName = workbookSheets.items
      .map((item) => String(item.name || "").trim())
      .find((name) => name === SHEET_NAMES.quoteConfig || name === "配置报价表" || name.includes("报价配置"));

    if (!quoteSheetName) {
      return [];
    }

    const sheet = context.workbook.worksheets.getItem(quoteSheetName);
    const usedRange = sheet.getRange("A:C").getUsedRangeOrNullObject(false);
    usedRange.load(["values", "isNullObject"]);
    await context.sync();
    if (usedRange.isNullObject) {
      return [];
    }

    const values = usedRange.values || [];
    const headerSerial = String(BUILDSHEET_TEXT.configHeaders[0] || "").trim();
    const seen = new Set<string>();
    const result: string[] = [];
    let currentDevice = "";

    values.forEach((row) => {
      const colA = String(row?.[0] || "").trim();
      const colB = String(row?.[1] || "").trim();
      const colC = String(row?.[2] || "").trim();
      if (/^[一二三四五六七八九十百零]+$/.test(colA)) return;
      if (colA === headerSerial) return;
      if (colB) {
        currentDevice = colB;
      }
      if (!colC || !currentDevice) return;
      if (seen.has(currentDevice)) return;
      seen.add(currentDevice);
      result.push(currentDevice);
    });
    return result;
  });
}

export async function upsertGraphProductLibraryEntry(entry: GraphProductLibraryEntry): Promise<void> {
  const deviceName = String(entry.deviceName || "").trim();
  const templateId = String(entry.templateId || "").trim();
  const thumbnailUrl = String(entry.thumbnailUrl || "").trim();
  if (!deviceName || !templateId || !thumbnailUrl) {
    return;
  }

  await Excel.run(async (context) => {
    let sheet = context.workbook.worksheets.getItemOrNullObject(PRODUCT_LIBRARY_SHEET);
    sheet.load("name,isNullObject");
    await context.sync();

    if (sheet.isNullObject) {
      sheet = context.workbook.worksheets.add(PRODUCT_LIBRARY_SHEET);
    }

    sheet.visibility = Excel.SheetVisibility.hidden;
    sheet.getRange("A1:F1").values = [[PRODUCT_LIBRARY_MARK, "", "", "", "", ""]];
    sheet.getRange(`A${PRODUCT_LIBRARY_HEADER_ROW}:F${PRODUCT_LIBRARY_HEADER_ROW}`).values = [[
      "device_name",
      "template_id",
      "thumbnail_url",
      "product_id",
      "product_name",
      "updated_at",
    ]];

    const used = sheet.getUsedRangeOrNullObject(true);
    used.load(["isNullObject", "rowCount"]);
    await context.sync();

    let targetRow = PRODUCT_LIBRARY_DATA_START_ROW;
    if (!used.isNullObject && (used.rowCount || 0) >= PRODUCT_LIBRARY_DATA_START_ROW) {
      const dataEndRow = Math.max(PRODUCT_LIBRARY_DATA_START_ROW, used.rowCount);
      const dataRange = sheet.getRange(`A${PRODUCT_LIBRARY_DATA_START_ROW}:F${dataEndRow}`);
      dataRange.load("values");
      await context.sync();
      const rows = dataRange.values || [];
      const foundIndex = rows.findIndex((row) => String(row?.[0] || "").trim() === deviceName);
      if (foundIndex >= 0) {
        targetRow = PRODUCT_LIBRARY_DATA_START_ROW + foundIndex;
      } else {
        targetRow = PRODUCT_LIBRARY_DATA_START_ROW + rows.filter((row) => String(row?.[0] || "").trim()).length;
      }
    }

    sheet.getRange(`A${targetRow}:F${targetRow}`).values = [[
      deviceName,
      templateId,
      thumbnailUrl,
      entry.productId == null ? "" : Number(entry.productId),
      String(entry.productName || "").trim(),
      String(entry.updatedAt || new Date().toISOString()),
    ]];

    await context.sync();
  });
}

export async function loadGraphProductLibraryEntries(): Promise<GraphProductLibraryEntry[]> {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItemOrNullObject(PRODUCT_LIBRARY_SHEET);
    sheet.load("name,isNullObject");
    await context.sync();
    if (sheet.isNullObject) {
      return [];
    }

    const metaRange = sheet.getRange("A1:A2");
    metaRange.load("values");
    const used = sheet.getUsedRangeOrNullObject(true);
    used.load(["isNullObject", "rowCount"]);
    await context.sync();

    const mark = String(metaRange.values?.[0]?.[0] || "").trim();
    if (mark !== PRODUCT_LIBRARY_MARK || used.isNullObject || (used.rowCount || 0) < PRODUCT_LIBRARY_DATA_START_ROW) {
      return [];
    }

    const dataEndRow = Math.max(PRODUCT_LIBRARY_DATA_START_ROW, used.rowCount);
    const dataRange = sheet.getRange(`A${PRODUCT_LIBRARY_DATA_START_ROW}:F${dataEndRow}`);
    dataRange.load("values");
    await context.sync();

    return (dataRange.values || [])
      .map((row) => ({
        deviceName: String(row?.[0] || "").trim(),
        templateId: String(row?.[1] || "").trim(),
        thumbnailUrl: String(row?.[2] || "").trim(),
        productId: row?.[3] === "" ? null : Number(row?.[3] || 0),
        productName: String(row?.[4] || "").trim(),
        updatedAt: String(row?.[5] || "").trim(),
      }))
      .filter((item) => item.deviceName && item.templateId && item.thumbnailUrl);
  });
}
