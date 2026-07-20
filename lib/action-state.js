const SENSITIVE_FIELD = /(?:password|passcode|secret|token|credential|private|api[_-]?key)/i;
const NAVIGATION_DIGEST = /^(?:NEXT_REDIRECT|NEXT_NOT_FOUND)/;

export class ActionValidationError extends Error {
  constructor(message, fieldErrors = {}) {
    super(message);
    this.name = "ActionValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export function fieldError(field, message) {
  throw new ActionValidationError(message, { [field]: message });
}

function isFormData(value) {
  return value && typeof value.get === "function" && typeof value.entries === "function";
}

function rethrowNavigation(error) {
  const digest = String(error?.digest || "");
  if (NAVIGATION_DIGEST.test(digest)) throw error;
}

function safeMessage(error) {
  const source = error instanceof Error ? error.message : String(error || "Unable to complete this action");
  if (/UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(source)) return "A record with these details already exists.";
  if (/FOREIGN KEY constraint failed|SQLITE_CONSTRAINT_FOREIGNKEY/i.test(source)) return "A related record changed. Refresh the page and try again.";
  if (/CHECK constraint failed|SQLITE_CONSTRAINT_CHECK/i.test(source)) return "One or more values do not meet the required rules.";
  if (/NOT NULL constraint failed|SQLITE_CONSTRAINT_NOTNULL/i.test(source)) return "Complete all required fields and try again.";
  if (/SQLITE_|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(source)) return "The record could not be saved. Review the entered values and try again.";
  return source.slice(0, 320);
}

function serializedValues(formData) {
  const values = {};
  for (const [key, raw] of formData.entries()) {
    if (SENSITIVE_FIELD.test(key) || (typeof File !== "undefined" && raw instanceof File)) continue;
    const value = String(raw);
    if (Object.hasOwn(values, key)) values[key] = Array.isArray(values[key]) ? [...values[key], value] : [values[key], value];
    else values[key] = value;
  }
  return values;
}

function normalizedKey(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

const FIELD_ALIASES = Object.freeze({
  property: ["propertyId", "property"],
  unit: ["unitId", "unitType", "unit"],
  space: ["spaceId", "spaceIds"],
  tenant: ["tenantId", "tenantIds", "fullName"],
  person: ["tenantId", "tenantIds", "fullName"],
  resident: ["tenantId", "tenantIds", "fullName"],
  agreement: ["leaseId", "leaseIds"],
  lease: ["leaseId", "leaseIds"],
  invoice: ["invoiceId"],
  email: ["email"],
  phone: ["phone"],
  name: ["name", "fullName"],
  title: ["title"],
  description: ["description"],
  amount: ["amount", "monthlyRent", "monthlyRate", "deposit"],
  rent: ["monthlyRent", "monthlyRate", "amount"],
  deposit: ["deposit", "amount"],
  date: ["dueDate", "issueDate", "paidAt", "startDate", "endDate"],
  due: ["dueDate"],
  status: ["status"],
  priority: ["priority"],
  period: ["period"],
  currency: ["currency"],
  module: ["moduleId"]
});

function inferredFieldErrors(error, formData, message) {
  if (error?.fieldErrors && typeof error.fieldErrors === "object") return error.fieldErrors;
  const keys = [...new Set([...formData.keys()])];
  const normalized = new Map(keys.map((key) => [normalizedKey(key), key]));
  const lower = message.toLowerCase();

  for (const key of keys) {
    const readable = key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase();
    if (lower.includes(key.toLowerCase()) || lower.includes(readable)) return { [key]: message };
  }
  for (const [alias, candidates] of Object.entries(FIELD_ALIASES)) {
    if (!lower.includes(alias)) continue;
    for (const candidate of candidates) {
      const found = normalized.get(normalizedKey(candidate));
      if (found) return { [found]: message };
    }
  }
  return {};
}

export const INITIAL_ACTION_STATE = Object.freeze({ status: "idle", message: "", fieldErrors: {}, values: {}, attempt: 0 });

export async function runStructuredAction(handler, previousStateOrFormData, maybeFormData) {
  const stateful = isFormData(maybeFormData);
  const formData = stateful ? maybeFormData : previousStateOrFormData;
  if (!isFormData(formData)) throw new TypeError("Server action requires FormData");
  if (!stateful) return handler(formData);

  try {
    return await handler(formData);
  } catch (error) {
    rethrowNavigation(error);
    const message = safeMessage(error);
    return {
      status: "error",
      message,
      fieldErrors: inferredFieldErrors(error, formData, message),
      values: serializedValues(formData),
      attempt: Number(previousStateOrFormData?.attempt || 0) + 1
    };
  }
}
