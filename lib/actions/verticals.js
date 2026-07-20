import { revalidatePath } from "next/cache";
import { canAccessProperty, requireUser } from "@/lib/auth";
import { all, get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { today, uid } from "@/lib/format";
import { choice, integer, number, safeRedirect, text } from "@/lib/actions/shared";
import { hasPermission } from "@/lib/permissions";
import { requestLabel, verticalContract } from "@/lib/verticals";
import { requireTenant } from "@/lib/tenant-auth";
import { zonedDateTimeToIso } from "@/lib/workspace-localization";

const REQUEST_STATUSES = ["submitted", "approved", "rejected", "cancelled", "completed"];
const RESERVATION_STATUSES = ["reserved", "checked_in", "checked_out", "cancelled", "no_show"];
const HOUSEKEEPING_TRANSITIONS = Object.freeze({
  open: ["in_progress", "blocked", "completed", "cancelled"],
  in_progress: ["blocked", "completed", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  completed: [],
  cancelled: []
});

function requirePropertyPermission(actor, propertyId, permission) {
  if (!propertyId || !canAccessProperty(actor, propertyId) || !hasPermission(actor, permission, propertyId)) throw new Error("Property permission denied");
}

function limited(formData, key, max = 2000, required = false) {
  const value = text(formData, key, required);
  if (value.length > max) throw new Error(`${key} must be ${max} characters or fewer`);
  return value;
}

function validDate(value, label, required = false) {
  const date = String(value || "").trim();
  if (!date && !required) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${label} must be a valid date`);
  }
  return date;
}

function validDateTime(value, label, required = false) {
  const date = String(value || "").trim();
  if (!date && !required) return null;
  const local = date.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (local) {
    validDate(local[1], label, true);
    return zonedDateTimeToIso(date);
  }
  const zoned = date.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/);
  if (!zoned) throw new Error(`${label} must be a valid date and time`);
  validDate(zoned[1], label, true);
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid date and time`);
  return parsed.toISOString();
}

function refreshVerticals() {
  ["/operations", "/reservations", "/housekeeping", "/team", "/services", "/invoices", "/reports", "/dashboard", "/audit", "/portal", "/portal/requests", "/portal/profile"].forEach(revalidatePath);
}

function propertyRecord(propertyId) {
  return get("SELECT id,name,module_id,status,currency FROM properties WHERE id=$propertyId", { propertyId: Number(propertyId) });
}

function formSettings(formData, keys) {
  const result = {};
  for (const key of keys) {
    const raw = formData.get(`config_${key}`);
    if (raw === null) continue;
    const value = String(raw).trim();
    if (value.length > 500) throw new Error(`${key} is too long`);
    result[key] = value;
  }
  return result;
}

export async function savePropertyOperatingConfigAction(formData) {
  const actor = await requireUser();
  const propertyId = integer(formData, "propertyId");
  requirePropertyPermission(actor, propertyId, "verticals.manage");
  const property = propertyRecord(propertyId);
  if (!property) throw new Error("Property not found");
  const contract = verticalContract(property.module_id);
  const settings = formSettings(formData, contract.config);
  transaction(() => {
    run(
      `INSERT INTO property_operating_configs (property_id,module_id,settings_json,configured_by)
       VALUES ($propertyId,$moduleId,$settingsJson,$actorId)
       ON CONFLICT(property_id) DO UPDATE SET module_id=excluded.module_id,settings_json=excluded.settings_json,
       configured_by=excluded.configured_by,updated_at=CURRENT_TIMESTAMP`,
      { propertyId, moduleId: property.module_id, settingsJson: JSON.stringify(settings), actorId: actor.id }
    );
    recordAudit({ actor, action: "settings", entityType: "property_operating_config", entityId: propertyId, propertyId, summary: `Updated ${contract.label} configuration`, metadata: { fields: Object.keys(settings) } });
  });
  refreshVerticals();
  safeRedirect("/operations", "Operating configuration saved");
}

export async function saveResidentVerticalProfileAction(formData) {
  const actor = await requireUser();
  const tenantId = integer(formData, "tenantId");
  const tenant = get("SELECT t.*,p.module_id FROM tenants t JOIN properties p ON p.id=t.property_id WHERE t.id=$tenantId", { tenantId });
  if (!tenant) throw new Error("Person not found");
  requirePropertyPermission(actor, tenant.property_id, "people.manage");
  const contract = verticalContract(tenant.module_id);
  const allowed = new Set(contract.profileFields);
  const profile = {
    external_id: allowed.has("external_id") ? limited(formData, "external_id", 120) : "",
    organisation: allowed.has("organisation") ? limited(formData, "organisation", 180) : "",
    department: allowed.has("department") ? limited(formData, "department", 180) : "",
    programme: allowed.has("programme") ? limited(formData, "programme", 180) : "",
    level_or_designation: allowed.has("level_or_designation") ? limited(formData, "level_or_designation", 180) : "",
    guardian_name: allowed.has("guardian_name") ? limited(formData, "guardian_name", 180) : "",
    guardian_phone: allowed.has("guardian_phone") ? limited(formData, "guardian_phone", 80) : "",
    guardian_email: allowed.has("guardian_email") ? limited(formData, "guardian_email", 254).toLowerCase() : "",
    sponsor_name: allowed.has("sponsor_name") ? limited(formData, "sponsor_name", 180) : "",
    sponsor_reference: allowed.has("sponsor_reference") ? limited(formData, "sponsor_reference", 180) : "",
    payroll_recovery: allowed.has("payroll_recovery") ? Math.max(0, number(formData, "payroll_recovery")) : 0,
    employer_paid_amount: allowed.has("employer_paid_amount") ? Math.max(0, number(formData, "employer_paid_amount")) : 0,
    curfew_time: allowed.has("curfew_time") ? limited(formData, "curfew_time", 20) : "",
    eligibility_end_date: allowed.has("eligibility_end_date") ? validDate(formData.get("eligibility_end_date"), "Eligibility end date") : null
  };
  transaction(() => {
    run(
      `INSERT INTO resident_vertical_profiles
       (tenant_id,property_id,module_id,external_id,organisation,department,programme,level_or_designation,guardian_name,guardian_phone,guardian_email,sponsor_name,sponsor_reference,payroll_recovery,employer_paid_amount,curfew_time,eligibility_end_date,updated_by)
       VALUES ($tenantId,$propertyId,$moduleId,$external_id,$organisation,$department,$programme,$level_or_designation,$guardian_name,$guardian_phone,$guardian_email,$sponsor_name,$sponsor_reference,$payroll_recovery,$employer_paid_amount,$curfew_time,$eligibility_end_date,$actorId)
       ON CONFLICT(tenant_id) DO UPDATE SET property_id=excluded.property_id,module_id=excluded.module_id,external_id=excluded.external_id,
       organisation=excluded.organisation,department=excluded.department,programme=excluded.programme,level_or_designation=excluded.level_or_designation,
       guardian_name=excluded.guardian_name,guardian_phone=excluded.guardian_phone,guardian_email=excluded.guardian_email,
       sponsor_name=excluded.sponsor_name,sponsor_reference=excluded.sponsor_reference,payroll_recovery=excluded.payroll_recovery,
       employer_paid_amount=excluded.employer_paid_amount,curfew_time=excluded.curfew_time,eligibility_end_date=excluded.eligibility_end_date,
       updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`,
      { tenantId, propertyId: tenant.property_id, moduleId: tenant.module_id, ...profile, actorId: actor.id }
    );
    recordAudit({ actor, action: "update", entityType: "vertical_profile", entityId: tenantId, propertyId: tenant.property_id, summary: `Updated ${contract.profileTitle} for ${tenant.full_name}`, metadata: { moduleId: tenant.module_id, fields: [...allowed] } });
  });
  refreshVerticals();
  safeRedirect("/operations", "Module profile saved");
}

function validateRequest(property, requestType, portalOnly = false) {
  const contract = verticalContract(property.module_id);
  const allowed = portalOnly ? contract.portalActions : contract.requestTypes;
  if (!allowed.includes(requestType)) throw new Error("Request type is not available for this operating model");
  return contract;
}

export async function createModuleRequestAction(formData) {
  const actor = await requireUser();
  const propertyId = integer(formData, "propertyId");
  requirePropertyPermission(actor, propertyId, "verticals.manage");
  const tenantId = integer(formData, "tenantId");
  const tenant = get("SELECT t.*,p.module_id FROM tenants t JOIN properties p ON p.id=t.property_id WHERE t.id=$tenantId AND t.property_id=$propertyId", { tenantId, propertyId });
  if (!tenant) throw new Error("Person does not belong to the selected property");
  const requestType = text(formData, "requestType", true);
  validateRequest(tenant, requestType);
  const leaseId = integer(formData, "leaseId") || null;
  if (leaseId && !get("SELECT 1 FROM lease_tenants WHERE lease_id=$leaseId AND tenant_id=$tenantId", { leaseId, tenantId })) throw new Error("Agreement does not belong to this person");
  transaction(() => {
    const result = run(
      `INSERT INTO module_requests (property_id,lease_id,tenant_id,request_type,title,details,starts_at,ends_at,status,created_by_user)
       VALUES ($propertyId,$leaseId,$tenantId,$requestType,$title,$details,$startsAt,$endsAt,'submitted',$actorId)`,
      { propertyId, leaseId, tenantId, requestType, title: limited(formData, "title", 180, true), details: limited(formData, "details", 4000), startsAt: validDateTime(formData.get("startsAt"), "Start"), endsAt: validDateTime(formData.get("endsAt"), "End"), actorId: actor.id }
    );
    recordAudit({ actor, action: "create", entityType: "module_request", entityId: Number(result.lastInsertRowid), propertyId, summary: `Created ${requestLabel(requestType)} request for ${tenant.full_name}`, metadata: { requestType, tenantId, leaseId } });
  });
  refreshVerticals();
  safeRedirect("/operations", "Request created");
}

export async function createTenantModuleRequestAction(formData) {
  const tenant = await requireTenant();
  const property = propertyRecord(tenant.property_id);
  const requestType = text(formData, "requestType", true);
  validateRequest(property, requestType, true);
  const lease = get(
    `SELECT l.id FROM leases l JOIN lease_tenants lt ON lt.lease_id=l.id
     WHERE lt.tenant_id=$tenantId AND l.property_id=$propertyId AND l.status='active' ORDER BY l.start_date DESC LIMIT 1`,
    { tenantId: tenant.tenant_id, propertyId: tenant.property_id }
  );
  if (!lease) throw new Error("An active agreement is required");
  transaction(() => {
    const result = run(
      `INSERT INTO module_requests (property_id,lease_id,tenant_id,request_type,title,details,starts_at,ends_at,status,created_by_tenant)
       VALUES ($propertyId,$leaseId,$tenantId,$requestType,$title,$details,$startsAt,$endsAt,'submitted',$tenantId)`,
      { propertyId: tenant.property_id, leaseId: lease.id, tenantId: tenant.tenant_id, requestType, title: limited(formData, "title", 180, true), details: limited(formData, "details", 4000), startsAt: validDateTime(formData.get("startsAt"), "Start"), endsAt: validDateTime(formData.get("endsAt"), "End") }
    );
    recordAudit({ tenantActor: tenant, action: "create", entityType: "module_request", entityId: Number(result.lastInsertRowid), propertyId: tenant.property_id, summary: `${tenant.full_name} submitted ${requestLabel(requestType)}`, metadata: { requestType, leaseId: lease.id } });
  });
  refreshVerticals();
  safeRedirect("/portal/requests", "Request submitted");
}

export async function cancelTenantModuleRequestAction(formData) {
  const tenant = await requireTenant();
  const requestId = integer(formData, "requestId");
  const request = get("SELECT * FROM module_requests WHERE id=$requestId AND tenant_id=$tenantId", { requestId, tenantId: tenant.tenant_id });
  if (!request || request.status !== "submitted") throw new Error("Request cannot be cancelled");
  transaction(() => {
    const changed = run("UPDATE module_requests SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=$requestId AND tenant_id=$tenantId AND status='submitted'", { requestId, tenantId: tenant.tenant_id });
    if (Number(changed.changes) !== 1) throw new Error("Request status changed before cancellation completed");
    recordAudit({ tenantActor: tenant, action: "status", entityType: "module_request", entityId: requestId, propertyId: request.property_id, summary: `${tenant.full_name} cancelled ${requestLabel(request.request_type)}` });
  });
  refreshVerticals();
  safeRedirect("/portal/requests", "Request cancelled");
}

export async function reviewModuleRequestAction(formData) {
  const actor = await requireUser();
  const requestId = integer(formData, "requestId");
  const status = choice(formData, "status", REQUEST_STATUSES.filter((item) => item !== "submitted"));
  const request = get("SELECT mr.*,t.full_name,p.module_id FROM module_requests mr JOIN tenants t ON t.id=mr.tenant_id JOIN properties p ON p.id=mr.property_id WHERE mr.id=$requestId", { requestId });
  if (!request) throw new Error("Request not found");
  requirePropertyPermission(actor, request.property_id, "requests.review");
  if (!["submitted", "approved"].includes(request.status)) throw new Error("Request is already closed");
  if (request.status === "approved" && !["completed", "cancelled"].includes(status)) throw new Error("Approved requests can only be completed or cancelled");
  const note = limited(formData, "resolutionNote", 2000);
  transaction(() => {
    const changed = run(
      `UPDATE module_requests SET status=$status,resolution_note=$note,reviewed_by=$actorId,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
       WHERE id=$requestId AND status=$currentStatus`,
      { status, note, actorId: actor.id, requestId, currentStatus: request.status }
    );
    if (Number(changed.changes) !== 1) throw new Error("Request status changed before review completed");
    recordAudit({ actor, action: "status", entityType: "module_request", entityId: requestId, propertyId: request.property_id, summary: `${status} ${requestLabel(request.request_type)} for ${request.full_name}`, metadata: { from: request.status, to: status } });
  });
  refreshVerticals();
  safeRedirect("/operations", `Request ${status}`);
}

function reservationOverlap({ propertyId, spaceId, arrivalDate, departureDate, excludeId = 0 }) {
  if (!spaceId) return null;
  return get(
    `SELECT id,reference FROM hostel_reservations
     WHERE property_id=$propertyId AND space_id=$spaceId AND id!=$excludeId
     AND status IN ('reserved','checked_in') AND arrival_date<$departureDate AND departure_date>$arrivalDate LIMIT 1`,
    { propertyId, spaceId, arrivalDate, departureDate, excludeId }
  );
}

export async function createHostelReservationAction(formData) {
  const actor = await requireUser();
  const propertyId = integer(formData, "propertyId");
  requirePropertyPermission(actor, propertyId, "reservations.manage");
  const property = propertyRecord(propertyId);
  if (!property || property.module_id !== "hostel") throw new Error("Reservations are available only for Hostel properties");
  const unitId = integer(formData, "unitId") || null;
  const spaceId = integer(formData, "spaceId") || null;
  if (unitId && !get("SELECT 1 FROM units WHERE id=$unitId AND property_id=$propertyId AND status NOT IN ('maintenance','inactive')", { unitId, propertyId })) throw new Error("Inventory is unavailable");
  if (spaceId && !get("SELECT 1 FROM rentable_spaces WHERE id=$spaceId AND property_id=$propertyId AND unit_id=$unitId AND status!='inactive'", { spaceId, propertyId, unitId })) throw new Error("Bed is unavailable");
  const arrivalDate = validDate(formData.get("arrivalDate"), "Arrival date", true);
  const departureDate = validDate(formData.get("departureDate"), "Departure date", true);
  if (departureDate <= arrivalDate) throw new Error("Departure must be after arrival");
  if (reservationOverlap({ propertyId, spaceId, arrivalDate, departureDate })) throw new Error("The selected bed is already reserved for overlapping dates");
  const reference = uid("BOOK");
  transaction(() => {
    const result = run(
      `INSERT INTO hostel_reservations (property_id,unit_id,space_id,reference,guest_name,guest_email,guest_phone,identity_reference,source,arrival_date,departure_date,adults,nightly_rate,tax_amount,status,notes,created_by)
       VALUES ($propertyId,$unitId,$spaceId,$reference,$guestName,$guestEmail,$guestPhone,$identityReference,$source,$arrivalDate,$departureDate,$adults,$nightlyRate,$taxAmount,'reserved',$notes,$actorId)`,
      { propertyId, unitId, spaceId, reference, guestName: limited(formData, "guestName", 180, true), guestEmail: limited(formData, "guestEmail", 254).toLowerCase(), guestPhone: limited(formData, "guestPhone", 80), identityReference: limited(formData, "identityReference", 180), source: limited(formData, "source", 80) || "direct", arrivalDate, departureDate, adults: Math.max(1, integer(formData, "adults", 1)), nightlyRate: Math.max(0, number(formData, "nightlyRate")), taxAmount: Math.max(0, number(formData, "taxAmount")), notes: limited(formData, "notes", 2000), actorId: actor.id }
    );
    recordAudit({ actor, action: "create", entityType: "hostel_reservation", entityId: Number(result.lastInsertRowid), propertyId, summary: `Created reservation ${reference}`, metadata: { unitId, spaceId, arrivalDate, departureDate } });
  });
  refreshVerticals();
  safeRedirect("/reservations", "Reservation created");
}

export async function updateHostelReservationStatusAction(formData) {
  const actor = await requireUser();
  const reservationId = integer(formData, "reservationId");
  const next = choice(formData, "status", RESERVATION_STATUSES);
  const reservation = get("SELECT * FROM hostel_reservations WHERE id=$reservationId", { reservationId });
  if (!reservation) throw new Error("Reservation not found");
  requirePropertyPermission(actor, reservation.property_id, "reservations.manage");
  const allowed = { reserved: ["checked_in", "cancelled", "no_show"], checked_in: ["checked_out"], checked_out: [], cancelled: [], no_show: [] };
  if (!allowed[reservation.status]?.includes(next)) throw new Error("Invalid reservation transition");
  if (next === "checked_in") {
    if (!reservation.space_id) throw new Error("Assign a bed before check-in");
    if (reservationOverlap({ propertyId: reservation.property_id, spaceId: reservation.space_id, arrivalDate: reservation.arrival_date, departureDate: reservation.departure_date, excludeId: reservation.id })) throw new Error("Bed availability changed");
  }
  transaction(() => {
    const changed = run(
      "UPDATE hostel_reservations SET status=$next,updated_at=CURRENT_TIMESTAMP WHERE id=$reservationId AND status=$currentStatus",
      { next, reservationId, currentStatus: reservation.status }
    );
    if (Number(changed.changes) !== 1) throw new Error("Reservation status changed before this transition completed");
    if (next === "checked_out") {
      run(
        `INSERT INTO housekeeping_tasks (property_id,unit_id,space_id,reservation_id,task_type,priority,due_at,status,notes,created_by)
         SELECT $propertyId,$unitId,$spaceId,$reservationId,'turnover','high',CURRENT_TIMESTAMP,'open','Automatic checkout turnover',$actorId
         WHERE NOT EXISTS (SELECT 1 FROM housekeeping_tasks WHERE reservation_id=$reservationId AND task_type='turnover')`,
        { propertyId: reservation.property_id, unitId: reservation.unit_id, spaceId: reservation.space_id, reservationId, actorId: actor.id }
      );
    }
    recordAudit({ actor, action: "status", entityType: "hostel_reservation", entityId: reservationId, propertyId: reservation.property_id, summary: `${next.replaceAll("_", " ")} reservation ${reservation.reference}`, metadata: { from: reservation.status, to: next } });
  });
  refreshVerticals();
  safeRedirect("/reservations", `Reservation ${next.replaceAll("_", " ")}`);
}

export async function createHousekeepingTaskAction(formData) {
  const actor = await requireUser();
  const propertyId = integer(formData, "propertyId");
  requirePropertyPermission(actor, propertyId, "housekeeping.manage");
  const property = propertyRecord(propertyId);
  if (!property || !["hostel", "pg_coliving", "student_housing", "staff_housing"].includes(property.module_id)) throw new Error("Housekeeping is unavailable for this module");
  const unitId = integer(formData, "unitId") || null;
  const spaceId = integer(formData, "spaceId") || null;
  if (unitId && !get("SELECT 1 FROM units WHERE id=$unitId AND property_id=$propertyId", { unitId, propertyId })) throw new Error("Invalid unit");
  if (spaceId && !get("SELECT 1 FROM rentable_spaces WHERE id=$spaceId AND property_id=$propertyId AND unit_id=$unitId", { spaceId, propertyId, unitId })) throw new Error("Invalid space");
  transaction(() => {
    const result = run(
      `INSERT INTO housekeeping_tasks (property_id,unit_id,space_id,task_type,priority,due_at,status,assigned_to,notes,created_by)
       VALUES ($propertyId,$unitId,$spaceId,$taskType,$priority,$dueAt,'open',$assignedTo,$notes,$actorId)`,
      { propertyId, unitId, spaceId, taskType: limited(formData, "taskType", 80) || "cleaning", priority: choice(formData, "priority", ["low", "normal", "high", "urgent"], "normal"), dueAt: validDateTime(formData.get("dueAt"), "Due time"), assignedTo: integer(formData, "assignedTo") || null, notes: limited(formData, "notes", 2000), actorId: actor.id }
    );
    recordAudit({ actor, action: "create", entityType: "housekeeping_task", entityId: Number(result.lastInsertRowid), propertyId, summary: "Created housekeeping task", metadata: { unitId, spaceId } });
  });
  refreshVerticals();
  safeRedirect("/housekeeping", "Housekeeping task created");
}

export async function updateHousekeepingTaskAction(formData) {
  const actor = await requireUser();
  const taskId = integer(formData, "taskId");
  const status = choice(formData, "status", Object.keys(HOUSEKEEPING_TRANSITIONS));
  const task = get("SELECT * FROM housekeeping_tasks WHERE id=$taskId", { taskId });
  if (!task) throw new Error("Task not found");
  requirePropertyPermission(actor, task.property_id, "housekeeping.manage");
  const notes = limited(formData, "notes", 2000);
  const sameStatus = status === task.status;
  if (!sameStatus && !HOUSEKEEPING_TRANSITIONS[task.status]?.includes(status)) throw new Error("Invalid housekeeping transition");
  if (sameStatus && !notes) throw new Error("Add an update note or choose a new status");
  transaction(() => {
    const changed = run(
      `UPDATE housekeeping_tasks SET status=$status,
       completed_at=CASE WHEN $status='completed' THEN COALESCE(completed_at,CURRENT_TIMESTAMP) WHEN $status=$currentStatus THEN completed_at ELSE NULL END,
       notes=CASE WHEN $notes='' THEN notes ELSE $notes END,updated_at=CURRENT_TIMESTAMP WHERE id=$taskId AND status=$currentStatus`,
      { status, notes, taskId, currentStatus: task.status }
    );
    if (Number(changed.changes) !== 1) throw new Error("Housekeeping status changed before this update completed");
    recordAudit({ actor, action: sameStatus ? "update" : "status", entityType: "housekeeping_task", entityId: taskId, propertyId: task.property_id, summary: sameStatus ? "Updated housekeeping task note" : `Moved housekeeping task to ${status.replaceAll("_", " ")}`, metadata: { from: task.status, to: status, noteUpdated: Boolean(notes) } });
  });
  refreshVerticals();
  safeRedirect("/housekeeping", "Housekeeping task updated");
}

function periodMatches(frequency, period) {
  if (frequency === "one_time") return period === "one-time";
  if (frequency === "monthly") return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
  if (frequency === "quarterly") return /^\d{4}-Q[1-4]$/.test(period);
  if (frequency === "annual") return /^\d{4}$/.test(period);
  return false;
}

export async function bulkServiceBillingAction(formData) {
  const actor = await requireUser();
  const propertyId = integer(formData, "propertyId");
  requirePropertyPermission(actor, propertyId, "billing.manage");
  const property = propertyRecord(propertyId);
  if (!property) throw new Error("Property not found");
  const period = limited(formData, "period", 20, true);
  const mode = choice(formData, "mode", ["preview", "run"], "preview");
  const dueDate = validDate(formData.get("dueDate") || today(), "Due date", true);
  const subscriptions = all(
    `SELECT ls.*,sc.name service_name,sc.billing_frequency,sc.amount default_amount,l.reference lease_reference
     FROM lease_services ls JOIN service_catalog sc ON sc.id=ls.service_id JOIN leases l ON l.id=ls.lease_id
     WHERE ls.property_id=$propertyId AND ls.status='active' AND sc.active=1 AND sc.billing_frequency!='included'
     ORDER BY ls.id`,
    { propertyId }
  ).filter((item) => periodMatches(item.billing_frequency, period));
  const eligible = subscriptions.filter((item) => !get("SELECT 1 FROM service_billing_runs WHERE subscription_id=$id AND period=$period", { id: item.id, period }));
  const billable = eligible.filter((item) => Number(item.custom_amount ?? item.default_amount) > 0);
  const preview = billable.map((item) => ({ subscriptionId: item.id, service: item.service_name, agreement: item.lease_reference, amount: Number(item.custom_amount ?? item.default_amount) }));
  if (mode === "preview") {
    const key = `preview:service:${propertyId}:${period}:${uid("JOB")}`;
    run(
      `INSERT INTO bulk_jobs (property_id,job_type,period,idempotency_key,status,input_json,preview_json,created_by)
       VALUES ($propertyId,'service_billing',$period,$key,'preview',$input,$preview,$actorId)`,
      { propertyId, period, key, input: JSON.stringify({ dueDate }), preview: JSON.stringify(preview), actorId: actor.id }
    );
    refreshVerticals();
    safeRedirect("/services", `${billable.length} service invoice(s) ready for ${period}`);
  }

  const idempotencyKey = `service-billing:${propertyId}:${period}`;
  const created = transaction(() => {
    const existing = get("SELECT * FROM bulk_jobs WHERE idempotency_key=$key", { key: idempotencyKey });
    if (existing?.status === "completed") throw new Error("This property and service period was already processed");
    if (existing?.status === "running") throw new Error("This property and service period is already being processed");
    if (existing) {
      run("UPDATE bulk_jobs SET status='running',error_text=NULL,input_json=$input,preview_json=$preview WHERE id=$id", { input: JSON.stringify({ dueDate }), preview: JSON.stringify(preview), id: existing.id });
    } else {
      run(
        `INSERT INTO bulk_jobs (property_id,job_type,period,idempotency_key,status,input_json,preview_json,created_by)
         VALUES ($propertyId,'service_billing',$period,$key,'running',$input,$preview,$actorId)`,
        { propertyId, period, key: idempotencyKey, input: JSON.stringify({ dueDate }), preview: JSON.stringify(preview), actorId: actor.id }
      );
    }
    const rows = [];
    for (const item of billable) {
      const amount = Number(item.custom_amount ?? item.default_amount);
      const invoiceNumber = uid("INV");
      const invoice = run(
        `INSERT INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,charge_type,status)
         VALUES ($propertyId,$leaseId,$tenantId,$number,$description,$issueDate,$dueDate,$amount,'manual','issued')`,
        { propertyId, leaseId: item.lease_id, tenantId: item.tenant_id || null, number: invoiceNumber, description: `${item.service_name} · ${period}`, issueDate: today(), dueDate, amount }
      );
      const invoiceId = Number(invoice.lastInsertRowid);
      run("INSERT INTO service_billing_runs (subscription_id,period,invoice_id,created_by) VALUES ($subscriptionId,$period,$invoiceId,$actorId)", { subscriptionId: item.id, period, invoiceId, actorId: actor.id });
      rows.push({ subscriptionId: item.id, invoiceId, invoiceNumber, amount });
    }
    run("UPDATE bulk_jobs SET status='completed',result_json=$result,completed_at=CURRENT_TIMESTAMP WHERE idempotency_key=$key AND status='running'", { result: JSON.stringify(rows), key: idempotencyKey });
    recordAudit({ actor, action: "generate", entityType: "bulk_service_billing", propertyId, summary: `Generated ${rows.length} service invoices for ${period}`, metadata: { period, count: rows.length, idempotencyKey } });
    return rows;
  });
  refreshVerticals();
  safeRedirect("/services", `${created.length} service invoice(s) generated`);
}
