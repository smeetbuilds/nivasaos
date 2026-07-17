export const moduleSchema = `
CREATE TABLE IF NOT EXISTS workspace_modules (
  module_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  settings_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS property_module_settings (
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(property_id,key)
);

CREATE TABLE IF NOT EXISTS rentable_spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  space_type TEXT NOT NULL DEFAULT 'bed' CHECK(space_type IN ('bed','bunk','desk','parking','locker','other')),
  monthly_rate REAL NOT NULL DEFAULT 0 CHECK(monthly_rate >= 0),
  deposit REAL NOT NULL DEFAULT 0 CHECK(deposit >= 0),
  gender_policy TEXT NOT NULL DEFAULT 'any' CHECK(gender_policy IN ('any','male','female','family','custom')),
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','occupied','maintenance','inactive')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(unit_id,code)
);

CREATE TABLE IF NOT EXISTS space_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  space_id INTEGER NOT NULL REFERENCES rentable_spaces(id) ON DELETE RESTRICT,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended','cancelled')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  billing_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK(billing_frequency IN ('included','one_time','monthly','quarterly','annual')),
  amount REAL NOT NULL DEFAULT 0 CHECK(amount >= 0),
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(property_id,name)
);

CREATE TABLE IF NOT EXISTS lease_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  service_id INTEGER NOT NULL REFERENCES service_catalog(id) ON DELETE RESTRICT,
  custom_amount REAL CHECK(custom_amount IS NULL OR custom_amount >= 0),
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended','cancelled')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_billing_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES lease_services(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  invoice_id INTEGER NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE RESTRICT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subscription_id,period)
);

CREATE TABLE IF NOT EXISTS visitor_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id INTEGER REFERENCES leases(id) ON DELETE SET NULL,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  visitor_name TEXT NOT NULL,
  visitor_phone TEXT,
  relationship TEXT,
  purpose TEXT NOT NULL,
  id_reference TEXT,
  expected_at TEXT NOT NULL,
  expected_checkout TEXT,
  checked_in_at TEXT,
  checked_out_at TEXT,
  status TEXT NOT NULL DEFAULT 'expected' CHECK(status IN ('expected','checked_in','checked_out','cancelled')),
  notes TEXT,
  created_by_user INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_tenant INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(NOT(created_by_user IS NOT NULL AND created_by_tenant IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS commercial_lease_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id INTEGER NOT NULL UNIQUE REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  business_name TEXT NOT NULL,
  registration_number TEXT,
  tax_number TEXT,
  business_activity TEXT,
  common_area_charge REAL NOT NULL DEFAULT 0 CHECK(common_area_charge >= 0),
  escalation_percent REAL NOT NULL DEFAULT 0 CHECK(escalation_percent >= 0),
  escalation_date TEXT,
  fitout_end_date TEXT,
  notice_period_days INTEGER NOT NULL DEFAULT 30 CHECK(notice_period_days BETWEEN 0 AND 730),
  notes TEXT,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS trg_rentable_space_relationship
BEFORE INSERT ON rentable_spaces
WHEN NOT EXISTS (
  SELECT 1 FROM units u WHERE u.id=NEW.unit_id AND u.property_id=NEW.property_id
)
BEGIN
  SELECT RAISE(ABORT,'space unit and property mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_space_allocation_relationship
BEFORE INSERT ON space_allocations
WHEN NOT EXISTS (
  SELECT 1
  FROM rentable_spaces rs
  JOIN leases l ON l.id=NEW.lease_id
  JOIN lease_tenants lt ON lt.lease_id=l.id AND lt.tenant_id=NEW.tenant_id
  WHERE rs.id=NEW.space_id
    AND rs.property_id=NEW.property_id
    AND l.property_id=NEW.property_id
    AND l.unit_id=rs.unit_id
)
BEGIN
  SELECT RAISE(ABORT,'space allocation relationship mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_lease_service_relationship
BEFORE INSERT ON lease_services
WHEN NOT EXISTS (
  SELECT 1
  FROM service_catalog sc
  JOIN leases l ON l.id=NEW.lease_id
  WHERE sc.id=NEW.service_id
    AND sc.property_id=NEW.property_id
    AND l.property_id=NEW.property_id
    AND (NEW.tenant_id IS NULL OR EXISTS (
      SELECT 1 FROM lease_tenants lt WHERE lt.lease_id=l.id AND lt.tenant_id=NEW.tenant_id
    ))
)
BEGIN
  SELECT RAISE(ABORT,'service subscription relationship mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_visitor_relationship
BEFORE INSERT ON visitor_entries
WHEN NOT EXISTS (
  SELECT 1 FROM tenants t
  WHERE t.id=NEW.tenant_id
    AND t.property_id=NEW.property_id
    AND (NEW.lease_id IS NULL OR EXISTS (
      SELECT 1 FROM leases l
      JOIN lease_tenants lt ON lt.lease_id=l.id AND lt.tenant_id=NEW.tenant_id
      WHERE l.id=NEW.lease_id AND l.property_id=NEW.property_id
    ))
)
BEGIN
  SELECT RAISE(ABORT,'visitor relationship mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_visitor_creator_required
BEFORE INSERT ON visitor_entries
WHEN NEW.created_by_user IS NULL AND NEW.created_by_tenant IS NULL
BEGIN
  SELECT RAISE(ABORT,'visitor creator is required');
END;

CREATE TRIGGER IF NOT EXISTS trg_commercial_profile_relationship
BEFORE INSERT ON commercial_lease_profiles
WHEN NOT EXISTS (
  SELECT 1 FROM leases l
  WHERE l.id=NEW.lease_id
    AND l.property_id=NEW.property_id
    AND (NEW.tenant_id IS NULL OR EXISTS (
      SELECT 1 FROM lease_tenants lt WHERE lt.lease_id=l.id AND lt.tenant_id=NEW.tenant_id
    ))
)
BEGIN
  SELECT RAISE(ABORT,'commercial profile relationship mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_commercial_profile_tenant_update
BEFORE UPDATE OF tenant_id ON commercial_lease_profiles
WHEN NEW.tenant_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM lease_tenants lt WHERE lt.lease_id=NEW.lease_id AND lt.tenant_id=NEW.tenant_id
)
BEGIN
  SELECT RAISE(ABORT,'commercial profile tenant mismatch');
END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_space_allocation ON space_allocations(space_id) WHERE status='active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_tenant_space ON space_allocations(lease_id,tenant_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_spaces_property_unit ON rentable_spaces(property_id,unit_id,status);
CREATE INDEX IF NOT EXISTS idx_allocations_lease_tenant ON space_allocations(lease_id,tenant_id,status);
CREATE INDEX IF NOT EXISTS idx_services_property ON service_catalog(property_id,active,category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_lease_service ON lease_services(lease_id,service_id,COALESCE(tenant_id,0)) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_lease_services_active ON lease_services(property_id,lease_id,status);
CREATE INDEX IF NOT EXISTS idx_service_billing_period ON service_billing_runs(period,subscription_id);
CREATE INDEX IF NOT EXISTS idx_visitors_property_status ON visitor_entries(property_id,status,expected_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitors_tenant ON visitor_entries(tenant_id,expected_at DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_property ON commercial_lease_profiles(property_id,escalation_date);
`;