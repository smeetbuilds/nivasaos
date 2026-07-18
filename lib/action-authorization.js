import "server-only";
import { get } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  assertGlobalPermission,
  assertPermission,
  assertPortfolioRequirements
} from "@/lib/permission-core";

const ENTITY_RESOLVERS = Object.freeze({
  unit: ["units", "unitId"],
  tenant: ["tenants", "tenantId"],
  lease: ["leases", "leaseId"],
  paymentSubmission: ["payment_submissions", "submissionId"],
  inspection: ["property_inspections", "inspectionId"],
  document: ["lease_documents", "documentId"],
  service: ["service_catalog", "serviceId"],
  subscription: ["lease_services", "subscriptionId"],
  visitor: ["visitor_entries", "visitorId"],
  space: ["rentable_spaces", "spaceId"],
  allocation: ["space_allocations", "allocationId"]
});

function integerField(formData, field) {
  const value = Number(formData.get(field));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} is required`);
  return value;
}

function normalizePermissions(permissions) {
  return Array.isArray(permissions) ? permissions : [permissions];
}

async function authorizePropertyId(propertyId, permissions) {
  const actor = await requireUser();
  for (const permission of normalizePermissions(permissions)) assertPermission(actor, permission, propertyId);
  return actor;
}

export async function authorizePropertyAction(formData, permissions, field = "propertyId") {
  return authorizePropertyId(integerField(formData, field), permissions);
}

export async function authorizeEntityAction(formData, permissions, entity) {
  const resolver = ENTITY_RESOLVERS[entity];
  if (!resolver) throw new Error("Unknown authorization entity");
  const [table, field] = resolver;
  const id = integerField(formData, field);
  const row = get(`SELECT property_id FROM ${table} WHERE id=$id`, { id });
  if (!row?.property_id) throw new Error("Record not found");
  return authorizePropertyId(Number(row.property_id), permissions);
}

export async function authorizeGlobalAction(permission) {
  const actor = await requireUser();
  assertGlobalPermission(actor, permission);
  return actor;
}

export async function authorizePortfolioAction(requirements) {
  const actor = await requireUser();
  assertPortfolioRequirements(actor, requirements);
  return actor;
}
