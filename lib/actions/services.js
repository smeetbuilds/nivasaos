import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { get, run, scalar, transaction } from "@/lib/db";
import { changedFields, recordAudit } from "@/lib/audit";
import { assertPermission } from "@/lib/permission-core";
import { choice, integer, safeRedirect, text } from "@/lib/actions/shared";
import { validDate } from "@/lib/actions/finance-common";
import { today, uid } from "@/lib/format";
import { supportsCapability } from "@/lib/modules/catalog";
import { moneyInput, normalizedMoney } from "@/lib/money";

const FREQUENCIES = ["included", "one_time", "monthly", "quarterly", "annual"];

function refreshServiceViews() {
  ["/services", "/invoices", "/dashboard", "/audit", "/portal", "/portal/services", "/portal/billing"].forEach(revalidatePath);
}

function limited(formData, key, max, required = false) {
  const value = text(formData, key, required);
  if (value.length > max) throw new Error(`${key} must be ${max} characters or fewer`);
  return value;
}

function serviceAccess(actor, serviceId) {
  const service = get("SELECT sc.*,p.module_id,p.currency,p.name property_name FROM service_catalog sc JOIN properties p ON p.id=sc.property_id WHERE sc.id=$serviceId", { serviceId: Number(serviceId) });
  if (!service) throw new Error("Service not found");
  assertPermission(actor, "services.manage", service.property_id);
  if (!supportsCapability(service.module_id, "servicePlans")) throw new Error("This property module does not support service plans");
  return service;
}

function canonicalServicePeriod(frequency, requested) {
  if (frequency === "one_time") return "one-time";
  if (frequency === "monthly") {
    if (!/^\d{4}-\d{2}$/.test(requested)) throw new Error("Monthly service period must use YYYY-MM");
    const month = Number(requested.slice(5, 7));
    if (month < 1 || month > 12) throw new Error("Monthly service period contains an invalid month");
    return requested;
  }
  if (frequency === "quarterly") {
    if (!/^\d{4}-Q[1-4]$/.test(requested)) throw new Error("Quarterly service period must use YYYY-Q1 to YYYY-Q4");
    return requested;
  }
  if (frequency === "annual") {
    if (!/^\d{4}$/.test(requested)) throw new Error("Annual service period must use YYYY");
    return requested;
  }
  throw new Error("Included services do not create separate invoices");
}

function serviceAmountInput(formData, frequency, fallback = "0") {
  if (frequency === "included") return { minor: 0, value: 0 };
  return moneyInput(formData, "amount", { label: "Service amount", fallback, minMinor: 0 });
}

export async function createServiceAction(formData) {
  const actor = await requireUser();
  const propertyId = integer(formData, "propertyId");
  assertPermission(actor, "services.manage", propertyId);
  const property = get("SELECT * FROM properties WHERE id=$propertyId", { propertyId });
  if (!property) throw new Error("Property not found");
  if (!supportsCapability(property.module_id, "servicePlans")) throw new Error("Selected property does not support service plans");
  const billingFrequency = choice(formData, "billingFrequency", FREQUENCIES, "monthly");
  const amount = serviceAmountInput(formData, billingFrequency);
  const values = {
    propertyId,
    name: limited(formData, "name", 160, true),
    category: limited(formData, "category", 80) || "other",
    billingFrequency,
    amount: amount.value,
    description: limited(formData, "description", 1800),
    createdBy: actor.id
  };
  transaction(() => {
    const inserted = run(
      `INSERT INTO service_catalog (property_id,name,category,billing_frequency,amount,description,active,created_by)
       VALUES ($propertyId,$name,$category,$billingFrequency,$amount,$description,1,$createdBy)`,
      values
    );
    recordAudit({ actor, action: "create", entityType: "service_catalog", entityId: Number(inserted.lastInsertRowid), propertyId, summary: `Created service ${values.name}`, metadata: { frequency: values.billingFrequency, amount: values.amount, amountMinor: amount.minor } });
  });
  refreshServiceViews();
  safeRedirect("/services", "Service created");
}

