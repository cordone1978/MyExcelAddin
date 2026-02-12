import { createQuotationSheet } from "../buildsheet";
import { handleDialogData } from "../dialog/handleDialogData";

/* global console, document, Excel, Office */

const API_BASE = "https://localhost:3001/api";

type SelectionContext = {
  sheetName: string;
  row: number;
  column: number;
  targetColumn: string;
  isEasyparts: boolean;
  categoryName: string;
  projectModel: string;
  componentName: string;
  componentDesc: string;
  componentType: string;
  componentMaterial: string;
  componentBrand: string;
  componentUnit: string;
  currentPrice: number | null;
};

type DevModifyState = {
  selection: SelectionContext;
  initData: any;
  projectId: number;
  componentId: number;
  materialPrice: number | null;
  standardPrice: number | null;
};

type CraftModifyState = {
  selection: SelectionContext;
  initData: any;
  standardPrice: number | null;
  materialPrice: number | null;
};

let devModifyDialog: Office.Dialog | null = null;
let craftModifyDialog: Office.Dialog | null = null;
let devModifyState: DevModifyState | null = null;
let craftModifyState: CraftModifyState | null = null;
let reopenDevModifyAfterCraft = false;

Office.onReady((info) => {
  if (info.host === Office.HostType.Excel) {
    document.getElementById("sideload-msg").style.display = "none";
    document.getElementById("app-body").style.display = "flex";

    (window as any).openDialog = openDialog;
    (window as any).openDevModifyDialog = openDevModifyDialog;
    (window as any).openCraftModifyDialog = openCraftModifyDialog;
    (window as any).createQuotationSheet = createQuotationSheet;
    warmUpDialogResources();
  }
});

export async function run() {
  try {
    await Excel.run(async (context) => {
      const range = context.workbook.getSelectedRange();
      range.load("address");
      range.format.fill.color = "yellow";
      await context.sync();
      console.log(`The range address was ${range.address}.`);
    });
  } catch (error) {
    console.error(error);
  }
}

function openDialog(url?: string) {
  const dialogPath = url || "dialog.html";
  const dialogUrl = new URL(dialogPath, window.location.origin).toString();
  const start = performance.now();
  const isOfficeOnline = Office.context.platform === Office.PlatformType.OfficeOnline;
  Office.context.ui.displayDialogAsync(
    dialogUrl,
    { height: 65, width: 60, displayInIframe: isOfficeOnline },
    function (result) {
      const elapsedMs = Math.round(performance.now() - start);
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        console.log(`Dialog opened successfully in ${elapsedMs}ms`);
        const dialog = result.value;
        dialog.addEventHandler(Office.EventType.DialogMessageReceived, async function (args) {
          dialog.close();
          try {
            const data = JSON.parse(args.message);
            await handleDialogData(data);
          } catch (error: any) {
            console.error("处理对话框数据失败:", error);
          }
        });
      } else {
        console.error(`Error opening dialog after ${elapsedMs}ms:`, result.error.message);
      }
    }
  );
}

async function openDevModifyDialog() {
  const selection = await getSelectionContext();
  if (!selection) return;

  try {
    const initData = await buildDevModifyInit(selection);
    devModifyState = initData.state;
    await openDevModifyDialogWithData(initData.data, selection);
  } catch (error) {
    console.error("打开更改设备失败:", error);
  }
}

async function openDevModifyDialogWithData(initData: any, selection: SelectionContext) {
  const dialog = await displayDialog("devmodify.html", { width: 75, height: 60 });
  devModifyDialog = dialog;

  dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (args) => {
    const payload = JSON.parse(args.message || "{}");

    if (payload?.action === "devmodify_ready") {
      dialog.messageChild(JSON.stringify({ action: "init", data: initData }));
      return;
    }

    if (payload?.action === "devmodify_submit") {
      await handleDevModifySubmit(payload);
      dialog.close();
      return;
    }

    if (payload?.action === "devmodify_cancel") {
      dialog.close();
      return;
    }

    if (payload?.action === "open_craftmodify") {
      return;
    }
  });

  // init is sent after devmodify_ready
}

