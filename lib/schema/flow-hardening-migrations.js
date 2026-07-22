function rejectRow(database, sql, message) {
  if (database.query(sql).get()) throw new Error(`NivasaOS flow-hardening migration blocked: ${message}`);
}

export function applyFlowHardeningMigrations(database) {
  database.transaction(() => {
    rejectRow(
      database,
      `SELECT 1
       FROM leases l
       LEFT JOIN properties p ON p.id=l.property_id
       LEFT JOIN units u ON u.id=l.unit_id
       WHERE p.id IS NULL OR u.id IS NULL OR u.property_id!=l.property_id
       LIMIT 1`,
      "an agreement has an invalid property or unit relationship"
    );
    rejectRow(
      database,
      `SELECT 1
       FROM leases a
       JOIN leases b ON a.id<b.id AND a.unit_id=b.unit_id
       JOIN properties p ON p.id=a.property_id
       WHERE p.module_id IN ('residential','commercial')
         AND a.status='active' AND b.status='active'
       LIMIT 1`,
      "a residential or commercial unit has multiple active agreements"
    );
    rejectRow(
      database,
      `SELECT 1
       FROM leases l
       JOIN properties p ON p.id=l.property_id
       JOIN units u ON u.id=l.unit_id
       WHERE p.module_id IN ('residential','commercial')
         AND l.status='active'
         AND u.status IN ('maintenance','inactive')
       LIMIT 1`,
      "an active residential or commercial agreement uses unavailable inventory"
    );

    database.exec(`
      UPDATE units
      SET status='occupied',updated_at=CURRENT_TIMESTAMP
      WHERE status='available'
        AND EXISTS (
          SELECT 1
          FROM leases l
          JOIN properties p ON p.id=l.property_id
          WHERE l.unit_id=units.id
            AND l.status='active'
            AND p.module_id IN ('residential','commercial')
        );

      DROP TRIGGER IF EXISTS trg_lease_relationship_insert;
      DROP TRIGGER IF EXISTS trg_lease_relationship_update;
      DROP TRIGGER IF EXISTS trg_single_unit_active_lease_insert;
      DROP TRIGGER IF EXISTS trg_single_unit_active_lease_update;
      DROP TRIGGER IF EXISTS trg_active_lease_unit_status_insert;
      DROP TRIGGER IF EXISTS trg_active_lease_unit_status_update;
      DROP TRIGGER IF EXISTS trg_unit_active_lease_status;

      CREATE TRIGGER trg_lease_relationship_insert
      BEFORE INSERT ON leases
      WHEN NOT EXISTS (
        SELECT 1 FROM units u
        WHERE u.id=NEW.unit_id AND u.property_id=NEW.property_id
      )
      BEGIN SELECT RAISE(ABORT,'agreement property and unit mismatch'); END;

      CREATE TRIGGER trg_lease_relationship_update
      BEFORE UPDATE OF property_id,unit_id ON leases
      WHEN NOT EXISTS (
        SELECT 1 FROM units u
        WHERE u.id=NEW.unit_id AND u.property_id=NEW.property_id
      )
      BEGIN SELECT RAISE(ABORT,'agreement property and unit mismatch'); END;

      CREATE TRIGGER trg_single_unit_active_lease_insert
      BEFORE INSERT ON leases
      WHEN NEW.status='active'
        AND EXISTS (
          SELECT 1 FROM properties p
          WHERE p.id=NEW.property_id
            AND p.module_id IN ('residential','commercial')
        )
        AND EXISTS (
          SELECT 1 FROM leases l
          WHERE l.unit_id=NEW.unit_id AND l.status='active'
        )
      BEGIN SELECT RAISE(ABORT,'unit already has an active agreement'); END;

      CREATE TRIGGER trg_single_unit_active_lease_update
      BEFORE UPDATE OF property_id,unit_id,status ON leases
      WHEN NEW.status='active'
        AND EXISTS (
          SELECT 1 FROM properties p
          WHERE p.id=NEW.property_id
            AND p.module_id IN ('residential','commercial')
        )
        AND EXISTS (
          SELECT 1 FROM leases l
          WHERE l.id!=OLD.id
            AND l.unit_id=NEW.unit_id
            AND l.status='active'
        )
      BEGIN SELECT RAISE(ABORT,'unit already has an active agreement'); END;

      CREATE TRIGGER trg_active_lease_unit_status_insert
      BEFORE INSERT ON leases
      WHEN NEW.status='active'
        AND EXISTS (
          SELECT 1 FROM properties p
          WHERE p.id=NEW.property_id
            AND p.module_id IN ('residential','commercial')
        )
        AND NOT EXISTS (
          SELECT 1 FROM units u
          WHERE u.id=NEW.unit_id
            AND u.property_id=NEW.property_id
            AND u.status='occupied'
        )
      BEGIN SELECT RAISE(ABORT,'active agreement requires occupied inventory'); END;

      CREATE TRIGGER trg_active_lease_unit_status_update
      BEFORE UPDATE OF property_id,unit_id,status ON leases
      WHEN NEW.status='active'
        AND EXISTS (
          SELECT 1 FROM properties p
          WHERE p.id=NEW.property_id
            AND p.module_id IN ('residential','commercial')
        )
        AND NOT EXISTS (
          SELECT 1 FROM units u
          WHERE u.id=NEW.unit_id
            AND u.property_id=NEW.property_id
            AND u.status='occupied'
        )
      BEGIN SELECT RAISE(ABORT,'active agreement requires occupied inventory'); END;

      CREATE TRIGGER trg_unit_active_lease_status
      BEFORE UPDATE OF status ON units
      WHEN NEW.status!='occupied'
        AND EXISTS (
          SELECT 1
          FROM leases l
          JOIN properties p ON p.id=l.property_id
          WHERE l.unit_id=NEW.id
            AND l.status='active'
            AND p.module_id IN ('residential','commercial')
        )
      BEGIN SELECT RAISE(ABORT,'unit with an active agreement must remain occupied'); END;
    `);
  })();
}
