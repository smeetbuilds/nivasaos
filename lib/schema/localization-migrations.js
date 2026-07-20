export function applyLocalizationMigrations(database) {
  database.exec(`
    INSERT INTO settings (key,value,updated_at)
    SELECT 'timezone','UTC',CURRENT_TIMESTAMP
    WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key='timezone');
  `);
}