async function openCraftModifyDialog(selection?: SelectionContext) {
  const targetSelection = selection || (await getSelectionContext());
  if (!targetSelection) return;

  try {
    const initData = await buildCraftModifyInit(targetSelection);
    const dialog = await displayDialog("craftmodify.html");
    craftModifyDialog = dialog;
    craftModifyState = initData.state;

    dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (args) => {
      const payload = JSON.parse(args.message || "{}");

      if (payload?.action === "craftmodify_ready") {
        dialog.messageChild(JSON.stringify({ action: "init", data: initData.data }));
        return;
      }

      if (payload?.action === "craftmodify_submit") {
        await handleCraftModifySubmit(payload);
        dialog.close();
        return;
      }

      if (payload?.action === "craftmodify_cancel") {
        dialog.close();
        return;
      }
    });

    // init is sent after craftmodify_ready
  } catch (error) {
    console.error("打开更改工艺失败:", error);
  }
}

async function handleDevModifySubmit(data: any) {
  if (!devModifyState) return;

  if (data?.whatKind === "外购件" && !data?.isPriceChanged) {
    console.warn("外购件未选择价格，跳过更新");
    return;
  }

  const price = data?.whatKind === "外购件" ? data?.currentPrice : data?.refreshedPrice;

  await writeToSheet(devModifyState.selection, {
    desc: data?.desc || devModifyState.selection.componentDesc,
    type: data?.type || devModifyState.selection.componentType,
    material: data?.material || devModifyState.selection.componentMaterial,
    brand: data?.brand || devModifyState.selection.componentBrand,
    unit: data?.unit || devModifyState.selection.componentUnit,
    price: price ?? devModifyState.selection.currentPrice,
  });
}

async function handleCraftModifySubmit(payload: any) {
  const craftPrice = Number(payload?.data?.craftPrice || 0);
  const desc = String(payload?.data?.desc || "");

  if (reopenDevModifyAfterCraft && devModifyState) {
    devModifyState.initData.craftPrice = craftPrice;
    devModifyState.initData.desc = desc;
    reopenDevModifyAfterCraft = false;
    await openDevModifyDialogWithData(devModifyState.initData, devModifyState.selection);
    return;
  }

  if (!craftModifyState) return;

  const price = (craftModifyState.standardPrice || 0) +
    (craftModifyState.materialPrice || 0) +
    craftPrice;

  await writeToSheet(craftModifyState.selection, {
    desc: desc || craftModifyState.selection.componentDesc,
    type: craftModifyState.selection.componentType,
    material: craftModifyState.selection.componentMaterial,
    brand: craftModifyState.selection.componentBrand,
    unit: craftModifyState.selection.componentUnit,
    price,
  });
}

async function buildDevModifyInit(selection: SelectionContext) {
  const projectId = await resolveProjectId(selection.categoryName, selection.projectModel);
  const configData = await fetchJson(`/config/${projectId}`);
  const component = findComponent(configData, selection.componentName);

  if (!component) {
    throw new Error(`未找到组件配置: ${selection.componentName}`);
  }

  const componentId = Number(component.config_id || component.component_id);
  const materialOptions = await fetchJson(`/materials/${componentId}`);
  const craftingConfigList = await fetchJson(`/crafting/${componentId}`);
  const craftingConfig = craftingConfigList?.[0] || null;
  const craftPrices = await fetchJson(`/craft-prices`);

  const materialPrice = getCraftFieldNumber(craftingConfig, "MaterialsPrice");
  const standardPrice = getStandardPartPrice(configData);
  const currentPrice = selection.currentPrice ?? 0;
  const craftPrice = currentPrice - (materialPrice || 0) - (standardPrice || 0);

  const materialList = (materialOptions || []).map((item: any) => ({
    name: item.material_type,
    price: Number(item.totalprice || 0),
  }));
  if (materialList.length === 0 && selection.componentMaterial) {
    materialList.push({
      name: selection.componentMaterial,
      price: materialPrice || 0,
    });
  }

  const data = {
    deviceName: selection.componentName,
    currentPrice: currentPrice,
    materials: materialList,
    selectedMaterial: selection.componentMaterial,
    materialPrice: materialPrice || 0,
    craftPrice: Number.isFinite(craftPrice) ? craftPrice : 0,
    standardPrice: standardPrice || 0,
    desc: selection.componentDesc,
    type: selection.componentType,
    unit: selection.componentUnit,
    brand: selection.componentBrand,
    whatKind: component.whatkind || "",
    isPriceChanged: false,
    priceKeyword: selection.componentName,
    imageUrl: buildImageUrl(component.component_pic),
    craftUnitOptions: (craftPrices || []).map((item: any) => ({
      label: item.label,
      price: Number(item.price || 0),
      craftType: item.craftType || "",
    })),
    craftAreas: buildCraftItems(craftingConfig, "Inner").concat(buildCraftItems(craftingConfig, "Outter")),
    baseDesc: selection.componentDesc,
  };

  return {
    data,
    state: {
      selection,
      initData: data,
      projectId,
      componentId,
      materialPrice,
      standardPrice,
    } as DevModifyState,
  };
}

