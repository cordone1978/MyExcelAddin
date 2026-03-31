/**
 * storageAdapter.ts
 *
 * 数据持久化适配层。当前实现将读写委托给 workbookStore（Excel 隐藏工作表），
 * 迁移到纯 Web 时只需换一个实现（IndexedDB / 后端 API），调用方代码不变。
 */

import type {
  WorkbookGraphPayload,
  GraphProductLibraryEntry,
} from "../graph-editor/workbookStore";

export interface GraphStorageAdapter {
  saveGraph(payload: WorkbookGraphPayload): Promise<void>;
  loadGraph(): Promise<WorkbookGraphPayload | null>;
  loadQuoteConfigProducts(): Promise<string[]>;
  loadProductLibraryEntries(): Promise<GraphProductLibraryEntry[]>;
  upsertProductLibraryEntry(entry: GraphProductLibraryEntry): Promise<void>;
}

/**
 * 创建基于 Excel 工作簿的存储适配器（当前环境使用）。
 * 懒加载 workbookStore 模块，避免在非 Excel 环境下报错。
 */
export async function createWorkbookStorageAdapter(): Promise<GraphStorageAdapter> {
  const store = await import("../graph-editor/workbookStore");
  return {
    saveGraph: (payload) => store.saveGraphToWorkbook(payload),
    loadGraph: () => store.loadGraphFromWorkbook(),
    loadQuoteConfigProducts: () => store.loadQuoteConfigProductsFromWorkbook(),
    loadProductLibraryEntries: () => store.loadGraphProductLibraryEntries(),
    upsertProductLibraryEntry: (entry) => store.upsertGraphProductLibraryEntry(entry),
  };
}
