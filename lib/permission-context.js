import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

const key = "__nivasaos_permission_scope__";
const storage = globalThis[key] || new AsyncLocalStorage();
if (!globalThis[key]) globalThis[key] = storage;

function normalizedList(value) {
  return [...new Set((Array.isArray(value) ? value : value ? [value] : []).map(String).filter(Boolean))];
}

export function normalizePermissionRequirements(requirements) {
  if (typeof requirements === "string" || Array.isArray(requirements)) {
    return { allOf: normalizedList(requirements), anyOf: [] };
  }
  return {
    allOf: normalizedList(requirements?.allOf),
    anyOf: normalizedList(requirements?.anyOf)
  };
}

export function runWithPermissionScope(requirements, callback) {
  return storage.run(normalizePermissionRequirements(requirements), callback);
}

export function currentPermissionScope() {
  return storage.getStore() || null;
}