async function buildCraftModifyInit(selection: SelectionContext) {
  const projectId = await resolveProjectId(selection.categoryName, selection.projectModel);
  const configData = await fetchJson(`/config/${projectId}`);
  const component = findComponent(configData, selection.componentName);

  if (!component) {
    throw new Error(`未找到组件配置: ${selection.componentName}`);
  }

  const componentId = Number(component.config_id || component.component_id);
  const craftingConfigList = await fetchJson(`/crafting/${componentId}`);
  const craftingConfig = craftingConfigList?.[0] || null;
  const craftPrices = await fetchJson(`/craft-prices`);

  const data = {
    inner: buildCraftItems(craftingConfig, "Inner"),
    outer: buildCraftItems(craftingConfig, "Outter"),
    unitOptions: (craftPrices || []).map((item: any) => ({
      label: item.label,
      price: Number(item.price || 0),
      craftType: item.craftType || "",
    })),
    baseDesc: selection.componentDesc,
  };

  return {
    data,
    state: {
      selection,
      initData: data,
      standardPrice: getStandardPartPrice(configData),
      materialPrice: getCraftFieldNumber(craftingConfig, "MaterialsPrice"),
    } as CraftModifyState,
  };
}

function buildCraftItems(config: any, prefix: "Inner" | "Outter") {
  const items = [] as Array<{ area: number | null; type: string | null }>;
  for (let i = 1; i <= 3; i++) {
    const area = getCraftFieldNumber(config, `${prefix}Area${i}`);
    const type = getCraftFieldString(config, `${prefix}CraftType${i}`);
    items.push({ area, type: type || null });
  }
  return items;
}

async function getSelectionContext(): Promise<SelectionContext | null> {
  try {
    return await Excel.run(async (context) => {
      const range = context.workbook.getSelectedRange();
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      range.load(["rowIndex", "columnIndex"]);
      sheet.load("name");
      await context.sync();

      const row = range.rowIndex + 1;
      const column = range.columnIndex + 1;
      const targetColumn =
        column === 3 || column === 4 || column === 5 || column === 6 ? "C" : "";

      if (!targetColumn) {
        console.warn("请选择 C/D/E/F 列的组件单元格");
        return null;
      }

      const rowRange = sheet.getRange(`A${row}:N${row}`);
      rowRange.load("values");
      await context.sync();

      const values = rowRange.values[0] || [];
      const categoryName = String(values[0] || "").trim();
      const projectModel = String(values[1] || "").trim();
      const componentName = String(values[2] || "").trim();
      const componentDesc = String(values[3] || "").trim();
      const componentType = String(values[4] || "").trim();
      const componentMaterial = String(values[5] || "").trim();
      const componentBrand = String(values[6] || "").trim();
      const componentUnit = String(values[8] || "").trim();
      const isEasyparts = sheet.name === "易损件表";
      const priceCellValue = isEasyparts ? values[11] : values[13];
      const currentPrice = parseNumber(priceCellValue);

      if (!categoryName || !projectModel || !componentName) {
        console.warn("缺少类别、型号或组件名称");
        return null;
      }

      return {
        sheetName: sheet.name,
        row,
        column,
        targetColumn,
        isEasyparts,
        categoryName,
        projectModel,
        componentName,
        componentDesc,
        componentType,
        componentMaterial,
        componentBrand,
        componentUnit,
        currentPrice,
      };
    });
  } catch (error) {
    console.error("获取选区失败:", error);
    return null;
  }
}

