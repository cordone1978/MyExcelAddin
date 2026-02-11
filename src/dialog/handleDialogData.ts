/* global fetch, Excel */
import { insertComponentsToConfigSheet } from "../buildsheet/insertRows";

export async function handleDialogData(data: any) {
  // console.log("========================================");
  // console.log("📥 handleDialogData 被调用");
  // console.log("  data:", JSON.stringify(data, null, 2));
  // console.log("========================================");

  if (!data.categoryId || !data.projectId) {
    throw new Error("缺少必要的产品类型或产品型号信息");
  }

  if (!data.details || data.details.length === 0) {
    throw new Error("没有选择任何组件");
  }

  const components = await fetchComponentDetails(data.projectId, data.details);

  // 从数据库查询产品类型对应的系统（用于查找插入位置）
  const systemName = await getSystemNameForType(data.category);

  // 配置表的分类列使用产品类型
  const categoryForInsert = data.category;

  console.log("🎯 准备插入数据");
  console.log("  data.category (产品类型):", JSON.stringify(data.category));
  console.log("  data.project (产品型号):", JSON.stringify(data.project));
  console.log("  systemName (从数据库查询，用于定位插入位置):", JSON.stringify(systemName));
  console.log("  最终使用的 categoryForInsert (配置表显示的分类):", JSON.stringify(categoryForInsert));

  await insertComponentsToConfigSheet(categoryForInsert, data.project, components, systemName);
}

async function fetchComponentDetails(projectId: number, selectedDetails: any[]): Promise<any[]> {
  const API_BASE = "https://localhost:3001/api";

  try {
    const response = await fetch(`${API_BASE}/config/${projectId}`);
    const result = await response.json();

    if (!result.success) {
      throw new Error("获取组件数据失败: " + (result.error || result.message));
    }

    const selectedIds = selectedDetails.map((detail) => detail.id);
    const selectedNames = selectedDetails
      .map((detail) => (detail?.name || "").trim())
      .filter((name) => name.length > 0);
    const selectedNameSet = new Set(selectedNames.map((name) => name.toLowerCase()));

    const components = result.data.filter((comp: any) => {
      const compId = comp?.id ?? comp?.config_id ?? comp?.component_id;
      if (selectedIds.includes(compId)) return true;
      const compName = (comp?.component_name || comp?.name || "").trim().toLowerCase();
      return compName.length > 0 && selectedNameSet.has(compName);
    });

    components.sort((a: any, b: any) => (a.component_sn || 0) - (b.component_sn || 0));

    console.log(`✅ 获取到 ${components.length} 个组件`);

    return components;
  } catch (error: any) {
    console.error("获取组件详细信息失败:", error);
    throw new Error("无法连接到数据库服务器: " + error.message);
  }
}

/**
 * 从数据库查询产品类型对应的系统名称
 * @param typeName - 产品类型（如"暂存仓"）
 * @returns 系统名称（如"原料给料系统"）或 null
 */
async function getSystemNameForType(typeName: string): Promise<string | null> {
  const API_BASE = "https://localhost:3001/api";

  try {
    console.log("🔍 查询产品类型对应的系统:", typeName);

    const response = await fetch(`${API_BASE}/system-mapping/${encodeURIComponent(typeName)}`);
    const result = await response.json();

    if (result.success && result.data) {
      console.log("✅ 找到系统映射:", result.data.systemName);
      return result.data.systemName;
    } else {
      console.log("⚠️ 未找到系统映射");
      return null;
    }
  } catch (error: any) {
    console.error("❌ 查询系统映射失败:", error);
    return null;
  }
}