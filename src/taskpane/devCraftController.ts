import { getSelectionContext, SelectionContext, writeToSheet } from "./quotationSelectionService";
import {
  buildCraftItems,
  buildImageUrl,
  fetchJson,
  findComponent,
  getCraftFieldNumber,
  getStandardPartPrice,
  resolveProjectId,
} from "./devCraftDataService";
import {
  ComponentRecord,
  CraftModifySubmitPayload,
  CraftPriceRecord,
  DevModifySubmitPayload,
  MaterialOptionRecord,
} from "./devCraftTypes";
import { DIALOG_ACTIONS } from "../shared/dialogActions";
import { API_PATHS, CRAFTING_CONSTANTS, DIALOG_PATHS, DIALOG_SIZES } from "../shared/appConstants";
import { FLOW_MESSAGES } from "../shared/businessTextConstants";

/* global console, Office */

type DevModifyState = {
  selection: SelectionContext;
  initData: Record<string, unknown>;
  projectId: number;
  componentId: number;
  materialPrice: number | null;
  standardPrice: number | null;
};

type CraftModifyState = {
  selection: SelectionContext;
  initData: Record<string, unknown>;
  standardPrice: number | null;
  materialPrice: number | null;
};

type DisplayDialogFn = (
  path: string,
  size?: { width: number; height: number }
) => Promise<Office.Dialog>;

export function createDevCraftController(displayDialog: DisplayDialogFn) {
  let devModifyState: DevModifyState | null = null;
  let craftModifyState: CraftModifyState | null = null;
  let reopenDevModifyAfterCraft = false;

  async function openDevModifyDialog() {
    const selection = await getSelectionContext();
    if (!selection) return;

    try {
      const initData = await buildDevModifyInit(selection);
      devModifyState = initData.state;
      await openDevModifyDialogWithData(initData.data, selection);
    } catch (error) {
      console.error(FLOW_MESSAGES.openDevDialogFailed, error);
    }
  }

  async function openDevModifyDialogWithData(initData: Record<string, unknown>, selection: SelectionContext) {
    const dialog = await displayDialog(DIALOG_PATHS.devModify, DIALOG_SIZES.devModify);

    dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (args) => {
      const payload = JSON.parse(args.message || "{}");

      if (payload?.action === DIALOG_ACTIONS.DEVMODIFY_READY) {
        dialog.messageChild(JSON.stringify({ action: DIALOG_ACTIONS.INIT, data: initData }));
        return;
      }

      if (payload?.action === DIALOG_ACTIONS.DEVMODIFY_SUBMIT) {
        await handleDevModifySubmit(payload as DevModifySubmitPayload);
        dialog.close();
        return;
      }

      if (payload?.action === DIALOG_ACTIONS.DEVMODIFY_CANCEL) {
        dialog.close();
        return;
      }

      if (payload?.action === DIALOG_ACTIONS.OPEN_CRAFTMODIFY) {
        return;
      }
    });
  }

  async function openCraftModifyDialog(selection?: SelectionContext) {
    const targetSelection = selection || (await getSelectionContext());
    if (!targetSelection) return;

    try {
      const initData = await buildCraftModifyInit(targetSelection);
      const dialog = await displayDialog(DIALOG_PATHS.craftModify);
      craftModifyState = initData.state;

      dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (args) => {
        const payload = JSON.parse(args.message || "{}");

        if (payload?.action === DIALOG_ACTIONS.CRAFTMODIFY_READY) {
          dialog.messageChild(JSON.stringify({ action: DIALOG_ACTIONS.INIT, data: initData.data }));
          return;
        }

        if (payload?.action === DIALOG_ACTIONS.CRAFTMODIFY_SUBMIT) {
          await handleCraftModifySubmit(payload as CraftModifySubmitPayload);
          dialog.close();
          return;
        }

        if (payload?.action === DIALOG_ACTIONS.CRAFTMODIFY_CANCEL) {
          dialog.close();
          return;
        }
      });
    } catch (error) {
      console.error(FLOW_MESSAGES.openCraftDialogFailed, error);
    }
  }

  async function handleDevModifySubmit(data: DevModifySubmitPayload) {
    if (!devModifyState) return;

    if (data?.whatKind === CRAFTING_CONSTANTS.outsourcedKind && !data?.isPriceChanged) {
      console.warn(FLOW_MESSAGES.outsourcedPriceNotSelected);
      return;
    }

    const price = data?.whatKind === CRAFTING_CONSTANTS.outsourcedKind ? data?.currentPrice : data?.refreshedPrice;

    await writeToSheet(devModifyState.selection, {
      desc: data?.desc || devModifyState.selection.componentDesc,
      type: data?.type || devModifyState.selection.componentType,
      material: data?.material || devModifyState.selection.componentMaterial,
      brand: data?.brand || devModifyState.selection.componentBrand,
      unit: data?.unit || devModifyState.selection.componentUnit,
      price: price ?? devModifyState.selection.currentPrice,
    });
  }

  async function handleCraftModifySubmit(payload: CraftModifySubmitPayload) {
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

    const price =
      (craftModifyState.standardPrice || 0) +
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
    const configData = await fetchJson<ComponentRecord[]>(`${API_PATHS.config}/${projectId}`);
    const component = findComponent(configData, selection.componentName);

    if (!component) {
      throw new Error(`${FLOW_MESSAGES.componentNotFoundPrefix}: ${selection.componentName}`);
    }

    const componentId = Number(component.config_id || component.component_id);
    const materialOptions = await fetchJson<MaterialOptionRecord[]>(`${API_PATHS.materials}/${componentId}`);
    const craftingConfigList = await fetchJson<Record<string, unknown>[]>(`${API_PATHS.crafting}/${componentId}`);
    const craftingConfig = craftingConfigList?.[0] || null;
    const craftPrices = await fetchJson<CraftPriceRecord[]>(API_PATHS.craftPrices);

    const materialPrice = getCraftFieldNumber(craftingConfig, "MaterialsPrice");
    const standardPrice = getStandardPartPrice(configData);
    const currentPrice = selection.currentPrice ?? 0;
    const craftPrice = currentPrice - (materialPrice || 0) - (standardPrice || 0);

    const materialList = (materialOptions || []).map((item) => ({
      name: item.material_type,
      price: Number(item.totalprice || 0),
    }));
    if (materialList.length === 0 && selection.componentMaterial) {
      materialList.push({
        name: selection.componentMaterial,
        price: materialPrice || 0,
      });
    }

    const data: Record<string, unknown> = {
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
      craftUnitOptions: (craftPrices || []).map((item) => ({
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
    const configData = await fetchJson<ComponentRecord[]>(`${API_PATHS.config}/${projectId}`);
    const component = findComponent(configData, selection.componentName);

    if (!component) {
      throw new Error(`${FLOW_MESSAGES.componentNotFoundPrefix}: ${selection.componentName}`);
    }

    const componentId = Number(component.config_id || component.component_id);
    const craftingConfigList = await fetchJson<Record<string, unknown>[]>(`${API_PATHS.crafting}/${componentId}`);
    const craftingConfig = craftingConfigList?.[0] || null;
    const craftPrices = await fetchJson<CraftPriceRecord[]>(API_PATHS.craftPrices);

    const data: Record<string, unknown> = {
      inner: buildCraftItems(craftingConfig, "Inner"),
      outer: buildCraftItems(craftingConfig, "Outter"),
      unitOptions: (craftPrices || []).map((item) => ({
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

  return {
    openDevModifyDialog,
    openCraftModifyDialog,
  };
}

