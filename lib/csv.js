const FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/;

export function csvCell(value) {
  const raw = String(value ?? "");
  const safe = typeof value === "string" && FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function csvRow(values) {
  return values.map(csvCell).join(",");
}
