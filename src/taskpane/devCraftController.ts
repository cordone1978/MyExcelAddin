import { getSelectionContext, SelectionContext, writeToSheet } from "./quotationSelectionService";
import {
  buildCraftItems,
  buildImageUrl,
  fetchJson,
  findComponent,
  getCraftFieldNumber,
  resolveProjectId,
} from "./devCraftDataService";
import { openQueryPriceDialogControllerWithOptions } from "./querypriceController";
import {
  ComponentCraftRecord,
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
};

type CraftModifyState = {
  selection: SelectionContext;
  initData: Record<string, unknown>;
  materialPrice: number | null;
};

type SelectedComponentContext = {
  projectId: number;
  configData: ComponentRecord[];
  component: ComponentRecord;
};

type DisplayDialogFn = (
  path: string,
  size?: { width: number; height: number }
) => Promise<Office.Dialog>;

function getDialogMessage(args: { message: string; origin: string } | { error: number }) {
  return "message" in args ? args.message : "";
}

export function createDevCraftController(displayDialog: DisplayDialogFn) {
  let devModifyState: DevModifyState | null = null;
  let craftModifyState: CraftModifyState | null = null;
  let reopenDevModifyAfterCraft = false;

  async function openDevModifyDialog() {
    const selection = await getSelectionContext();

    try {
      const componentContext = await resolveSelectedComponentContext(selection);
      if (
        String(componentContext.component.whatkind || "").trim() ===
        CRAFTING_CONSTANTS.outsourcedKind
      ) {
        await openQueryPriceDialogControllerWithOptions(displayDialog, {
          initialKeyword: selection.componentName,
        });
        return;
      }
      const initData = await buildDevModifyInit(selection, componentContext);
      devModifyState = initData.state;
      await openDevModifyDialogWithData(initData.data, selection);
    } catch (error: any) {
      console.error(FLOW_MESSAGES.openDevDialogFailed, error);
      const message = String(error?.message || FLOW_MESSAGES.openDevDialogFailed);
      throw new Error(message);
    }
  }

  async function openDevModifyDialogV2() {
    const selection = await getSelectionContext();

    try {
      const componentContext = await resolveSelectedComponentContext(selection);
      if (
        String(componentContext.component.whatkind || "").trim() ===
        CRAFTING_CONSTANTS.outsourcedKind
      ) {
        await openQueryPriceDialogControllerWithOptions(displayDialog, {
          initialKeyword: selection.componentName,
        });
        return;
      }
      const initData = await buildDevModifyInitV2(selection, componentContext);
      devModifyState = initData.state;
      await openDevModifyDialogWithData(initData.data, selection, DIALOG_PATHS.devModifyV2, DIALOG_SIZES.devModifyV2);
    } catch (error: any) {
      console.error(FLOW_MESSAGES.openDevDialogFailed, error);
      const message = String(error?.message || FLOW_MESSAGES.openDevDialogFailed);
      throw new Error(message);
    }
  }

  async function openDevModifyDialogWithData(
    initData: Record<string, unknown>,
    selection: SelectionContext,
    dialogPath: string = DIALOG_PATHS.devModify,
    dialogSize: { width: number; height: number } = DIALOG_SIZES.devModify
  ) {
    const dialog = await displayDialog(dialogPath, dialogSize);

    dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (args) => {
      const payload = JSON.parse(getDialogMessage(args) || "{}");

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

    try {
      const initData = await buildCraftModifyInit(targetSelection);
      const dialog = await displayDialog(DIALOG_PATHS.craftModify);
      craftModifyState = initData.state;

      dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (args) => {
        const payload = JSON.parse(getDialogMessage(args) || "{}");

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
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  }

  async function handleDevModifySubmit(data: DevModifySubmitPayload) {
    if (!devModifyState) return;

    if (data?.whatKind === CRAFTING_CONSTANTS.outsourcedKind && !data?.isPriceChanged) {
      console.warn(FLOW_MESSAGES.outsourcedPriceNotSelected);
      return;
    }

    const price =
      data?.whatKind === CRAFTING_CONSTANTS.outsourcedKind
        ? data?.currentPrice
        : data?.refreshedPrice;

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

    const price = (craftModifyState.materialPrice || 0) + craftPrice;

    await writeToSheet(craftModifyState.selection, {
      desc: desc || craftModifyState.selection.componentDesc,
      type: craftModifyState.selection.componentType,
      material: craftModifyState.selection.componentMaterial,
      brand: craftModifyState.selection.componentBrand,
      unit: craftModifyState.selection.componentUnit,
      price,
    });
  }

  async function resolveSelectedComponentContext(
    selection: SelectionContext
  ): Promise<SelectedComponentContext> {
    const projectId = await resolveProjectId(selection.categoryName, selection.projectModel);
    const configData = await fetchJson<ComponentRecord[]>(`${API_PATHS.config}/${projectId}`);
    const component = findComponent(configData, selection.componentName);
    if (!component) {
      throw new Error(`${FLOW_MESSAGES.componentNotFoundPrefix}: ${selection.componentName}`);
    }
    return { projectId, configData, component };
  }

  async function buildDevModifyInit(
    selection: SelectionContext,
    componentContext?: SelectedComponentContext
  ) {
    const resolvedContext = componentContext || (await resolveSelectedComponentContext(selection));
    const { projectId, configData, component } = resolvedContext;

    const componentId = Number(component.config_id || component.component_id);
    const materialOptions = await fetchJson<MaterialOptionRecord[]>(
      `${API_PATHS.materials}/${componentId}`
    );
    const craftingConfigList = await fetchJson<Record<string, unknown>[]>(
      `${API_PATHS.crafting}/${componentId}`
    );
    const craftingConfig = craftingConfigList?.[0] || null;
    const craftPrices = await fetchJson<CraftPriceRecord[]>(API_PATHS.craftPrices);

    const materialPrice = getCraftFieldNumber(craftingConfig, "MaterialsPrice");
    const currentPrice = selection.currentPrice ?? 0;
    const craftPrice = currentPrice - (materialPrice || 0);

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

    const previewLayers = (configData || [])
      .filter((item) => String(item.component_pic || "").trim())
      .map((item, index) => {
        const componentName = String(item.component_name || "").trim();
        return {
          id: String(item.config_id || item.component_id || componentName || index),
          name: componentName,
          imageUrl: buildImageUrl(item.component_pic),
          order: Number(item.pic_level || index || 0),
          highlighted: componentName === selection.componentName,
        };
      })
      .filter((item) => String(item.imageUrl || "").trim())
      .sort((a, b) => a.order - b.order);

    const data: Record<string, unknown> = {
      deviceName: selection.componentName,
      currentPrice: currentPrice,
      materials: materialList,
      selectedMaterial: selection.componentMaterial,
      materialPrice: materialPrice || 0,
      craftPrice: Number.isFinite(craftPrice) ? craftPrice : 0,
      desc: selection.componentDesc,
      type: selection.componentType,
      unit: selection.componentUnit,
      brand: selection.componentBrand,
      whatKind: component.whatkind || "",
      isPriceChanged: false,
      priceKeyword: selection.componentName,
      imageUrl: buildImageUrl(component.component_pic),
      previewLayers,
      craftUnitOptions: (craftPrices || []).map((item) => ({
        label: item.label,
        price: Number(item.price || 0),
        craftType: item.craftType || "",
      })),
      craftAreas: buildCraftItems(craftingConfig, "Inner").concat(
        buildCraftItems(craftingConfig, "Outter")
      ),
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
      } as DevModifyState,
    };
  }

  async function buildCraftModifyInit(selection: SelectionContext) {
    const { configData, component } = await resolveSelectedComponentContext(selection);

    const componentId = Number(component.config_id || component.component_id);
    const craftingConfigList = await fetchJson<Record<string, unknown>[]>(
      `${API_PATHS.crafting}/${componentId}`
    );
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
        materialPrice: getCraftFieldNumber(craftingConfig, "MaterialsPrice"),
      } as CraftModifyState,
    };
  }

  async function buildDevModifyInitV2(
    selection: SelectionContext,
    componentContext?: SelectedComponentContext
  ) {
    const resolvedContext = componentContext || (await resolveSelectedComponentContext(selection));
    const { projectId, configData, component } = resolvedContext;

    const componentId = Number(component.config_id || component.component_id);
    const materialOptions = await fetchJson<MaterialOptionRecord[]>(
      `${API_PATHS.materials}/${componentId}`
    );
    const componentCrafts = await fetchJson<ComponentCraftRecord[]>(
      `${API_PATHS.componentCrafts}/${componentId}`
    );

    const materialList = (materialOptions || []).map((item) => ({
      name: item.material_type,
      price: Number(item.totalprice || 0),
    }));

    const previewLayers = (configData || [])
      .filter((item) => String(item.component_pic || "").trim())
      .map((item, index) => {
        const componentName = String(item.component_name || "").trim();
        return {
          id: String(item.config_id || item.component_id || componentName || index),
          name: componentName,
          imageUrl: buildImageUrl(item.component_pic),
          order: Number(item.pic_level || index || 0),
          highlighted: componentName === selection.componentName,
        };
      })
      .filter((item) => String(item.imageUrl || "").trim())
      .sort((a, b) => a.order - b.order);

    const craftItems = (componentCrafts || []).map((item, index) => ({
      id: Number(item.craft_id || index + 1),
      name: String(item.craft_name || ""),
      unit: String(item.craft_unit || "㎡"),
      price: Number(item.craft_price || 0),
      quantity: "",
    }));

    const data: Record<string, unknown> = {
      deviceName: selection.componentName,
      currentPrice: selection.currentPrice ?? 0,
      materials: materialList,
      selectedMaterial: selection.componentMaterial,
      materialPrice:
        materialList.find((item) => item.name === selection.componentMaterial)?.price ?? 0,
      desc: selection.componentDesc,
      type: selection.componentType,
      unit: selection.componentUnit,
      brand: selection.componentBrand,
      whatKind: component.whatkind || "",
      imageUrl: buildImageUrl(component.component_pic),
      previewLayers,
      craftItems,
      baseDesc: selection.componentDesc,
    };

    return {
      data,
      state: {
        selection,
        initData: data,
        projectId,
        componentId,
        materialPrice:
          materialList.find((item) => item.name === selection.componentMaterial)?.price ?? 0,
      } as DevModifyState,
    };
  }

  return {
    openDevModifyDialog,
    openDevModifyDialogV2,
    openCraftModifyDialog,
  };
}
