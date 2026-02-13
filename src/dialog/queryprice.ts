/* global Office, console, document, window, alert */

const API_BASE = "https://localhost:3001/api";

type PriceResult = {
  ItemName: string;
  ItemDesc: string;
  ItemType: string;
  ItemPrice: number;
  ItemUnit: string;
  OrderDate: string;
};

Office.onReady(() => {
  document.getElementById("searchBtn")?.addEventListener("click", handleSearch);
  document.getElementById("cancelBtn")?.addEventListener("click", handleCancel);

  document.getElementById("mainKeyword")?.addEventListener("keypress", (e) => {
    if ((e as KeyboardEvent).key === "Enter") {
      void handleSearch();
    }
  });
  document.getElementById("secondKeyword")?.addEventListener("keypress", (e) => {
    if ((e as KeyboardEvent).key === "Enter") {
      void handleSearch();
    }
  });

  Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, (arg: any) => {
    try {
      const payload = JSON.parse(arg?.message || "{}");
      if (payload?.action === "queryprice_warning") {
        alert(payload.message || "当前位置不允许插入数据");
      }
    } catch (error) {
      console.error("处理父窗口消息失败:", error);
    }
  });

  (document.getElementById("mainKeyword") as HTMLInputElement | null)?.focus();
});

async function handleSearch() {
  const mainKeyword = (document.getElementById("mainKeyword") as HTMLInputElement | null)?.value?.trim() || "";
  const secondKeyword = (document.getElementById("secondKeyword") as HTMLInputElement | null)?.value?.trim() || "";

  if (!mainKeyword) {
    showPlaceholder("请输入物料名称进行查询");
    return;
  }

  try {
    const result = await searchPrices(mainKeyword, secondKeyword);
    displayResults(result);
  } catch (error) {
    console.error("查询失败:", error);
    showPlaceholder("查询失败: " + (error as Error).message);
  }
}

async function searchPrices(mainKeyword: string, secondKeyword: string): Promise<PriceResult[]> {
  const url = new URL(`${API_BASE}/price-search`, window.location.origin);
  url.searchParams.set("keyword", mainKeyword);

  const response = await fetch(url.toString());
  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || result.message || "查询失败");
  }

  let data: PriceResult[] = result.data || [];

  if (secondKeyword && data.length > 0) {
    const secondLower = secondKeyword.toLowerCase();
    data = data.filter((item) => (item.ItemDesc || "").toLowerCase().includes(secondLower));
  }

  return data;
}

function displayResults(results: PriceResult[]) {
  const resultList = document.getElementById("resultList");
  if (!resultList) return;

  if (results.length === 0) {
    showPlaceholder("未找到匹配的数据");
    return;
  }

  resultList.innerHTML = "";

  results.forEach((item) => {
    const row = document.createElement("div");
    row.className = "result-row";

    row.innerHTML = `
      <div class="result-cell name" title="${escapeHtml(item.ItemName || "")}">${escapeHtml(item.ItemName || "-")}</div>
      <div class="result-cell desc" title="${escapeHtml(item.ItemDesc || "")}">${escapeHtml(item.ItemDesc || "-")}</div>
      <div class="result-cell type" title="${escapeHtml(item.ItemType || "")}">${escapeHtml(item.ItemType || "-")}</div>
      <div class="result-cell price" title="${formatPrice(item.ItemPrice)}">${formatPrice(item.ItemPrice)}</div>
    `;

    row.addEventListener("dblclick", () => handleSelect(item));
    resultList.appendChild(row);
  });
}

function handleSelect(item: PriceResult) {
  const brand = extractBrand(item.ItemDesc || "");
  const material = extractMaterial(item.ItemDesc || "");
  const cleanedDesc = cleanDescription(item.ItemDesc || "");

  Office.context.ui.messageParent(
    JSON.stringify({
      action: "queryprice_select",
      data: {
        name: item.ItemName || "",
        desc: cleanedDesc,
        type: item.ItemType || "",
        brand,
        material,
        unit: item.ItemUnit || "",
        price: item.ItemPrice || 0,
      },
    })
  );
}

function cleanDescription(fullDesc: string): string {
  return fullDesc.trim();
}

function extractBrand(text: string): string {
  return extractInfo(text, ["品牌/制造商", "品牌", "制造商"]);
}

function extractMaterial(text: string): string {
  return extractInfo(text, ["材质"]);
}

function extractInfo(text: string, keywords: string[]): string {
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

function formatPrice(price: number | string | null | undefined): string {
  if (price === null || price === undefined || price === "") return "-";
  const num = typeof price === "number" ? price : parseFloat(String(price));
  if (Number.isNaN(num)) return "-";
  return num.toFixed(2);
}

function showPlaceholder(message: string) {
  const resultList = document.getElementById("resultList");
  if (!resultList) return;

  resultList.innerHTML = `
    <div class="placeholder">
      <div style="font-size: 24px; margin-bottom: 8px;">🔎</div>
      <div>${escapeHtml(message)}</div>
    </div>
  `;
}

function handleCancel() {
  Office.context.ui.messageParent(JSON.stringify({ action: "queryprice_cancel" }));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
