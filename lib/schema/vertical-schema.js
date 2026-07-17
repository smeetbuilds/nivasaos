export const verticalSchema = `
CREATE TABLE IF NOT EXISTS property_operating_configs (
  property_id INTEGER PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  configured_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  configured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resident_vertical_profiles (
  tenant_id INTEGER PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  external_id TEXT,
  organisation TEXT,
  department TEXT,
  programme TEXT,
  level_or_designation TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  guardian_email TEXT,
  sponsor_name TEXT,
  sponsor_reference TEXT,
  payroll_recovery REAL NOT NULL DEFAULT 0 CHECK(payroll_recovery >= 0),
  employer_paid_amount REAL NOT NULL DEFAULT 0 CHECK(employer_paid_amount >= 0),
  curfew_time TEXT,
  eligibility_end_date TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS module_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id INTEGER REFERENCES leases(id) ON DELETE SET NULL,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  starts_at TEXT,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('draft','submitted','approved','rejected','cancelled','completed')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  resolution_note TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_by_user INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_tenant INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(NOT(created_by_user IS NOT NULL AND created_by_tenant IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS hostel_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  space_id INTEGER REFERENCES rentable_spaces(id) ON DELETE SET NULL,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  reference TEXT NOT NULL UNIQUE,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_phone TEXT,
  identity_reference TEXT,
  source TEXT NOT NULL DEFAULT 'direct',
  arrival_date TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  adults INTEGER NOT NULL DEFAULT 1 CHECK(adults > 0),
  nightly_rate REAL NOT NULL DEFAULT 0 CHECK(nightly_rate >= 0),
  tax_amount REAL NOT NULL DEFAULT 0 CHECK(tax_amount >= 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','checked_in','checked_out','cancelled','no_show')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(departure_date > arrival_date)
);

CREATE TABLE IF NOT EXISTS housekeeping_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  space_id INTEGER REFERENCES rentable_spaces(id) ON DELETE SET NULL,
  reservation_id INTEGER REFERENCES hostel_reservations(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL DEFAULT 'turnover',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','blocked','completed','cancelled')),
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  completed_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permission_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1 CHECK(allowed IN (0,1)),
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,property_id,permission)
);

CREATE TABLE IF NOT EXISTS bulk_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  period TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','running','completed','failed','cancelled')),
  input_json TEXT NOT NULL DEFAULT '{}',
  preview_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  error_text TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_vertical_profiles_property ON resident_vertical_profiles(property_id,module_id);
CREATE INDEX IF NOT EXISTS idx_module_requests_property_status ON module_requests(property_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_module_requests_tenant ON module_requests(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hostel_reservation_dates ON hostel_reservations(property_id,arrival_date,departure_date,status);
CREATE INDEX IF NOT EXISTS idx_housekeeping_due ON housekeeping_tasks(property_id,status,due_at);
CREATE INDEX IF NOT EXISTS idx_permission_grants_user ON permission_grants(user_id,property_id,permission);
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_property ON bulk_jobs(property_id,job_type,created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_active_space_overlap_guard
ON hostel_reservations(space_id,arrival_date,departure_date)
WHERE space_id IS NOT NULL AND status IN ('reserved','checked_in');
`;
