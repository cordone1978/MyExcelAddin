/* global Excel */

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

const SHEET_NAME = "_graph_store";
const SCHEMA_MARK = "GRAPH_SCHEMA_V1";
const CELL_SCHEMA = "A1";
const CELL_GRAPH = "A2";
const CELL_IMAGE_INDEX = "A3";
const IMAGE_DATA_START_ROW = 10;
const MAX_CELL_CHARS = 30000;

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
