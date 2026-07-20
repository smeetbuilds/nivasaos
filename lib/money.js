const MINOR_SCALE = 100n;
const NUMERIC_SCALE = Number(MINOR_SCALE);
const NUMERIC_NOISE_TOLERANCE = 1e-9;
export const MAX_MONEY_MINOR = 3_000_000_000_000_000;
const MAX_MONEY_MINOR_BIGINT = BigInt(MAX_MONEY_MINOR);

function numericToMinorUnits(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a valid amount`);
  const scaled = value * NUMERIC_SCALE;
  const minor = Math.round(scaled);
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_MONEY_MINOR) throw new Error(`${label} exceeds the supported monetary range`);
  if (Math.abs(scaled - minor) > NUMERIC_NOISE_TOLERANCE) throw new Error(`${label} must use no more than two decimal places`);
  return minor;
}

function textToMinorUnits(value, label) {
  const source = String(value ?? "").trim();
  if (!source) throw new Error(`${label} must be a valid amount`);
  const match = source.match(/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error(`${label} must use no more than two decimal places`);
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fraction = BigInt((match[3] || "").padEnd(2, "0") || "0");
  const minor = sign * (whole * MINOR_SCALE + fraction);
  if (minor > MAX_MONEY_MINOR_BIGINT || minor < -MAX_MONEY_MINOR_BIGINT) throw new Error(`${label} exceeds the supported monetary range`);
  return Number(minor);
}

export function toMinorUnits(value, label = "Amount") {
  return typeof value === "number" ? numericToMinorUnits(value, label) : textToMinorUnits(value, label);
}

export function fromMinorUnits(value) {
  const minor = Number(value);
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_MONEY_MINOR) throw new Error("Minor-unit amount is invalid");
  return minor / NUMERIC_SCALE;
}

export function minorDecimal(value) {
  const minor = Number(value || 0);
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_MONEY_MINOR) throw new Error("Minor-unit amount is invalid");
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  return `${sign}${Math.trunc(absolute / NUMERIC_SCALE)}.${String(absolute % NUMERIC_SCALE).padStart(2, "0")}`;
}

export function normalizedMoney(value, label = "Amount") {
  return fromMinorUnits(toMinorUnits(value, label));
}

export function moneyInput(formData, key, { label = "Amount", fallback = null, minMinor = null, maxMinor = MAX_MONEY_MINOR } = {}) {
  const raw = formData.get(key);
  const value = raw === null || raw === "" ? fallback : String(raw).trim();
  if (value === null || value === undefined || value === "") throw new Error(`${label} is required`);
  const minor = textToMinorUnits(value, label);
  if (minMinor !== null && minor < minMinor) throw new Error(`${label} is below the allowed minimum`);
  if (maxMinor !== null && minor > maxMinor) throw new Error(`${label} exceeds the allowed maximum`);
  return { minor, value: fromMinorUnits(minor) };
}
