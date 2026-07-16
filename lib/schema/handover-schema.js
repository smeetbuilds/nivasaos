export const handoverSchema = `
CREATE TABLE IF NOT EXISTS property_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  reference TEXT NOT NULL UNIQUE,
  inspection_type TEXT NOT NULL CHECK(inspection_type IN ('move_in','periodic','move_out')),
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','shared','acknowledged','completed')),
  summary TEXT,
  electricity_meter TEXT,
  water_meter TEXT,
  gas_meter TEXT,
  shared_at TEXT,
  completed_at TEXT,
  deposit_transaction_id INTEGER UNIQUE REFERENCES deposit_transactions(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inspection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL REFERENCES property_inspections(id) ON DELETE CASCADE,
  area TEXT NOT NULL,
  item_name TEXT NOT NULL,
  condition TEXT NOT NULL CHECK(condition IN ('excellent','good','fair','damaged','missing','not_applicable')),
  notes TEXT,
  charge_amount REAL NOT NULL DEFAULT 0 CHECK(charge_amount >= 0),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inspection_acknowledgements (
  inspection_id INTEGER NOT NULL REFERENCES property_inspections(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  tenant_note TEXT,
  acknowledged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(inspection_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS lease_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  inspection_id INTEGER REFERENCES property_inspections(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK(document_type IN ('agreement','inventory','notice','inspection','handover','receipt','other')),
  visibility TEXT NOT NULL DEFAULT 'tenant' CHECK(visibility IN ('tenant','internal')),
  file_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK(file_size > 0),
  notes TEXT,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lease_key_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  reference TEXT NOT NULL UNIQUE,
  key_type TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  action TEXT NOT NULL CHECK(action IN ('issued','returned','lost','replaced')),
  transacted_at TEXT NOT NULL,
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inspections_lease_status ON property_inspections(lease_id, status, scheduled_for DESC);
CREATE INDEX IF NOT EXISTS idx_inspection_items_inspection ON inspection_items(inspection_id, area, id);
CREATE INDEX IF NOT EXISTS idx_inspection_ack_tenant ON inspection_acknowledgements(tenant_id, acknowledged_at DESC);
CREATE INDEX IF NOT EXISTS idx_lease_documents_lease ON lease_documents(lease_id, visibility, archived_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_key_transactions_lease ON lease_key_transactions(lease_id, transacted_at DESC, id DESC);
`;
