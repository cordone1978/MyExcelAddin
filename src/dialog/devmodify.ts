/* global Office */

type DevModifyInit = {
  deviceName?: string;
  currentPrice?: number;
  materials?: Array<{ name: string; price?: number }>;
  selectedMaterial?: string;
  materialPrice?: number | null;
  craftPrice?: number | null;
  standardPrice?: number | null;
  desc?: string;
  type?: string;
  unit?: string;
  brand?: string;
  whatKind?: string;
  isPriceChanged?: boolean;
  priceKeyword?: string;
  craftUnitOptions?: Array<{ label: string; price: number; craftType: string }>;
  craftAreas?: Array<{ area: number | null; type: string | null }>;
  baseDesc?: string;
  imageUrl?: string;
};

const deviceNameEl = document.getElementById("deviceName") as HTMLDivElement;
const currentPriceEl = document.getElementById("currentPrice") as HTMLDivElement;
const materialSelect = document.getElementById("materialSelect") as HTMLSelectElement;
const materialPriceEl = document.getElementById("materialPrice") as HTMLDivElement;
const materialLabelEl = document.getElementById("materialLabel") as HTMLDivElement;
const materialPriceLabelEl = document.getElementById("materialPriceLabel") as HTMLDivElement;
const craftLabelEl = document.getElementById("craftLabel") as HTMLDivElement;
const refreshedLabelEl = document.getElementById("refreshedLabel") as HTMLDivElement;
const craftChangeBtn = document.getElementById("craftChange") as HTMLButtonElement;
const refreshedPriceEl = document.getElementById("refreshedPrice") as HTMLDivElement;
const submitBtn = document.getElementById("submitBtn") as HTMLButtonElement;
const cancelBtn = document.getElementById("cancelBtn") as HTMLButtonElement;
const deviceImage = document.getElementById("deviceImage") as HTMLImageElement;
const imagePlaceholder = document.getElementById("imagePlaceholder") as HTMLDivElement;
const priceModal = document.getElementById("priceModal") as HTMLDivElement;
const closePriceModalBtn = document.getElementById("closePriceModal") as HTMLButtonElement;
const searchPriceBtn = document.getElementById("searchPriceBtn") as HTMLButtonElement;
const priceKeywordInput = document.getElementById("priceKeyword") as HTMLInputElement;
const priceResultList = document.getElementById("priceResultList") as HTMLDivElement;
const craftPanel = document.querySelector(".craft-panel") as HTMLDivElement;
const craftGrandTotal = document.getElementById("craftGrandTotal") as HTMLDivElement;

const craftAreaInputs = [
  "innerArea1",
  "innerArea2",
  "innerArea3",
  "outerArea1",
  "outerArea2",
  "outerArea3",
].map((id) => document.getElementById(id) as HTMLInputElement);

const craftUnitSelects = [
  "innerUnit1",
  "innerUnit2",
  "innerUnit3",
  "outerUnit1",
  "outerUnit2",
  "outerUnit3",
].map((id) => document.getElementById(id) as HTMLSelectElement);

const craftTotalLabels = [
  "innerTotal1",
  "innerTotal2",
  "innerTotal3",
  "outerTotal1",
  "outerTotal2",
  "outerTotal3",
].map((id) => document.getElementById(id) as HTMLDivElement);

let basePrice: number | null = null;
let craftPrice: number | null = null;
let standardPrice: number | null = null;
let currentMaterialValue: number | null = null;
let currentDesc = "";
let currentType = "";
let currentUnit = "";
let currentBrand = "";
let currentWhatKind = "";
let isPriceChanged = false;
let priceKeyword = "";
let baseDesc = "";
const materialPriceMap = new Map<string, number>();
const craftUnitPriceMap = new Map<string, number>();
const craftLabelByType = new Map<string, string>();

Office.onReady(() => {
  bindEvents();
  updateDisplay();

  try {
    Office.context.ui.messageParent(JSON.stringify({ action: "devmodify_ready" }));
    Office.context.ui.addHandlerAsync(
      Office.EventType.DialogParentMessageReceived,
      (args) => {
        try {
          const payload = JSON.parse(args.message);
          if (payload?.action === "init" && payload.data) {
            applyInit(payload.data as DevModifyInit);
          }
          if (payload?.action === "craftmodify_result" && payload.data) {
            applyCraftResult(payload.data);
          }
        } catch (error) {
          console.error("处理初始化数据失败:", error);
        }
      }
    );
  } catch (error) {
    console.warn("未能注册父窗口消息处理:", error);
  }
});

