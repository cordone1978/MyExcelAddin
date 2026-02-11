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

  const configData = await fetchProjectConfig(data.projectId);

  // 获取详细信息（details）
  const detailComponents = filterDetailComponents(configData, data.details);

  // 获取标注选项（annotations）
  const annotationComponents =
    data.annotations && data.annotations.length > 0
      ? filterAnnotationComponents(configData, data.annotations)
      : [];

  // 合并所有组件数据（不去重）
  const allComponents = [...detailComponents, ...annotationComponents];

  // 从数据库查询产品类型对应的系统（用于查找插入位置）
  const systemName = await getSystemNameForType(data.category);

  // 配置表的分类列使用产品类型
  const categoryForInsert = data.category;

  console.log("🎯 准备插入数据");
  console.log("  data.category (产品类型):", JSON.stringify(data.category));
  console.log("  data.project (产品型号):", JSON.stringify(data.project));
  console.log("  details 数量:", detailComponents.length);
  console.log("  annotations 数量:", annotationComponents.length);
  console.log("  总组件数量:", allComponents.length);
  console.log("  systemName (从数据库查询，用于定位插入位置):", JSON.stringify(systemName));
  console.log("  最终使用的 categoryForInsert (配置表显示的分类):", JSON.stringify(categoryForInsert));

  await insertComponentsToConfigSheet(categoryForInsert, data.project, allComponents, systemName);
}

async function fetchProjectConfig(projectId: number): Promise<any[]> {
  const API_BASE = "https://localhost:3001/api";

  try {
    const response = await fetch(`${API_BASE}/config/${projectId}`);
    const result = await response.json();

    if (!result.success) {
      throw new Error("获取组件数据失败: " + (result.error || result.message));
    }

    return result.data;
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

/**
 * 获取标注选项的详细信息
 * 注意：按名称匹配，会查询所有同名的标注记录（与 VBA 逻辑一致）
 */
function filterDetailComponents(configData: any[], selectedDetails: any[]): any[] {
  const selectedIds = selectedDetails.map((detail) => detail.id);
  const selectedNames = selectedDetails
    .map((detail) => (detail?.name || "").trim())
    .filter((name) => name.length > 0);
  const selectedNameSet = new Set(selectedNames.map((name) => name.toLowerCase()));

  const components = configData.filter((comp: any) => {
    const compId = comp?.id ?? comp?.config_id ?? comp?.component_id;
    if (selectedIds.includes(compId)) return true;
    const compName = (comp?.component_name || comp?.name || "").trim().toLowerCase();
    return compName.length > 0 && selectedNameSet.has(compName);
  });

  components.sort((a: any, b: any) => (a.component_sn || 0) - (b.component_sn || 0));
  return components;
}

function filterAnnotationComponents(configData: any[], selectedAnnotations: any[]): any[] {
  const selectedNames = selectedAnnotations
    .map((anno) => (anno?.name || "").trim().toLowerCase())
    .filter((name) => name.length > 0);
  const selectedNameSet = new Set(selectedNames);

  const components = configData.filter((comp: any) => {
    if (Number(comp?.is_Assembly || 0) < 1) return false;
    const compName = (comp?.component_name || comp?.name || "").trim().toLowerCase();
    return compName.length > 0 && selectedNameSet.has(compName);
  });

  components.sort((a: any, b: any) => (a.component_sn || 0) - (b.component_sn || 0));
  return components;
}
