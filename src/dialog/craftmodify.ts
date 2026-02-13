import { DIALOG_ACTIONS } from "../shared/dialogActions";
/* global Office */

type CraftItem = {
  area: number | null;
  unitPrice: number | null;
  type?: string;
};

type CraftModifyInit = {
  inner?: CraftItem[];
  outer?: CraftItem[];
  unitOptions?: Array<{ label: string; price: number; craftType: string }>;
  baseDesc?: string;
};

const areaInputs = [
  "innerArea1",
  "innerArea2",
  "innerArea3",
  "outerArea1",
  "outerArea2",
  "outerArea3",
].map((id) => document.getElementById(id) as HTMLInputElement);

const unitSelects = [
  "innerUnit1",
  "innerUnit2",
  "innerUnit3",
  "outerUnit1",
  "outerUnit2",
  "outerUnit3",
].map((id) => document.getElementById(id) as HTMLSelectElement);

const totalLabels = [
  "innerTotal1",
  "innerTotal2",
  "innerTotal3",
  "outerTotal1",
  "outerTotal2",
  "outerTotal3",
].map((id) => document.getElementById(id) as HTMLDivElement);

const grandTotalLabel = document.getElementById("grandTotal") as HTMLDivElement;
const submitBtn = document.getElementById("submitBtn") as HTMLButtonElement;
const cancelBtn = document.getElementById("cancelBtn") as HTMLButtonElement;

const unitPriceMap = new Map<string, number>();
const labelByType = new Map<string, string>();
let baseDesc = "";

Office.onReady(() => {
  bindEvents();
  updateTotals();

  try {
    Office.context.ui.messageParent(JSON.stringify({ action: DIALOG_ACTIONS.CRAFTMODIFY_READY }));
    Office.context.ui.addHandlerAsync(
      Office.EventType.DialogParentMessageReceived,
      (args) => {
        try {
          const payload = JSON.parse(args.message);
          if (payload?.action === DIALOG_ACTIONS.INIT && payload.data) {
            applyInit(payload.data as CraftModifyInit);
          }
        } catch (error) {
          console.error("澶勭悊鍒濆鍖栨暟鎹け璐?", error);
        }
      }
    );
  } catch (error) {
    console.warn("鏈兘娉ㄥ唽鐖剁獥鍙ｆ秷鎭鐞?", error);
  }
});

function bindEvents() {
  areaInputs.forEach((input) => {
    input.addEventListener("input", updateTotals);
  });

  unitSelects.forEach((select) => {
    select.addEventListener("change", updateTotals);
  });

  submitBtn.addEventListener("click", () => {
    Office.context.ui.messageParent(
      JSON.stringify({
        action: DIALOG_ACTIONS.CRAFTMODIFY_SUBMIT,
        data: {
          items: collectData(),
          craftPrice: parseNumber(grandTotalLabel.textContent) || 0,
          desc: buildCraftingDescription(),
        },
      })
    );
  });

  cancelBtn.addEventListener("click", () => {
    Office.context.ui.messageParent(JSON.stringify({ action: DIALOG_ACTIONS.CRAFTMODIFY_CANCEL }));
  });
}

function applyInit(data: CraftModifyInit) {
  baseDesc = data.baseDesc || "";
  if (data.unitOptions && data.unitOptions.length > 0) {
    unitPriceMap.clear();
    labelByType.clear();
    unitSelects.forEach((select) => {
      select.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "璇烽€夋嫨...";
      select.appendChild(placeholder);
      data.unitOptions?.forEach((item) => {
        unitPriceMap.set(item.label, item.price);
        labelByType.set(item.craftType, item.label);
        const option = document.createElement("option");
        option.value = item.label;
        option.textContent = item.label;
        select.appendChild(option);
      });
    });
  }

  const inner = data.inner || [];
  const outer = data.outer || [];
  const items = [...inner, ...outer];
  items.forEach((item, index) => {
    if (areaInputs[index]) {
      areaInputs[index].value = item.area === null || item.area === undefined ? "" : String(item.area);
    }
    if (item.type && unitSelects[index]) {
      unitSelects[index].value = labelByType.get(item.type) || item.type || "";
    }
  });

  updateTotals();
}

function updateTotals() {
  let grandTotal = 0;
  totalLabels.forEach((label, index) => {
    const area = parseNumber(areaInputs[index]?.value);
    const unit = getUnitPrice(unitSelects[index]?.value);
    const total = (area || 0) * (unit || 0);
    label.textContent = formatMoney(total);
    grandTotal += total;
  });
  grandTotalLabel.textContent = formatMoney(grandTotal);
}

function collectData() {
  return totalLabels.map((_, index) => ({
    area: parseNumber(areaInputs[index]?.value),
    unitLabel: unitSelects[index]?.value || "",
    unitPrice: getUnitPrice(unitSelects[index]?.value),
    total: parseNumber(totalLabels[index]?.textContent || ""),
  }));
}

function getUnitPrice(label?: string | null): number | null {
  if (!label) return null;
  return unitPriceMap.get(label) ?? null;
}

function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function buildCraftingDescription(): string {
  const innerTypes = collectCraftTypes(0, 3);
  const outerTypes = collectCraftTypes(3, 6);

  let result = removeSegment(baseDesc, "，内表面处理：");
  result = removeSegment(result, "，外表面处理：");
  result = result.replace(/[锛涳紝]\s*$/, "").trim();

  if (innerTypes.length > 0) {
    result = appendSegment(result, `内表面处理：${innerTypes.join("；")}`);
  }
  if (outerTypes.length > 0) {
    result = appendSegment(result, `外表面处理：${outerTypes.join("；")}`);
  }

  return result;
}

function collectCraftTypes(start: number, end: number): string[] {
  const types: string[] = [];
  for (let i = start; i < end; i++) {
    const total = parseNumber(totalLabels[i]?.textContent || "") || 0;
    const label = unitSelects[i]?.value || "";
    if (total <= 0 || !label) continue;
    const craftType = extractCraftType(label);
    if (craftType && !types.includes(craftType)) {
      types.push(craftType);
    }
  }
  return types;
}

function extractCraftType(label: string): string {
  if (!label) return "";
  const splitIndex = label.indexOf("--");
  if (splitIndex > 0) {
    return label.slice(0, splitIndex).trim();
  }
  const priceIndex = label.indexOf("￥");
  if (priceIndex > 0) {
    return label.slice(0, priceIndex).trim();
  }
  return label.trim();
}

function removeSegment(text: string, key: string): string {
  const index = text.indexOf(key);
  if (index < 0) return text;
  const endIndex = text.indexOf("；", index);
  if (endIndex < 0) {
    return text.slice(0, index).trim();
  }
  return (text.slice(0, index) + text.slice(endIndex + 1)).trim();
}

function appendSegment(text: string, segment: string): string {
  if (!text) return segment;
  return `${text}锛?{segment}`;
}