function bindEvents() {
  materialSelect.addEventListener("change", () => {
    updateMaterialPrice();
    updateDisplay();
  });

  craftChangeBtn.addEventListener("click", () => {
    if (isOutsourced()) {
      openPriceModal();
      return;
    }
    craftPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  submitBtn.addEventListener("click", () => {
    if (!isOutsourced()) {
      currentDesc = buildCraftingDescription();
    }
    const payload = {
      action: "devmodify_submit",
      deviceName: deviceNameEl.textContent || "",
      currentPrice: basePrice,
      desc: currentDesc,
      type: currentType,
      unit: currentUnit,
      brand: currentBrand,
      whatKind: currentWhatKind,
      standardPrice,
      material: isOutsourced() ? currentMaterial : materialSelect.value,
      materialPrice: getSelectedMaterialPrice(),
      craftPrice,
      refreshedPrice: getRefreshedPrice(),
      isPriceChanged,
    };
    Office.context.ui.messageParent(JSON.stringify(payload));
  });

  cancelBtn.addEventListener("click", () => {
    Office.context.ui.messageParent(JSON.stringify({ action: "devmodify_cancel" }));
  });

  closePriceModalBtn.addEventListener("click", closePriceModal);
  searchPriceBtn.addEventListener("click", searchPriceList);
  priceKeywordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      searchPriceList();
    }
  });

  craftAreaInputs.forEach((input) => {
    input.addEventListener("input", updateCraftTotals);
  });
  craftUnitSelects.forEach((select) => {
    select.addEventListener("change", updateCraftTotals);
  });
}

function applyInit(data: DevModifyInit) {
  deviceNameEl.textContent = data.deviceName || "-";
  basePrice = typeof data.currentPrice === "number" ? data.currentPrice : null;
  craftPrice = typeof data.craftPrice === "number" ? data.craftPrice : null;
  standardPrice = typeof data.standardPrice === "number" ? data.standardPrice : null;
  currentDesc = data.desc || "";
  baseDesc = data.baseDesc || currentDesc;
  currentType = data.type || "";
  currentUnit = data.unit || "";
  currentBrand = data.brand || "";
  currentWhatKind = data.whatKind || "";
  currentMaterial = data.selectedMaterial || "";
  isPriceChanged = Boolean(data.isPriceChanged);
  priceKeyword = data.priceKeyword || data.deviceName || "";
  priceKeywordInput.value = priceKeyword;
  currentMaterialValue = typeof data.materialPrice === "number" ? data.materialPrice : null;

  if (data.materials && data.materials.length > 0) {
    materialPriceMap.clear();
    materialSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "请选择...";
    materialSelect.appendChild(placeholder);

    data.materials.forEach((item) => {
      materialPriceMap.set(item.name, item.price ?? 0);
      const option = document.createElement("option");
      option.value = item.name;
      option.textContent = item.name;
      materialSelect.appendChild(option);
    });

    if (data.selectedMaterial) {
      materialSelect.value = data.selectedMaterial;
    }
  }

  if (data.imageUrl) {
    deviceImage.src = data.imageUrl;
    deviceImage.style.display = "block";
    imagePlaceholder.style.display = "none";
  }

  applyCraftOptions(data);
  applyModeUI();
  if (currentMaterialValue !== null) {
    materialPriceEl.textContent = formatPrice(currentMaterialValue);
  } else {
    updateMaterialPrice();
  }
  updateDisplay();
  updateCraftTotals();
}

function updateMaterialPrice() {
  const selected = materialSelect.value;
  const price = selected ? materialPriceMap.get(selected) ?? null : null;
  currentMaterialValue = price;
  materialPriceEl.textContent = formatPrice(price ?? currentMaterialValue);
  currentMaterial = materialSelect.value;
}

function updateDisplay() {
  currentPriceEl.textContent = formatPrice(basePrice);
  craftChangeBtn.textContent = isOutsourced()
    ? "点击查询"
    : craftPrice === null
    ? "点击更改"
    : formatPrice(craftPrice);
  refreshedPriceEl.textContent = formatPrice(getRefreshedPrice());
}

function getSelectedMaterialPrice(): number | null {
  return currentMaterialValue;
}

function getRefreshedPrice(): number | null {
  const material = getSelectedMaterialPrice();
  if (material === null && craftPrice === null && standardPrice === null) {
    return basePrice;
  }
  return (standardPrice || 0) + (material || 0) + (craftPrice || 0);
}

function formatPrice(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return String(Math.round(value));
}

function isOutsourced(): boolean {
  return currentWhatKind === "外购件";
}

function applyModeUI() {
  if (isOutsourced()) {
    materialLabelEl.style.display = "none";
    materialSelect.style.display = "none";
    materialPriceLabelEl.style.display = "none";
    materialPriceEl.style.display = "none";
    refreshedLabelEl.style.display = "none";
    refreshedPriceEl.style.display = "none";
    craftLabelEl.textContent = "外购价格";
    craftPanel.style.display = "none";
  } else {
    materialLabelEl.style.display = "";
    materialSelect.style.display = "";
    materialPriceLabelEl.style.display = "";
    materialPriceEl.style.display = "";
    refreshedLabelEl.style.display = "";
    refreshedPriceEl.style.display = "";
    craftLabelEl.textContent = "表面处理";
    craftPanel.style.display = "";
  }
}