export async function updateServiceAction(formData) {
  const actor = await requireUser();
  const serviceId = integer(formData, "serviceId");
  const before = serviceAccess(actor, serviceId);
  const billingFrequency = choice(formData, "billingFrequency", FREQUENCIES, before.billing_frequency);
  const amount = serviceAmountInput(formData, billingFrequency, before.amount);
  const after = {
    name: limited(formData, "name", 160, true),
    category: limited(formData, "category", 80) || "other",
    billing_frequency: billingFrequency,
    amount: amount.value,
    description: limited(formData, "description", 1800),
    active: formData.get("active") === "on" ? 1 : 0
  };
  if (before.billing_frequency !== after.billing_frequency) {
    const activeSubscriptions = Number(scalar("SELECT COUNT(*) FROM lease_services WHERE service_id=$serviceId AND status='active'", { serviceId }) || 0);
    if (activeSubscriptions) throw new Error("End active subscriptions before changing service billing frequency");
  }
  const fields = changedFields(before, after, ["name", "category", "billing_frequency", "amount", "description", "active"]);
  if (!fields.length) safeRedirect("/services", "No service changes detected");
  transaction(() => {
    run(
      `UPDATE service_catalog SET name=$name,category=$category,billing_frequency=$billing_frequency,amount=$amount,
       description=$description,active=$active,updated_at=CURRENT_TIMESTAMP WHERE id=$serviceId`,
      { ...after, serviceId }
    );
    recordAudit({ actor, action: "update", entityType: "service_catalog", entityId: serviceId, propertyId: before.property_id, summary: `Updated service ${after.name}`, metadata: { fields, amountMinor: amount.minor } });
  });
  refreshServiceViews();
  safeRedirect("/services", "Service updated");
}

export async function subscribeServiceAction(formData) {
  const actor = await requireUser();
  const serviceId = integer(formData, "serviceId");
  const leaseId = integer(formData, "leaseId");
  const tenantId = integer(formData, "tenantId") || null;
  const service = serviceAccess(actor, serviceId);
  if (!service.active) throw new Error("Service is inactive");
  const lease = get("SELECT * FROM leases WHERE id=$leaseId AND property_id=$propertyId AND status='active'", { leaseId, propertyId: service.property_id });
  if (!lease) throw new Error("Select an active lease in the same property");
  if (tenantId && !get("SELECT 1 FROM lease_tenants WHERE lease_id=$leaseId AND tenant_id=$tenantId", { leaseId, tenantId })) throw new Error("Resident is not linked to the selected lease");
  const duplicate = get(
    `SELECT 1 FROM lease_services WHERE lease_id=$leaseId AND service_id=$serviceId AND status='active'
     AND COALESCE(tenant_id,0)=COALESCE($tenantId,0)`,
    { leaseId, serviceId, tenantId }
  );
  if (duplicate) throw new Error("This service is already active for the selected lease or resident");
  const customAmountText = text(formData, "customAmount");
  const customAmountInput = customAmountText === "" ? null : moneyInput(formData, "customAmount", { label: "Custom service amount", minMinor: 0 });
  const customAmount = customAmountInput?.value ?? null;
  transaction(() => {
    const inserted = run(
      `INSERT INTO lease_services (property_id,lease_id,tenant_id,service_id,custom_amount,start_date,status,created_by)
       VALUES ($propertyId,$leaseId,$tenantId,$serviceId,$customAmount,$startDate,'active',$createdBy)`,
      { propertyId: service.property_id, leaseId, tenantId, serviceId, customAmount, startDate: validDate(text(formData, "startDate") || today(), "Service start date"), createdBy: actor.id }
    );
    recordAudit({ actor, action: "create", entityType: "lease_service", entityId: Number(inserted.lastInsertRowid), propertyId: service.property_id, summary: `Assigned service ${service.name}`, metadata: { leaseId, tenantId, customAmount, customAmountMinor: customAmountInput?.minor ?? null } });
  });
  refreshServiceViews();
  safeRedirect("/services", "Service assigned");
}

