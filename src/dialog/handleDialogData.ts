/* global fetch, Excel */
import { insertComponentsToConfigSheet } from "../buildsheet/insertRows";
import { API_PATHS, APP_URLS } from "../shared/appConstants";
import { FLOW_MESSAGES } from "../shared/businessTextConstants";

export async function handleDialogData(data: any) {
  if (!data.categoryId || !data.projectId) {
    throw new Error(FLOW_MESSAGES.missingCategoryOrProject);
  }

  if (!data.details || data.details.length === 0) {
    throw new Error(FLOW_MESSAGES.noDetailSelected);
  }

  const configData = await fetchProjectConfig(data.projectId, data.materialPreset);
  const detailComponents = filterDetailComponents(configData, data.details);
  const annotationComponents =
    data.annotations && data.annotations.length > 0
      ? filterAnnotationComponents(configData, data.annotations)
      : [];

  const allComponents = [...detailComponents, ...annotationComponents];
  const systemName = await getSystemNameForType(data.category);
  const categoryForInsert = data.category;

  await insertComponentsToConfigSheet(categoryForInsert, data.project, allComponents, systemName);
}

async function fetchProjectConfig(projectId: number, materialPreset?: string): Promise<any[]> {
  try {
    const url = new URL(`${APP_URLS.apiBase}${API_PATHS.config}/${projectId}`, window.location.origin);
    if (materialPreset) {
      url.searchParams.set("industryType", String(materialPreset));
    }

    const response = await fetch(`${url.pathname}${url.search}`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(`${FLOW_MESSAGES.fetchConfigFailedPrefix}: ${result.error || result.message}`);
    }

    return result.data;
  } catch (error: any) {
    console.error(`${FLOW_MESSAGES.fetchDetailFailed}:`, error);
    throw new Error(`${FLOW_MESSAGES.dbConnectionFailedPrefix}: ${error.message}`);
  }
}

async function getSystemNameForType(typeName: string): Promise<string | null> {
  try {
    const response = await fetch(`${APP_URLS.apiBase}${API_PATHS.systemMapping}/${encodeURIComponent(typeName)}`);
    const result = await response.json();

    if (result.success && result.data) {
      return result.data.systemName;
    }

    return null;
  } catch (error: any) {
    console.error(`${FLOW_MESSAGES.querySystemMappingFailed}:`, error);
    return null;
  }
}

function getAssemblyGroupValue(item: any): number {
  const explicitGroup = Number(item?.assembly_group || item?.assemblyGroup || 0);
  if (explicitGroup > 0) return explicitGroup;
  const assemblyValue = Number(item?.is_Assembly || 0);
  if (assemblyValue >= 100) return Math.floor(assemblyValue / 10);
  if (assemblyValue >= 1) return assemblyValue;
  return 0;
}

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
  const selectedAssemblyGroups = selectedAnnotations
    .map((anno) => Number(anno?.assemblyGroup || 0))
    .filter((value) => value > 0);
  const selectedAssemblyGroupSet = new Set(selectedAssemblyGroups);

  const selectedNames = selectedAnnotations
    .map((anno) => (anno?.name || "").trim().toLowerCase())
    .filter((name) => name.length > 0);
  const selectedNameSet = new Set(selectedNames);

  const components = configData.filter((comp: any) => {
    const assemblyValue = Number(comp?.is_Assembly || 0);
    const assemblyGroup = getAssemblyGroupValue(comp);
    if (assemblyValue < 1) return false;
    if (selectedAssemblyGroupSet.size > 0 && assemblyGroup > 0) {
      return selectedAssemblyGroupSet.has(assemblyGroup);
    }
    const compName = (comp?.component_name || comp?.name || "").trim().toLowerCase();
    return compName.length > 0 && selectedNameSet.has(compName);
  });

  components.sort((a: any, b: any) => (a.component_sn || 0) - (b.component_sn || 0));
  return components;
}
