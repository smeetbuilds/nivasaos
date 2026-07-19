const MINOR_SCALE = 100n;
const MAX_SAFE_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

function decimalText(value, label) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${label} must be a valid amount`);
    if (Number.isInteger(value)) return String(value);
    const source = value.toString();
    if (!/[eE]/.test(source)) return source;
    return value.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
  }
  const source = String(value ?? "").trim();
  if (!source) throw new Error(`${label} must be a valid amount`);
  return source;
}

export function toMinorUnits(value, label = "Amount") {
  const source = decimalText(value, label);
  const match = source.match(/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error(`${label} must use no more than two decimal places`);
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fraction = BigInt((match[3] || "").padEnd(2, "0") || "0");
  const minor = sign * (whole * MINOR_SCALE + fraction);
  if (minor > MAX_SAFE_MINOR || minor < -MAX_SAFE_MINOR) throw new Error(`${label} exceeds the supported monetary range`);
  return Number(minor);
}

export function fromMinorUnits(value) {
  const minor = Number(value);
  if (!Number.isSafeInteger(minor)) throw new Error("Minor-unit amount is invalid");
  return minor / Number(MINOR_SCALE);
}

export function normalizedMoney(value, label = "Amount") {
  return fromMinorUnits(toMinorUnits(value, label));
}

export function moneyInput(formData, key, { label = "Amount", fallback = null, minMinor = null, maxMinor = null } = {}) {
  const raw = formData.get(key);
  const value = raw === null || raw === "" ? fallback : String(raw).trim();
  if (value === null || value === undefined || value === "") throw new Error(`${label} is required`);
  const minor = toMinorUnits(value, label);
  if (minMinor !== null && minor < minMinor) throw new Error(`${label} is below the allowed minimum`);
  if (maxMinor !== null && minor > maxMinor) throw new Error(`${label} exceeds the allowed maximum`);
  return { minor, value: fromMinorUnits(minor) };
}