async function searchPriceList() {
  const keyword = priceKeywordInput.value.trim();
  if (!keyword) return;
  try {
    const response = await fetch(`https://localhost:3001/api/price-search?keyword=${encodeURIComponent(keyword)}`);
    const result = await response.json();
    if (!result.success) {
      renderPriceList([]);
      return;
    }
    renderPriceList(result.data || []);
  } catch (error) {
    console.error("价格查询失败:", error);
    renderPriceList([]);
  }
}

function renderPriceList(rows: any[]) {
  priceResultList.innerHTML = "";
  const header = document.createElement("div");
  header.className = "result-item header";
  header.innerHTML = "<div>物料名称</div><div>规格描述</div><div>型号</div><div>价格</div>";
  priceResultList.appendChild(header);

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "result-item";
    item.innerHTML = `
      <div>${row.ItemName || ""}</div>
      <div>${row.ItemDesc || ""}</div>
      <div>${row.ItemType || ""}</div>
      <div>${row.ItemPrice || ""}</div>
    `;
    item.addEventListener("click", () => {
      currentDesc = row.ItemDesc || "";
      currentType = row.ItemType || "";
      currentUnit = row.ItemUnit || "";
      currentBrand = extractBrand(currentDesc);
      currentMaterial = extractMaterial(currentDesc);
      basePrice = parseNumber(row.ItemPrice);
      craftPrice = null;
      isPriceChanged = true;
      closePriceModal();
      updateDisplay();
    });
    priceResultList.appendChild(item);
  });
}

function openPriceModal() {
  priceModal.classList.remove("hidden");
  priceKeywordInput.focus();
  if (priceKeywordInput.value.trim()) {
    void searchPriceList();
  }
}

function closePriceModal() {
  priceModal.classList.add("hidden");
}

function extractBrand(text: string): string {
  return extractInfo(text, ["品牌/制造商", "品牌", "制造商"]);
}

function extractMaterial(text: string): string {
  return extractInfo(text, ["材质"]);
}

function extractInfo(text: string, keywords: string[]): string {
  if (!text) return "";
  const lowerText = text.toLowerCase();
  for (const keyword of keywords) {
    const index = lowerText.indexOf(keyword.toLowerCase());
    if (index >= 0) {
      let result = text.slice(index + keyword.length);
      result = result.replace(/^[:：\s]+/, "");
      result = result.split(/[，,。.\s]/)[0] || "";
      result = result.trim();
      if (result) return result;
    }
  }
  return "";
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function applyCraftResult(data: any) {
  craftPrice = typeof data.craftPrice === "number" ? data.craftPrice : craftPrice;
  if (typeof data.desc === "string") {
    currentDesc = data.desc;
  }
  updateDisplay();
}

function applyCraftOptions(data: DevModifyInit) {
  craftUnitPriceMap.clear();
  craftLabelByType.clear();
  craftUnitSelects.forEach((select) => {
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "请选择...";
    select.appendChild(placeholder);
  });

  (data.craftUnitOptions || []).forEach((item) => {
    craftUnitPriceMap.set(item.label, item.price);
    craftLabelByType.set(item.craftType, item.label);
    craftUnitSelects.forEach((select) => {
      const option = document.createElement("option");
      option.value = item.label;
      option.textContent = item.label;
      select.appendChild(option);
    });
  });

  const areas = data.craftAreas || [];
  areas.forEach((item, index) => {
    if (craftAreaInputs[index]) {
      craftAreaInputs[index].value = item.area === null || item.area === undefined ? "" : String(item.area);
    }
    if (item.type && craftUnitSelects[index]) {
      craftUnitSelects[index].value = craftLabelByType.get(item.type) || item.type || "";
    }
  });
}

function updateCraftTotals() {
  let total = 0;
  craftTotalLabels.forEach((label, index) => {
    const area = parseNumber(craftAreaInputs[index]?.value) || 0;
    const unitLabel = craftUnitSelects[index]?.value || "";
    const unitPrice = craftUnitPriceMap.get(unitLabel) || 0;
    const rowTotal = area * unitPrice;
    label.textContent = rowTotal.toFixed(2);
    total += rowTotal;
  });
  craftGrandTotal.textContent = total.toFixed(2);
  craftPrice = total;
  updateDisplay();
}

function buildCraftingDescription(): string {
  const innerTypes = collectCraftTypes(0, 3);
  const outerTypes = collectCraftTypes(3, 6);
  let result = removeSegment(baseDesc, "，内表面处理：");
  result = removeSegment(result, "，外表面处理：");
  result = result.replace(/[；，]\s*$/, "").trim();

  if (innerTypes.length > 0) {
    result = appendSegment(result, `内表面处理：${innerTypes.join("，")}`);
  }
  if (outerTypes.length > 0) {
    result = appendSegment(result, `外表面处理：${outerTypes.join("，")}`);
  }
  return result;
}

function collectCraftTypes(start: number, end: number): string[] {
  const types: string[] = [];
  for (let i = start; i < end; i++) {
    const total = parseNumber(craftTotalLabels[i]?.textContent || "") || 0;
    const label = craftUnitSelects[i]?.value || "";
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
  return `${text}，${segment}`;
}

let currentMaterial = "";
