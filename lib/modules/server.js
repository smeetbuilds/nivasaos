import "server-only";
import { all, get } from "@/lib/db";
import { DEFAULT_MODULE_ID, MODULE_CATALOG, MODULE_IDS, moduleById, supportsCapability } from "@/lib/modules/catalog";

export function workspaceModuleRows() {
  const rows = all("SELECT module_id,enabled,sort_order,settings_json FROM workspace_modules ORDER BY sort_order,module_id");
  if (rows.length) return rows;
  return [{ module_id: DEFAULT_MODULE_ID, enabled: 1, sort_order: 10, settings_json: null }];
}

export function enabledModules() {
  const enabled = new Set(workspaceModuleRows().filter((row) => Number(row.enabled) === 1).map((row) => row.module_id));
  const modules = MODULE_CATALOG.filter((module) => enabled.has(module.id));
  return modules.length ? modules : [moduleById(DEFAULT_MODULE_ID)];
}

export function enabledModuleIds() {
  return enabledModules().map((module) => module.id);
}

export function enabledCapabilities() {
  return [...new Set(enabledModules().flatMap((module) => module.capabilities))];
}

export function isModuleEnabled(moduleId) {
  const id = String(moduleId || "");
  return MODULE_IDS.includes(id) && enabledModuleIds().includes(id);
}

export function moduleForProperty(propertyId) {
  const row = get("SELECT module_id FROM properties WHERE id=$propertyId", { propertyId: Number(propertyId) });
  return moduleById(row?.module_id);
}

export function propertySupports(propertyId, capability) {
  return supportsCapability(moduleForProperty(propertyId).id, capability);
}

export function moduleSummary() {
  const enabled = new Set(enabledModuleIds());
  const counts = new Map(all("SELECT module_id,COUNT(*) property_count FROM properties GROUP BY module_id").map((row) => [row.module_id, Number(row.property_count || 0)]));
  return MODULE_CATALOG.map((module, index) => ({
    ...module,
    enabled: enabled.has(module.id),
    propertyCount: counts.get(module.id) || 0,
    sortOrder: index * 10 + 10
  }));
}