export async function endServiceSubscriptionAction(formData) {
  const actor = await requireUser();
  const subscriptionId = integer(formData, "subscriptionId");
  const subscription = get("SELECT ls.*,sc.name FROM lease_services ls JOIN service_catalog sc ON sc.id=ls.service_id WHERE ls.id=$subscriptionId", { subscriptionId });
  if (!subscription || subscription.status !== "active") throw new Error("Active service subscription not found");
  assertPermission(actor, "services.manage", subscription.property_id);
  transaction(() => {
    const changed = run("UPDATE lease_services SET status='ended',end_date=$endDate,updated_at=CURRENT_TIMESTAMP WHERE id=$subscriptionId AND status='active'", { subscriptionId, endDate: validDate(text(formData, "endDate") || today(), "Service end date") });
    if (Number(changed.changes) !== 1) throw new Error("Service was already ended");
    recordAudit({ actor, action: "end", entityType: "lease_service", entityId: subscriptionId, propertyId: subscription.property_id, summary: `Ended service ${subscription.name}`, metadata: { leaseId: subscription.lease_id, tenantId: subscription.tenant_id } });
  });
  refreshServiceViews();
  safeRedirect("/services", "Service ended");
}

export async function billServiceSubscriptionAction(formData) {
  const actor = await requireUser();
  const subscriptionId = integer(formData, "subscriptionId");
  const subscription = get(
    `SELECT ls.*,sc.name service_name,sc.amount service_amount,sc.billing_frequency,l.billing_day,l.status lease_status,p.currency
     FROM lease_services ls JOIN service_catalog sc ON sc.id=ls.service_id JOIN leases l ON l.id=ls.lease_id JOIN properties p ON p.id=ls.property_id
     WHERE ls.id=$subscriptionId`,
    { subscriptionId }
  );
  if (!subscription || subscription.status !== "active" || subscription.lease_status !== "active") throw new Error("Billable subscription not found");
  assertPermission(actor, "services.manage", subscription.property_id);
  assertPermission(actor, "billing.manage", subscription.property_id);
  const requestedPeriod = text(formData, "period") || today().slice(0, 7);
  const period = canonicalServicePeriod(subscription.billing_frequency, requestedPeriod);
  const amount = normalizedMoney(subscription.custom_amount ?? subscription.service_amount, "Service amount");
  if (!(amount > 0)) throw new Error("Configure a positive service amount before billing");
  const dueDate = validDate(text(formData, "dueDate") || today(), "Service invoice due date");
  transaction(() => {
    if (get("SELECT 1 FROM service_billing_runs WHERE subscription_id=$subscriptionId AND period=$period", { subscriptionId, period })) throw new Error("This service period was already billed");
    const tenantId = subscription.tenant_id || get("SELECT tenant_id FROM lease_tenants WHERE lease_id=$leaseId ORDER BY is_primary DESC,tenant_id LIMIT 1", { leaseId: subscription.lease_id })?.tenant_id || null;
    const invoiceNumber = uid("INV");
    const inserted = run(
      `INSERT INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,charge_type,status)
       VALUES ($propertyId,$leaseId,$tenantId,$number,$description,$issueDate,$dueDate,$amount,'manual','issued')`,
      { propertyId: subscription.property_id, leaseId: subscription.lease_id, tenantId, number: invoiceNumber, description: `${subscription.service_name} · ${period}`, issueDate: today(), dueDate, amount }
    );
    const invoiceId = Number(inserted.lastInsertRowid);
    run("INSERT INTO service_billing_runs (subscription_id,period,invoice_id,created_by) VALUES ($subscriptionId,$period,$invoiceId,$createdBy)", { subscriptionId, period, invoiceId, createdBy: actor.id });
    recordAudit({ actor, action: "create", entityType: "service_invoice", entityId: invoiceId, propertyId: subscription.property_id, summary: `Billed ${subscription.service_name} for ${period}`, metadata: { subscriptionId, amount, invoiceNumber, frequency: subscription.billing_frequency } });
  });
  refreshServiceViews();
  safeRedirect("/services", "Service invoice created");
}
