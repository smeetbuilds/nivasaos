const MINOR_SCALE = 100;

export function toMinorUnits(value, label = "Amount") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${label} must be a valid amount`);
  const scaled = numeric * MINOR_SCALE;
  const minor = Math.round(scaled);
  if (!Number.isSafeInteger(minor) || Math.abs(scaled - minor) > 1e-7) {
    throw new Error(`${label} must use no more than two decimal places`);
  }
  return minor;
}

export function fromMinorUnits(value) {
  const minor = Number(value);
  if (!Number.isSafeInteger(minor)) throw new Error("Minor-unit amount is invalid");
  return minor / MINOR_SCALE;
}

export function normalizedMoney(value, label = "Amount") {
  return fromMinorUnits(toMinorUnits(value, label));
}

export function moneyInput(formData, key, { label = "Amount", fallback = null, minMinor = null, maxMinor = null } = {}) {
  const raw = formData.get(key);
  const value = raw === null || raw === "" ? fallback : String(raw).trim();
  if (value === null || value === undefined || value === "") throw new Error(`${label} is required`);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(String(value))) throw new Error(`${label} must use no more than two decimal places`);
  const minor = toMinorUnits(value, label);
  if (minMinor !== null && minor < minMinor) throw new Error(`${label} is below the allowed minimum`);
  if (maxMinor !== null && minor > maxMinor) throw new Error(`${label} exceeds the allowed maximum`);
  return { minor, value: fromMinorUnits(minor) };
}
