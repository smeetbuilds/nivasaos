function hasColumn(database, table, column) {
  return database.query(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
}

function assertNoRow(database, sql, message) {
  if (database.query(sql).get()) throw new Error(`NivasaOS 1.0 migration blocked: ${message}`);
}

const triggers = [
  "trg_properties_module_reset_defaults",
  "trg_operating_config_relationship_insert", "trg_operating_config_relationship_update",
  "trg_vertical_profile_relationship_insert", "trg_vertical_profile_relationship_update",
  "trg_module_request_relationship_insert", "trg_module_request_relationship_update",
  "trg_module_request_actor_insert", "trg_module_request_actor_update",
  "trg_hostel_reservation_relationship_insert", "trg_hostel_reservation_relationship_update",
  "trg_hostel_reservation_overlap_insert", "trg_hostel_reservation_overlap_update",
  "trg_hostel_reservation_allocation_insert", "trg_hostel_reservation_allocation_update",
  "trg_space_allocation_reservation_insert", "trg_space_allocation_reservation_update",
  "trg_housekeeping_relationship_insert", "trg_housekeeping_relationship_update",
  "trg_permission_grant_scope_insert", "trg_permission_grant_scope_update"
];

function preflight(database) {
  assertNoRow(database, `SELECT 1 FROM property_operating_configs poc JOIN properties p ON p.id=poc.property_id WHERE poc.module_id!=p.module_id LIMIT 1`, "an operating configuration does not match its property module");
  assertNoRow(database, `SELECT 1 FROM resident_vertical_profiles rvp LEFT JOIN tenants t ON t.id=rvp.tenant_id LEFT JOIN properties p ON p.id=t.property_id WHERE t.id IS NULL OR rvp.property_id!=t.property_id OR rvp.module_id!=p.module_id LIMIT 1`, "a vertical profile has an invalid tenant, property, or module relationship");
  assertNoRow(database, `SELECT 1 FROM module_requests mr LEFT JOIN tenants t ON t.id=mr.tenant_id LEFT JOIN leases l ON l.id=mr.lease_id WHERE t.id IS NULL OR t.property_id!=mr.property_id OR (mr.lease_id IS NOT NULL AND (l.property_id!=mr.property_id OR NOT EXISTS (SELECT 1 FROM lease_tenants lt WHERE lt.lease_id=mr.lease_id AND lt.tenant_id=mr.tenant_id))) OR ((mr.created_by_user IS NULL)=(mr.created_by_tenant IS NULL)) LIMIT 1`, "a module request has an invalid relationship or actor");
  assertNoRow(database, `SELECT 1 FROM hostel_reservations hr LEFT JOIN properties p ON p.id=hr.property_id LEFT JOIN units u ON u.id=hr.unit_id LEFT JOIN rentable_spaces rs ON rs.id=hr.space_id LEFT JOIN tenants t ON t.id=hr.tenant_id WHERE p.id IS NULL OR p.module_id!='hostel' OR (hr.unit_id IS NOT NULL AND (u.id IS NULL OR u.property_id!=hr.property_id)) OR (hr.space_id IS NOT NULL AND (hr.unit_id IS NULL OR rs.id IS NULL OR rs.property_id!=hr.property_id OR rs.unit_id!=hr.unit_id)) OR (hr.tenant_id IS NOT NULL AND (t.id IS NULL OR t.property_id!=hr.property_id)) LIMIT 1`, "a hostel reservation has an invalid property, room, bed, or tenant relationship");
  assertNoRow(database, `SELECT 1 FROM hostel_reservations a JOIN hostel_reservations b ON a.id<b.id AND a.space_id=b.space_id WHERE a.space_id IS NOT NULL AND a.status IN ('reserved','checked_in') AND b.status IN ('reserved','checked_in') AND a.arrival_date<b.departure_date AND a.departure_date>b.arrival_date LIMIT 1`, "existing hostel reservations overlap for the same bed");
  assertNoRow(database, `SELECT 1 FROM hostel_reservations hr JOIN space_allocations sa ON sa.space_id=hr.space_id WHERE hr.status IN ('reserved','checked_in') AND sa.status='active' AND hr.arrival_date<COALESCE(sa.end_date,'9999-12-31') AND hr.departure_date>sa.start_date LIMIT 1`, "an active reservation overlaps a resident allocation");
  assertNoRow(database, `SELECT 1 FROM housekeeping_tasks ht LEFT JOIN properties p ON p.id=ht.property_id LEFT JOIN units u ON u.id=ht.unit_id LEFT JOIN rentable_spaces rs ON rs.id=ht.space_id LEFT JOIN hostel_reservations hr ON hr.id=ht.reservation_id LEFT JOIN users assignee ON assignee.id=ht.assigned_to WHERE p.id IS NULL OR p.module_id NOT IN ('hostel','pg_coliving','student_housing','staff_housing') OR (ht.unit_id IS NOT NULL AND (u.id IS NULL OR u.property_id!=ht.property_id)) OR (ht.space_id IS NOT NULL AND (ht.unit_id IS NULL OR rs.id IS NULL OR rs.property_id!=ht.property_id OR rs.unit_id!=ht.unit_id)) OR (ht.reservation_id IS NOT NULL AND (hr.id IS NULL OR hr.property_id!=ht.property_id OR (ht.unit_id IS NOT NULL AND hr.unit_id!=ht.unit_id) OR (ht.space_id IS NOT NULL AND hr.space_id!=ht.space_id))) OR (ht.assigned_to IS NOT NULL AND (assignee.id IS NULL OR assignee.status!='active' OR (assignee.role!='owner' AND NOT EXISTS (SELECT 1 FROM user_properties up WHERE up.user_id=assignee.id AND up.property_id=ht.property_id)))) LIMIT 1`, "a housekeeping task has an invalid relationship or assignee");
  assertNoRow(database, `SELECT 1 FROM permission_grants pg JOIN users u ON u.id=pg.user_id WHERE pg.property_id IS NOT NULL AND u.role!='owner' AND NOT EXISTS (SELECT 1 FROM user_properties up WHERE up.user_id=pg.user_id AND up.property_id=pg.property_id) LIMIT 1`, "a property permission exceeds the user's property assignment");
  assertNoRow(database, `SELECT 1 FROM permission_grants WHERE property_id IS NULL GROUP BY user_id,permission HAVING COUNT(*)>1 LIMIT 1`, "duplicate global permission grants require manual review");
}

const integritySql = `
DROP INDEX IF EXISTS idx_reservation_active_space_overlap_guard;
CREATE INDEX IF NOT EXISTS idx_hostel_reservation_space_window ON hostel_reservations(space_id,status,arrival_date,departure_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_permission_grants_global_unique ON permission_grants(user_id,permission) WHERE property_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_permission_grants_property_unique ON permission_grants(user_id,property_id,permission) WHERE property_id IS NOT NULL;

CREATE TRIGGER trg_properties_module_reset_defaults
AFTER UPDATE OF module_id ON properties
WHEN OLD.module_id!=NEW.module_id
BEGIN
  UPDATE property_operating_configs
  SET module_id=NEW.module_id,
      settings_json=COALESCE((SELECT settings_json FROM workspace_modules WHERE module_id=NEW.module_id),'{}'),
      is_customized=0,configured_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
  WHERE property_id=NEW.id;
END;

CREATE TRIGGER trg_operating_config_relationship_insert BEFORE INSERT ON property_operating_configs
WHEN NOT EXISTS (SELECT 1 FROM properties WHERE id=NEW.property_id AND module_id=NEW.module_id)
BEGIN SELECT RAISE(ABORT,'operating configuration property and module mismatch'); END;
CREATE TRIGGER trg_operating_config_relationship_update BEFORE UPDATE OF property_id,module_id ON property_operating_configs
WHEN NOT EXISTS (SELECT 1 FROM properties WHERE id=NEW.property_id AND module_id=NEW.module_id)
BEGIN SELECT RAISE(ABORT,'operating configuration property and module mismatch'); END;

CREATE TRIGGER trg_vertical_profile_relationship_insert BEFORE INSERT ON resident_vertical_profiles
WHEN NOT EXISTS (SELECT 1 FROM tenants t JOIN properties p ON p.id=t.property_id WHERE t.id=NEW.tenant_id AND t.property_id=NEW.property_id AND p.module_id=NEW.module_id)
BEGIN SELECT RAISE(ABORT,'vertical profile relationship mismatch'); END;
CREATE TRIGGER trg_vertical_profile_relationship_update BEFORE UPDATE OF tenant_id,property_id,module_id ON resident_vertical_profiles
WHEN NOT EXISTS (SELECT 1 FROM tenants t JOIN properties p ON p.id=t.property_id WHERE t.id=NEW.tenant_id AND t.property_id=NEW.property_id AND p.module_id=NEW.module_id)
BEGIN SELECT RAISE(ABORT,'vertical profile relationship mismatch'); END;

CREATE TRIGGER trg_module_request_relationship_insert BEFORE INSERT ON module_requests
WHEN NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id=NEW.tenant_id AND t.property_id=NEW.property_id AND (NEW.lease_id IS NULL OR EXISTS (SELECT 1 FROM leases l JOIN lease_tenants lt ON lt.lease_id=l.id WHERE l.id=NEW.lease_id AND l.property_id=NEW.property_id AND lt.tenant_id=NEW.tenant_id)))
BEGIN SELECT RAISE(ABORT,'module request relationship mismatch'); END;
CREATE TRIGGER trg_module_request_relationship_update BEFORE UPDATE OF property_id,lease_id,tenant_id ON module_requests
WHEN NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id=NEW.tenant_id AND t.property_id=NEW.property_id AND (NEW.lease_id IS NULL OR EXISTS (SELECT 1 FROM leases l JOIN lease_tenants lt ON lt.lease_id=l.id WHERE l.id=NEW.lease_id AND l.property_id=NEW.property_id AND lt.tenant_id=NEW.tenant_id)))
BEGIN SELECT RAISE(ABORT,'module request relationship mismatch'); END;
CREATE TRIGGER trg_module_request_actor_insert BEFORE INSERT ON module_requests
WHEN (NEW.created_by_user IS NULL)=(NEW.created_by_tenant IS NULL)
BEGIN SELECT RAISE(ABORT,'module request requires exactly one actor'); END;
CREATE TRIGGER trg_module_request_actor_update BEFORE UPDATE OF created_by_user,created_by_tenant ON module_requests
WHEN (NEW.created_by_user IS NULL)=(NEW.created_by_tenant IS NULL)
BEGIN SELECT RAISE(ABORT,'module request requires exactly one actor'); END;

CREATE TRIGGER trg_hostel_reservation_relationship_insert BEFORE INSERT ON hostel_reservations
WHEN NOT EXISTS (SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.module_id='hostel' AND (NEW.unit_id IS NULL OR EXISTS (SELECT 1 FROM units u WHERE u.id=NEW.unit_id AND u.property_id=NEW.property_id)) AND (NEW.space_id IS NULL OR EXISTS (SELECT 1 FROM rentable_spaces rs WHERE rs.id=NEW.space_id AND rs.property_id=NEW.property_id AND NEW.unit_id IS NOT NULL AND rs.unit_id=NEW.unit_id)) AND (NEW.tenant_id IS NULL OR EXISTS (SELECT 1 FROM tenants t WHERE t.id=NEW.tenant_id AND t.property_id=NEW.property_id)))
BEGIN SELECT RAISE(ABORT,'hostel reservation relationship mismatch'); END;
CREATE TRIGGER trg_hostel_reservation_relationship_update BEFORE UPDATE OF property_id,unit_id,space_id,tenant_id ON hostel_reservations
WHEN NOT EXISTS (SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.module_id='hostel' AND (NEW.unit_id IS NULL OR EXISTS (SELECT 1 FROM units u WHERE u.id=NEW.unit_id AND u.property_id=NEW.property_id)) AND (NEW.space_id IS NULL OR EXISTS (SELECT 1 FROM rentable_spaces rs WHERE rs.id=NEW.space_id AND rs.property_id=NEW.property_id AND NEW.unit_id IS NOT NULL AND rs.unit_id=NEW.unit_id)) AND (NEW.tenant_id IS NULL OR EXISTS (SELECT 1 FROM tenants t WHERE t.id=NEW.tenant_id AND t.property_id=NEW.property_id)))
BEGIN SELECT RAISE(ABORT,'hostel reservation relationship mismatch'); END;
CREATE TRIGGER trg_hostel_reservation_overlap_insert BEFORE INSERT ON hostel_reservations
WHEN NEW.space_id IS NOT NULL AND NEW.status IN ('reserved','checked_in') AND EXISTS (SELECT 1 FROM hostel_reservations hr WHERE hr.space_id=NEW.space_id AND hr.status IN ('reserved','checked_in') AND NEW.arrival_date<hr.departure_date AND NEW.departure_date>hr.arrival_date)
BEGIN SELECT RAISE(ABORT,'hostel reservation overlaps active reservation'); END;
CREATE TRIGGER trg_hostel_reservation_overlap_update BEFORE UPDATE OF space_id,arrival_date,departure_date,status ON hostel_reservations
WHEN NEW.space_id IS NOT NULL AND NEW.status IN ('reserved','checked_in') AND EXISTS (SELECT 1 FROM hostel_reservations hr WHERE hr.id!=OLD.id AND hr.space_id=NEW.space_id AND hr.status IN ('reserved','checked_in') AND NEW.arrival_date<hr.departure_date AND NEW.departure_date>hr.arrival_date)
BEGIN SELECT RAISE(ABORT,'hostel reservation overlaps active reservation'); END;
CREATE TRIGGER trg_hostel_reservation_allocation_insert BEFORE INSERT ON hostel_reservations
WHEN NEW.space_id IS NOT NULL AND NEW.status IN ('reserved','checked_in') AND EXISTS (SELECT 1 FROM space_allocations sa WHERE sa.space_id=NEW.space_id AND sa.status='active' AND NEW.arrival_date<COALESCE(sa.end_date,'9999-12-31') AND NEW.departure_date>sa.start_date)
BEGIN SELECT RAISE(ABORT,'hostel reservation overlaps active allocation'); END;
CREATE TRIGGER trg_hostel_reservation_allocation_update BEFORE UPDATE OF space_id,arrival_date,departure_date,status ON hostel_reservations
WHEN NEW.space_id IS NOT NULL AND NEW.status IN ('reserved','checked_in') AND EXISTS (SELECT 1 FROM space_allocations sa WHERE sa.space_id=NEW.space_id AND sa.status='active' AND NEW.arrival_date<COALESCE(sa.end_date,'9999-12-31') AND NEW.departure_date>sa.start_date)
BEGIN SELECT RAISE(ABORT,'hostel reservation overlaps active allocation'); END;
CREATE TRIGGER trg_space_allocation_reservation_insert BEFORE INSERT ON space_allocations
WHEN NEW.status='active' AND EXISTS (SELECT 1 FROM hostel_reservations hr WHERE hr.space_id=NEW.space_id AND hr.status IN ('reserved','checked_in') AND NEW.start_date<hr.departure_date AND COALESCE(NEW.end_date,'9999-12-31')>hr.arrival_date)
BEGIN SELECT RAISE(ABORT,'space allocation overlaps active reservation'); END;
CREATE TRIGGER trg_space_allocation_reservation_update BEFORE UPDATE OF space_id,start_date,end_date,status ON space_allocations
WHEN NEW.status='active' AND EXISTS (SELECT 1 FROM hostel_reservations hr WHERE hr.space_id=NEW.space_id AND hr.status IN ('reserved','checked_in') AND NEW.start_date<hr.departure_date AND COALESCE(NEW.end_date,'9999-12-31')>hr.arrival_date)
BEGIN SELECT RAISE(ABORT,'space allocation overlaps active reservation'); END;

CREATE TRIGGER trg_housekeeping_relationship_insert BEFORE INSERT ON housekeeping_tasks
WHEN NOT EXISTS (SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.module_id IN ('hostel','pg_coliving','student_housing','staff_housing') AND (NEW.unit_id IS NULL OR EXISTS (SELECT 1 FROM units u WHERE u.id=NEW.unit_id AND u.property_id=NEW.property_id)) AND (NEW.space_id IS NULL OR EXISTS (SELECT 1 FROM rentable_spaces rs WHERE rs.id=NEW.space_id AND rs.property_id=NEW.property_id AND NEW.unit_id IS NOT NULL AND rs.unit_id=NEW.unit_id)) AND (NEW.reservation_id IS NULL OR EXISTS (SELECT 1 FROM hostel_reservations hr WHERE hr.id=NEW.reservation_id AND hr.property_id=NEW.property_id AND (NEW.unit_id IS NULL OR hr.unit_id=NEW.unit_id) AND (NEW.space_id IS NULL OR hr.space_id=NEW.space_id))) AND (NEW.assigned_to IS NULL OR EXISTS (SELECT 1 FROM users u WHERE u.id=NEW.assigned_to AND u.status='active' AND (u.role='owner' OR EXISTS (SELECT 1 FROM user_properties up WHERE up.user_id=u.id AND up.property_id=NEW.property_id)))))
BEGIN SELECT RAISE(ABORT,'housekeeping relationship mismatch'); END;
CREATE TRIGGER trg_housekeeping_relationship_update BEFORE UPDATE OF property_id,unit_id,space_id,reservation_id,assigned_to ON housekeeping_tasks
WHEN NOT EXISTS (SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.module_id IN ('hostel','pg_coliving','student_housing','staff_housing') AND (NEW.unit_id IS NULL OR EXISTS (SELECT 1 FROM units u WHERE u.id=NEW.unit_id AND u.property_id=NEW.property_id)) AND (NEW.space_id IS NULL OR EXISTS (SELECT 1 FROM rentable_spaces rs WHERE rs.id=NEW.space_id AND rs.property_id=NEW.property_id AND NEW.unit_id IS NOT NULL AND rs.unit_id=NEW.unit_id)) AND (NEW.reservation_id IS NULL OR EXISTS (SELECT 1 FROM hostel_reservations hr WHERE hr.id=NEW.reservation_id AND hr.property_id=NEW.property_id AND (NEW.unit_id IS NULL OR hr.unit_id=NEW.unit_id) AND (NEW.space_id IS NULL OR hr.space_id=NEW.space_id))) AND (NEW.assigned_to IS NULL OR EXISTS (SELECT 1 FROM users u WHERE u.id=NEW.assigned_to AND u.status='active' AND (u.role='owner' OR EXISTS (SELECT 1 FROM user_properties up WHERE up.user_id=u.id AND up.property_id=NEW.property_id)))))
BEGIN SELECT RAISE(ABORT,'housekeeping relationship mismatch'); END;

CREATE TRIGGER trg_permission_grant_scope_insert BEFORE INSERT ON permission_grants
WHEN NEW.property_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=NEW.user_id AND (u.role='owner' OR EXISTS (SELECT 1 FROM user_properties up WHERE up.user_id=NEW.user_id AND up.property_id=NEW.property_id)))
BEGIN SELECT RAISE(ABORT,'permission grant exceeds property assignment'); END;
CREATE TRIGGER trg_permission_grant_scope_update BEFORE UPDATE OF user_id,property_id ON permission_grants
WHEN NEW.property_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=NEW.user_id AND (u.role='owner' OR EXISTS (SELECT 1 FROM user_properties up WHERE up.user_id=NEW.user_id AND up.property_id=NEW.property_id)))
BEGIN SELECT RAISE(ABORT,'permission grant exceeds property assignment'); END;
`;

export function applyReleaseMigrations(database) {
  database.transaction(() => {
    if (!hasColumn(database, "property_operating_configs", "is_customized")) {
      database.exec("ALTER TABLE property_operating_configs ADD COLUMN is_customized INTEGER NOT NULL DEFAULT 0 CHECK(is_customized IN (0,1))");
      database.exec(`UPDATE property_operating_configs SET is_customized=1
        WHERE updated_at!=configured_at OR settings_json!=COALESCE((SELECT settings_json FROM workspace_modules wm WHERE wm.module_id=property_operating_configs.module_id),'{}')`);
    }
    preflight(database);
    database.exec("DROP TRIGGER IF EXISTS trg_properties_module_activity_lock");
    for (const name of triggers) database.exec(`DROP TRIGGER IF EXISTS ${name}`);
    database.exec(`CREATE TRIGGER trg_properties_module_activity_lock BEFORE UPDATE OF module_id ON properties
      WHEN OLD.module_id!=NEW.module_id AND (
        EXISTS (SELECT 1 FROM units WHERE property_id=OLD.id) OR EXISTS (SELECT 1 FROM tenants WHERE property_id=OLD.id) OR
        EXISTS (SELECT 1 FROM leases WHERE property_id=OLD.id) OR EXISTS (SELECT 1 FROM invoices WHERE property_id=OLD.id) OR
        EXISTS (SELECT 1 FROM payments WHERE property_id=OLD.id) OR EXISTS (SELECT 1 FROM deposit_transactions WHERE property_id=OLD.id) OR
        EXISTS (SELECT 1 FROM maintenance_tickets WHERE property_id=OLD.id) OR EXISTS (SELECT 1 FROM billing_policies WHERE property_id=OLD.id) OR
        EXISTS (SELECT 1 FROM property_module_settings WHERE property_id=OLD.id) OR EXISTS (SELECT 1 FROM service_catalog WHERE property_id=OLD.id) OR
        EXISTS (SELECT 1 FROM visitor_entries WHERE property_id=OLD.id) OR EXISTS (SELECT 1 FROM property_inspections WHERE property_id=OLD.id) OR
        EXISTS (SELECT 1 FROM lease_documents WHERE property_id=OLD.id) OR EXISTS (SELECT 1 FROM lease_key_transactions WHERE property_id=OLD.id) OR
        EXISTS (SELECT 1 FROM notification_log WHERE property_id=OLD.id) OR
        EXISTS (SELECT 1 FROM property_operating_configs WHERE property_id=OLD.id AND is_customized=1) OR
        EXISTS (SELECT 1 FROM resident_vertical_profiles WHERE property_id=OLD.id) OR EXISTS (SELECT 1 FROM module_requests WHERE property_id=OLD.id) OR
        EXISTS (SELECT 1 FROM hostel_reservations WHERE property_id=OLD.id) OR EXISTS (SELECT 1 FROM housekeeping_tasks WHERE property_id=OLD.id) OR
        EXISTS (SELECT 1 FROM bulk_jobs WHERE property_id=OLD.id)
      ) BEGIN SELECT RAISE(ABORT,'property module is locked after configuration or activity'); END;`);
    database.exec(integritySql);
    database.exec("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('schema_release','1.0.0',CURRENT_TIMESTAMP)");
  })();
}