async function writeToSheet(selection: SelectionContext, payload: any) {
  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(selection.sheetName);
    const targetCell = sheet.getRange(`${selection.targetColumn}${selection.row}`);

    const qtyCell = targetCell.getOffsetRange(0, 5);
    qtyCell.load("values");
    await context.sync();

    if (!qtyCell.values[0][0]) {
      qtyCell.values = [[1]];
    }

    targetCell.getOffsetRange(0, 1).values = [[payload.desc || ""]];
    targetCell.getOffsetRange(0, 2).values = [[payload.type || ""]];
    targetCell.getOffsetRange(0, 3).values = [[payload.material || ""]];
    targetCell.getOffsetRange(0, 4).values = [[payload.brand || ""]];
    targetCell.getOffsetRange(0, 6).values = [[payload.unit || ""]];

    const priceValue = payload.price ?? "";
    if (selection.isEasyparts) {
      targetCell.getOffsetRange(0, 9).values = [[priceValue]];
    } else {
      targetCell.getOffsetRange(0, 11).values = [[priceValue]];
    }

    await context.sync();
  });
}

function findComponent(configData: any[], componentName: string) {
  const target = componentName.trim().toLowerCase();
  return configData.find((item: any) =>
    String(item.component_name || "").trim().toLowerCase() === target
  );
}

function getStandardPartPrice(configData: any[]): number | null {
  if (!Array.isArray(configData)) return null;
  const byName = configData.find((item: any) => String(item.component_name || "").trim() === "标准件");
  const byKind = configData.find((item: any) => String(item.whatkind || "").trim() === "标准件");
  const target = byName || byKind;
  if (!target) return null;
  return parseNumber(target.component_unitprice) || 0;
}

function getCraftFieldNumber(config: any, field: string): number | null {
  if (!config) return null;
  const value = config[field] ?? config[field.toLowerCase()] ?? config[field.toUpperCase()];
  return parseNumber(value);
}

function getCraftFieldString(config: any, field: string): string {
  if (!config) return "";
  const value = config[field] ?? config[field.toLowerCase()] ?? config[field.toUpperCase()];
  return value ? String(value).trim() : "";
}

function buildImageUrl(pic: any): string | null {
  if (!pic) return null;
  const file = String(pic).trim();
  if (!file) return null;
  return `${API_BASE.replace("/api", "")}/public/images/${file}.png`;
}

async function resolveProjectId(categoryName: string, projectModel: string): Promise<number> {
  const categories = await fetchJson("/categories");
  const category = (categories || []).find((item: any) => String(item.name || "").trim() === categoryName.trim());

  if (category) {
    const projects = await fetchJson(`/projects/${category.id}`);
    const project = (projects || []).find((item: any) => String(item.name || "").trim() === projectModel.trim());
    if (project) return Number(project.id);
  }

  const fallback = await fetchJson(`/project-by-model/${encodeURIComponent(projectModel)}`);
  if (fallback?.product_id) return Number(fallback.product_id);

  throw new Error(`未找到产品型号: ${projectModel}`);
}

async function fetchJson(path: string): Promise<any> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const response = await fetch(url);
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || result.message || "请求失败");
  }
  return result.data;
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function warmUpDialogResources() {
  const dialogUrl = new URL("dialog.html", window.location.origin).toString();

  void fetch(dialogUrl, { credentials: "same-origin", cache: "force-cache" }).catch(() => {});
  void fetch("https://localhost:3001/api/test", { cache: "no-store" }).catch(() => {});
}

function displayDialog(
  path: string,
  size?: { width: number; height: number }
): Promise<Office.Dialog> {
  const dialogUrl = new URL(path, window.location.origin).toString();
  const isOfficeOnline = Office.context.platform === Office.PlatformType.OfficeOnline;
  const width = size?.width ?? 50;
  const height = size?.height ?? 60;

  return new Promise((resolve, reject) => {
    Office.context.ui.displayDialogAsync(
      dialogUrl,
      { height, width, displayInIframe: isOfficeOnline },
      (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value);
        } else {
          reject(result.error);
        }
      }
    );
  });
}
