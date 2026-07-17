import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { applyMigrations, schema } from "../lib/schema.js";
import { applyReleaseMigrations } from "../lib/schema/release-migrations.js";

const filename = path.join(tmpdir(), `nivasaos-verticals-${randomBytes(8).toString("hex")}.sqlite`);
const db = new Database(filename, { create: true, strict: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const rejects = (fn, message) => {
  let rejected = false;
  try { fn(); } catch { rejected = true; }
  assert(rejected, message);
};

try {
  db.exec(schema);
  applyMigrations(db);
  applyReleaseMigrations(db);

  const ownerId = Number(db.query("INSERT INTO users (name,email,password_hash,role) VALUES ('Owner','owner@example.com','test','owner')").run().lastInsertRowid);
  const staffId = Number(db.query("INSERT INTO users (name,email,password_hash,role) VALUES ('Staff','staff@example.com','test','staff')").run().lastInsertRowid);
  for (const [index, moduleId] of ["residential", "pg_coliving", "hostel", "student_housing", "staff_housing", "commercial"].entries()) {
    db.query("INSERT OR REPLACE INTO workspace_modules (module_id,enabled,sort_order,settings_json) VALUES ($moduleId,1,$sortOrder,$settings)")
      .run({ moduleId, sortOrder: index * 10 + 10, settings: JSON.stringify({ moduleId, inherited: true }) });
  }

  const unusedProperty = Number(db.query(
    "INSERT INTO properties (name,type,module_id,address,city,currency) VALUES ('Unused Home','apartment','residential','1 Empty Road','Surat','INR')"
  ).run().lastInsertRowid);
  db.query("INSERT INTO property_operating_configs (property_id,module_id,settings_json,is_customized,configured_by) VALUES ($propertyId,'residential','{\"notice\":30}',0,$ownerId)")
    .run({ propertyId: unusedProperty, ownerId });
  db.query("UPDATE properties SET module_id='hostel',type='boarding_house' WHERE id=$propertyId").run({ propertyId: unusedProperty });
  const resetConfig = db.query("SELECT module_id,is_customized,settings_json FROM property_operating_configs WHERE property_id=$propertyId").get({ propertyId: unusedProperty });
  assert(resetConfig.module_id === "hostel" && Number(resetConfig.is_customized) === 0, "Unused property module change did not reset inherited configuration");
  assert(JSON.parse(resetConfig.settings_json).moduleId === "hostel", "Module change did not inherit the target module defaults");

  const lockedProperty = Number(db.query(
    "INSERT INTO properties (name,type,module_id,address,city,currency) VALUES ('Configured PG','boarding_house','pg_coliving','2 Lock Road','Surat','INR')"
  ).run().lastInsertRowid);
  db.query("INSERT INTO property_operating_configs (property_id,module_id,settings_json,is_customized,configured_by) VALUES ($propertyId,'pg_coliving','{\"visitor_hours\":\"10:00-20:00\"}',1,$ownerId)")
    .run({ propertyId: lockedProperty, ownerId });
  rejects(() => db.query("UPDATE properties SET module_id='residential' WHERE id=$propertyId").run({ propertyId: lockedProperty }), "Customized operating rules must lock the property module");

  const hostelProperty = Number(db.query(
    "INSERT INTO properties (name,type,module_id,address,city,currency) VALUES ('Release Hostel','boarding_house','hostel','3 Stay Road','Surat','INR')"
  ).run().lastInsertRowid);
  const unitId = Number(db.query(
    "INSERT INTO units (property_id,name,unit_type,capacity,monthly_rate,deposit,status) VALUES ($propertyId,'Dorm A','Dormitory',4,0,0,'available')"
  ).run({ propertyId: hostelProperty }).lastInsertRowid);
  const spaceOne = Number(db.query(
    "INSERT INTO rentable_spaces (property_id,unit_id,code,space_type,status) VALUES ($propertyId,$unitId,'A-1','bunk','available')"
  ).run({ propertyId: hostelProperty, unitId }).lastInsertRowid);
  const spaceTwo = Number(db.query(
    "INSERT INTO rentable_spaces (property_id,unit_id,code,space_type,status) VALUES ($propertyId,$unitId,'A-2','bunk','available')"
  ).run({ propertyId: hostelProperty, unitId }).lastInsertRowid);
  const spaceThree = Number(db.query(
    "INSERT INTO rentable_spaces (property_id,unit_id,code,space_type,status) VALUES ($propertyId,$unitId,'A-3','bunk','available')"
  ).run({ propertyId: hostelProperty, unitId }).lastInsertRowid);

  db.query(`INSERT INTO hostel_reservations
    (property_id,unit_id,space_id,reference,guest_name,arrival_date,departure_date,status,created_by)
    VALUES ($propertyId,$unitId,$spaceId,'BOOK-A','Guest A','2026-08-01','2026-08-05','reserved',$ownerId)`)
    .run({ propertyId: hostelProperty, unitId, spaceId: spaceOne, ownerId });
  rejects(() => db.query(`INSERT INTO hostel_reservations
    (property_id,unit_id,space_id,reference,guest_name,arrival_date,departure_date,status,created_by)
    VALUES ($propertyId,$unitId,$spaceId,'BOOK-OVERLAP','Guest B','2026-08-04','2026-08-07','reserved',$ownerId)`)
    .run({ propertyId: hostelProperty, unitId, spaceId: spaceOne, ownerId }), "Partially overlapping reservations must be rejected by SQLite");
  const adjacentId = Number(db.query(`INSERT INTO hostel_reservations
    (property_id,unit_id,space_id,reference,guest_name,arrival_date,departure_date,status,created_by)
    VALUES ($propertyId,$unitId,$spaceId,'BOOK-ADJACENT','Guest C','2026-08-05','2026-08-07','reserved',$ownerId)`)
    .run({ propertyId: hostelProperty, unitId, spaceId: spaceOne, ownerId }).lastInsertRowid);
  rejects(() => db.query("UPDATE hostel_reservations SET arrival_date='2026-08-04' WHERE id=$id").run({ id: adjacentId }), "Reservation updates must enforce interval overlap");

  const tenantId = Number(db.query(
    "INSERT INTO tenants (property_id,full_name,email,phone,status) VALUES ($propertyId,'Resident One','resident@example.com','910000000001','active')"
  ).run({ propertyId: hostelProperty }).lastInsertRowid);
  const leaseId = Number(db.query(
    "INSERT INTO leases (property_id,unit_id,reference,start_date,monthly_rent,deposit,billing_day,status) VALUES ($propertyId,$unitId,'LEASE-VERTICAL','2026-08-01',0,0,1,'active')"
  ).run({ propertyId: hostelProperty, unitId }).lastInsertRowid);
  db.query("INSERT INTO lease_tenants (lease_id,tenant_id,is_primary) VALUES ($leaseId,$tenantId,1)").run({ leaseId, tenantId });
  db.query(`INSERT INTO space_allocations
    (property_id,space_id,lease_id,tenant_id,start_date,status,created_by)
    VALUES ($propertyId,$spaceId,$leaseId,$tenantId,'2026-08-01','active',$ownerId)`)
    .run({ propertyId: hostelProperty, spaceId: spaceTwo, leaseId, tenantId, ownerId });
  rejects(() => db.query(`INSERT INTO hostel_reservations
    (property_id,unit_id,space_id,reference,guest_name,arrival_date,departure_date,status,created_by)
    VALUES ($propertyId,$unitId,$spaceId,'BOOK-ALLOCATED','Guest D','2026-08-10','2026-08-12','reserved',$ownerId)`)
    .run({ propertyId: hostelProperty, unitId, spaceId: spaceTwo, ownerId }), "Reservations must not overlap active resident allocations");

  db.query(`INSERT INTO hostel_reservations
    (property_id,unit_id,space_id,reference,guest_name,arrival_date,departure_date,status,created_by)
    VALUES ($propertyId,$unitId,$spaceId,'BOOK-BLOCK-ALLOC','Guest E','2026-09-01','2026-09-04','reserved',$ownerId)`)
    .run({ propertyId: hostelProperty, unitId, spaceId: spaceThree, ownerId });
  rejects(() => db.query(`INSERT INTO space_allocations
    (property_id,space_id,lease_id,tenant_id,start_date,status,created_by)
    VALUES ($propertyId,$spaceId,$leaseId,$tenantId,'2026-09-02','active',$ownerId)`)
    .run({ propertyId: hostelProperty, spaceId: spaceThree, leaseId, tenantId, ownerId }), "Resident allocation must not overlap an active reservation");

  rejects(() => db.query(`INSERT INTO resident_vertical_profiles (tenant_id,property_id,module_id,updated_by)
    VALUES ($tenantId,$propertyId,'student_housing',$ownerId)`)
    .run({ tenantId, propertyId: hostelProperty, ownerId }), "Vertical profiles must match the tenant property module");
  db.query(`INSERT INTO resident_vertical_profiles (tenant_id,property_id,module_id,external_id,updated_by)
    VALUES ($tenantId,$propertyId,'hostel','MEM-001',$ownerId)`)
    .run({ tenantId, propertyId: hostelProperty, ownerId });

  rejects(() => db.query(`INSERT INTO module_requests (property_id,tenant_id,request_type,title,status)
    VALUES ($propertyId,$tenantId,'bed_change','Move bed','submitted')`)
    .run({ propertyId: hostelProperty, tenantId }), "Module requests must have exactly one actor");
  db.query(`INSERT INTO module_requests (property_id,lease_id,tenant_id,request_type,title,status,created_by_tenant)
    VALUES ($propertyId,$leaseId,$tenantId,'bed_change','Move bed','submitted',$tenantId)`)
    .run({ propertyId: hostelProperty, leaseId, tenantId });

  rejects(() => db.query("INSERT INTO permission_grants (user_id,property_id,permission,allowed,granted_by) VALUES ($userId,$propertyId,'housekeeping.manage',1,$ownerId)")
    .run({ userId: staffId, propertyId: hostelProperty, ownerId }), "Property permission grants must remain inside assigned properties");
  db.query("INSERT INTO user_properties (user_id,property_id) VALUES ($userId,$propertyId)").run({ userId: staffId, propertyId: hostelProperty });
  db.query("INSERT INTO permission_grants (user_id,property_id,permission,allowed,granted_by) VALUES ($userId,$propertyId,'housekeeping.manage',1,$ownerId)")
    .run({ userId: staffId, propertyId: hostelProperty, ownerId });
  db.query("INSERT INTO permission_grants (user_id,property_id,permission,allowed,granted_by) VALUES ($userId,NULL,'reports.view',1,$ownerId)")
    .run({ userId: staffId, ownerId });
  rejects(() => db.query("INSERT INTO permission_grants (user_id,property_id,permission,allowed,granted_by) VALUES ($userId,NULL,'reports.view',0,$ownerId)")
    .run({ userId: staffId, ownerId }), "Global permission grants must be unique despite NULL property scope");

  const unassignedStaff = Number(db.query("INSERT INTO users (name,email,password_hash,role) VALUES ('Unassigned','unassigned@example.com','test','staff')").run().lastInsertRowid);
  rejects(() => db.query(`INSERT INTO housekeeping_tasks (property_id,unit_id,task_type,status,assigned_to,created_by)
    VALUES ($propertyId,$unitId,'turnover','open',$assignedTo,$ownerId)`)
    .run({ propertyId: hostelProperty, unitId, assignedTo: unassignedStaff, ownerId }), "Housekeeping assignees must have property access");
  db.query(`INSERT INTO housekeeping_tasks (property_id,unit_id,task_type,status,assigned_to,created_by)
    VALUES ($propertyId,$unitId,'turnover','open',$assignedTo,$ownerId)`)
    .run({ propertyId: hostelProperty, unitId, assignedTo: staffId, ownerId });

  db.query(`INSERT INTO bulk_jobs (property_id,job_type,period,idempotency_key,status,created_by)
    VALUES ($propertyId,'service_billing','2026-08','service-billing:test','completed',$ownerId)`)
    .run({ propertyId: hostelProperty, ownerId });
  rejects(() => db.query(`INSERT INTO bulk_jobs (property_id,job_type,period,idempotency_key,status,created_by)
    VALUES ($propertyId,'service_billing','2026-08','service-billing:test','running',$ownerId)`)
    .run({ propertyId: hostelProperty, ownerId }), "Bulk jobs must enforce idempotency keys");

  const requiredTriggers = [
    "trg_properties_module_reset_defaults", "trg_hostel_reservation_overlap_insert", "trg_hostel_reservation_overlap_update",
    "trg_hostel_reservation_allocation_insert", "trg_space_allocation_reservation_insert", "trg_permission_grant_scope_insert"
  ];
  for (const name of requiredTriggers) assert(Boolean(db.query("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=$name").get({ name })), `Missing trigger ${name}`);

  const legacy = new Database(":memory:", { strict: true });
  legacy.exec(`CREATE TABLE property_operating_configs (
    property_id INTEGER PRIMARY KEY,module_id TEXT NOT NULL,settings_json TEXT NOT NULL DEFAULT '{}',configured_by INTEGER,
    configured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  legacy.exec(schema);
  applyMigrations(legacy);
  applyReleaseMigrations(legacy);
  const legacyColumns = legacy.query("PRAGMA table_info(property_operating_configs)").all().map((column) => column.name);
  assert(legacyColumns.includes("is_customized"), "Legacy operating configuration migration did not add is_customized");
  legacy.close();

  console.log("Vertical profiles, requests, permissions, housekeeping, property reconfiguration, reservation intervals, allocation conflicts, bulk idempotency, and legacy migration verified.");
} finally {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) { try { fs.unlinkSync(filename + suffix); } catch {} }
}
