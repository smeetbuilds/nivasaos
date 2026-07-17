import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { applyMigrations, schema } from "../lib/schema.js";
import { MODULE_CATALOG, normalizeModuleIds, supportsCapability } from "../lib/modules/catalog.js";

const filename = path.join(tmpdir(), `nivasaos-modules-${randomBytes(8).toString("hex")}.sqlite`);
const db = new Database(filename, { create: true, strict: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };

try {
  db.exec(schema);
  applyMigrations(db);

  assert(MODULE_CATALOG.length >= 6, "Expected at least six production operating models");
  for (const id of ["residential", "pg_coliving", "hostel", "student_housing", "staff_housing", "commercial"]) {
    assert(MODULE_CATALOG.some((module) => module.id === id), `Missing module ${id}`);
  }
  assert(supportsCapability("hostel", "spaceInventory"), "Hostel must support space inventory");
  assert(supportsCapability("pg_coliving", "visitorRegister"), "PG must support visitor control");
  assert(supportsCapability("commercial", "commercialProfiles"), "Commercial module must support commercial profiles");
  assert(!supportsCapability("residential", "spaceInventory"), "Residential rentals must not inherit bed inventory by default");
  assert(normalizeModuleIds(["hostel", "invalid", "residential"]).join(",") === "residential,hostel", "Module normalization must be allowlisted and deterministic");

  const ownerId = Number(db.query("INSERT INTO users (name,email,password_hash,role) VALUES ('Owner','owner@example.com','test','owner')").run().lastInsertRowid);
  for (const [index, module] of MODULE_CATALOG.entries()) {
    db.query("INSERT OR REPLACE INTO workspace_modules (module_id,enabled,sort_order) VALUES ($moduleId,1,$sortOrder)").run({ moduleId: module.id, sortOrder: index * 10 + 10 });
  }

  const propertyId = Number(db.query("INSERT INTO properties (name,type,module_id,address,city,currency) VALUES ('Shared House','boarding_house','pg_coliving','1 Test Road','Surat','INR')").run().lastInsertRowid);
  const unitId = Number(db.query("INSERT INTO units (property_id,name,unit_type,capacity,status) VALUES ($propertyId,'Room 101','Shared room',2,'occupied')").run({ propertyId }).lastInsertRowid);
  const tenantOne = Number(db.query("INSERT INTO tenants (property_id,full_name,email,phone,status) VALUES ($propertyId,'Resident One','one@example.com','910000000001','active')").run({ propertyId }).lastInsertRowid);
  const tenantTwo = Number(db.query("INSERT INTO tenants (property_id,full_name,email,phone,status) VALUES ($propertyId,'Resident Two','two@example.com','910000000002','active')").run({ propertyId }).lastInsertRowid);
  const leaseOne = Number(db.query("INSERT INTO leases (property_id,unit_id,reference,start_date,monthly_rent,deposit,billing_day,status) VALUES ($propertyId,$unitId,'LEASE-MOD-1','2026-07-01',7000,7000,1,'active')").run({ propertyId, unitId }).lastInsertRowid);
  const leaseTwo = Number(db.query("INSERT INTO leases (property_id,unit_id,reference,start_date,monthly_rent,deposit,billing_day,status) VALUES ($propertyId,$unitId,'LEASE-MOD-2','2026-07-01',7000,7000,1,'active')").run({ propertyId, unitId }).lastInsertRowid);
  db.query("INSERT INTO lease_tenants (lease_id,tenant_id,is_primary) VALUES ($leaseId,$tenantId,1)").run({ leaseId: leaseOne, tenantId: tenantOne });
  db.query("INSERT INTO lease_tenants (lease_id,tenant_id,is_primary) VALUES ($leaseId,$tenantId,1)").run({ leaseId: leaseTwo, tenantId: tenantTwo });
  const spaceOne = Number(db.query("INSERT INTO rentable_spaces (property_id,unit_id,code,space_type,status) VALUES ($propertyId,$unitId,'Bed A','bed','occupied')").run({ propertyId, unitId }).lastInsertRowid);
  const spaceTwo = Number(db.query("INSERT INTO rentable_spaces (property_id,unit_id,code,space_type,status) VALUES ($propertyId,$unitId,'Bed B','bed','occupied')").run({ propertyId, unitId }).lastInsertRowid);
  db.query("INSERT INTO space_allocations (property_id,space_id,lease_id,tenant_id,start_date,status,created_by) VALUES ($propertyId,$spaceId,$leaseId,$tenantId,'2026-07-01','active',$ownerId)").run({ propertyId, spaceId: spaceOne, leaseId: leaseOne, tenantId: tenantOne, ownerId });
  db.query("INSERT INTO space_allocations (property_id,space_id,lease_id,tenant_id,start_date,status,created_by) VALUES ($propertyId,$spaceId,$leaseId,$tenantId,'2026-07-01','active',$ownerId)").run({ propertyId, spaceId: spaceTwo, leaseId: leaseTwo, tenantId: tenantTwo, ownerId });
  let duplicateAllocationRejected = false;
  try {
    db.query("INSERT INTO space_allocations (property_id,space_id,lease_id,tenant_id,start_date,status) VALUES ($propertyId,$spaceId,$leaseId,$tenantId,'2026-07-02','active')").run({ propertyId, spaceId: spaceOne, leaseId: leaseTwo, tenantId: tenantTwo });
  } catch { duplicateAllocationRejected = true; }
  assert(duplicateAllocationRejected, "A space must not have two active allocations");

  const serviceId = Number(db.query("INSERT INTO service_catalog (property_id,name,category,billing_frequency,amount,active,created_by) VALUES ($propertyId,'Meal plan','meals','monthly',2500,1,$ownerId)").run({ propertyId, ownerId }).lastInsertRowid);
  const subscriptionId = Number(db.query("INSERT INTO lease_services (property_id,lease_id,tenant_id,service_id,start_date,status,created_by) VALUES ($propertyId,$leaseId,$tenantId,$serviceId,'2026-07-01','active',$ownerId)").run({ propertyId, leaseId: leaseOne, tenantId: tenantOne, serviceId, ownerId }).lastInsertRowid);
  const invoiceId = Number(db.query("INSERT INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,charge_type,status) VALUES ($propertyId,$leaseId,$tenantId,'INV-SVC-1','Meal plan · 2026-07','2026-07-01','2026-07-05',2500,'manual','issued')").run({ propertyId, leaseId: leaseOne, tenantId: tenantOne }).lastInsertRowid);
  db.query("INSERT INTO service_billing_runs (subscription_id,period,invoice_id,created_by) VALUES ($subscriptionId,'2026-07',$invoiceId,$ownerId)").run({ subscriptionId, invoiceId, ownerId });
  let duplicateServiceRunRejected = false;
  const invoiceTwo = Number(db.query("INSERT INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,charge_type,status) VALUES ($propertyId,$leaseId,$tenantId,'INV-SVC-2','Duplicate meal plan','2026-07-01','2026-07-05',2500,'manual','issued')").run({ propertyId, leaseId: leaseOne, tenantId: tenantOne }).lastInsertRowid);
  try { db.query("INSERT INTO service_billing_runs (subscription_id,period,invoice_id) VALUES ($subscriptionId,'2026-07',$invoiceTwo)").run({ subscriptionId, invoiceTwo }); } catch { duplicateServiceRunRejected = true; }
  assert(duplicateServiceRunRejected, "Service billing must be idempotent per subscription period");

  const visitorId = Number(db.query("INSERT INTO visitor_entries (property_id,lease_id,tenant_id,visitor_name,purpose,expected_at,status,created_by_tenant) VALUES ($propertyId,$leaseId,$tenantId,'Visitor One','Personal','2026-07-20T18:00','expected',$tenantId)").run({ propertyId, leaseId: leaseOne, tenantId: tenantOne }).lastInsertRowid);
  db.query("UPDATE visitor_entries SET status='checked_in',checked_in_at=CURRENT_TIMESTAMP WHERE id=$visitorId AND status='expected'").run({ visitorId });
  db.query("UPDATE visitor_entries SET status='checked_out',checked_out_at=CURRENT_TIMESTAMP WHERE id=$visitorId AND status='checked_in'").run({ visitorId });
  assert(db.query("SELECT status FROM visitor_entries WHERE id=$visitorId").get({ visitorId }).status === "checked_out", "Visitor lifecycle failed");

  const commercialProperty = Number(db.query("INSERT INTO properties (name,type,module_id,address,city,currency) VALUES ('Commerce One','rental','commercial','2 Test Road','Surat','INR')").run().lastInsertRowid);
  const commercialUnit = Number(db.query("INSERT INTO units (property_id,name,unit_type,capacity,status) VALUES ($propertyId,'Suite 1','Office',1,'occupied')").run({ propertyId: commercialProperty }).lastInsertRowid);
  const businessTenant = Number(db.query("INSERT INTO tenants (property_id,full_name,email,phone,status) VALUES ($propertyId,'Business Tenant','business@example.com','910000000003','active')").run({ propertyId: commercialProperty }).lastInsertRowid);
  const commercialLease = Number(db.query("INSERT INTO leases (property_id,unit_id,reference,start_date,monthly_rent,deposit,billing_day,status) VALUES ($propertyId,$unitId,'LEASE-COM-1','2026-07-01',50000,100000,1,'active')").run({ propertyId: commercialProperty, unitId: commercialUnit }).lastInsertRowid);
  db.query("INSERT INTO lease_tenants (lease_id,tenant_id,is_primary) VALUES ($leaseId,$tenantId,1)").run({ leaseId: commercialLease, tenantId: businessTenant });
  db.query("INSERT INTO commercial_lease_profiles (property_id,lease_id,tenant_id,business_name,common_area_charge,escalation_percent,notice_period_days,updated_by) VALUES ($propertyId,$leaseId,$tenantId,'Example Trading',5000,5,90,$ownerId)").run({ propertyId: commercialProperty, leaseId: commercialLease, tenantId: businessTenant, ownerId });
  assert(db.query("SELECT business_name FROM commercial_lease_profiles WHERE lease_id=$leaseId").get({ leaseId: commercialLease }).business_name === "Example Trading", "Commercial profile failed");

  for (const table of ["workspace_modules", "rentable_spaces", "space_allocations", "service_catalog", "lease_services", "service_billing_runs", "visitor_entries", "commercial_lease_profiles"]) {
    assert(Boolean(db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=$table").get({ table })), `${table} was not created`);
  }

  const legacy = new Database(":memory:", { strict: true });
  legacy.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'apartment',address TEXT NOT NULL,
      city TEXT,country TEXT NOT NULL DEFAULT 'India',currency TEXT NOT NULL DEFAULT 'INR',status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO properties (name,type,address) VALUES ('Legacy PG','boarding_house','Old Road');
  `);
  legacy.exec(schema);
  applyMigrations(legacy);
  const columns = legacy.query("PRAGMA table_info(properties)").all().map((column) => column.name);
  assert(columns.includes("module_id"), "Legacy properties did not receive module_id");
  assert(legacy.query("SELECT module_id FROM properties WHERE name='Legacy PG'").get().module_id === "pg_coliving", "Legacy boarding house mapping failed");
  assert(Boolean(legacy.query("SELECT 1 FROM workspace_modules WHERE module_id='pg_coliving' AND enabled=1").get()), "Legacy module was not enabled");
  legacy.close();

  const sourceFiles = [
    "lib/actions/auth.js", "lib/actions/modules.js", "lib/actions/properties.js", "lib/actions/leases.js",
    "lib/actions/spaces.js", "lib/actions/services.js", "lib/actions/visitors.js", "lib/actions/commercial.js",
    "lib/actions/handover.js", "lib/module-data.js", "components/AppShell.js", "components/TenantPortalShell.js",
    "components/InstallWizard.js", "app/(workspace)/visitors/page.js"
  ];
  const source = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  for (const contract of [
    "Select at least one operating module",
    "Cannot disable modules used by properties",
    "Operating module locks after property inventory or activity exists",
    "Not enough available spaces for the selected residents",
    "Space allocation conflict",
    "Reactivating this space would exceed unit capacity",
    "This service period was already billed",
    "Quarterly service period must use YYYY-Q1 to YYYY-Q4",
    "Annual service period must use YYYY",
    "Residents can pre-register expected visitors",
    "Ended leases cannot receive newly issued or replacement keys",
    "property_id IN (",
    "commercialProfiles"
  ]) assert(source.includes(contract), `Modular contract missing: ${contract}`);
  assert(!source.includes("p2.module_id=p.module_id AND rs.status"), "Module metrics must not use unscoped correlated portfolio counts");

  console.log("Modular onboarding, property models, space capacity, frequency-correct services, visitors, commercial profiles, tenant portals, and legacy migration verified.");
} finally {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) { try { fs.unlinkSync(filename + suffix); } catch {} }
}
