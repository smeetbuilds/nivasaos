export function normalizeRentPeriod(value) {
  const period = String(value || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("Select a valid rent period");
  return period;
}

export function rentPeriodBounds(period) {
  const normalized = normalizeRentPeriod(period);
  const [year, month] = normalized.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${normalized}-01`,
    end: `${normalized}-${String(lastDay).padStart(2, "0")}`
  };
}

export function rentDueDate(period, billingDay) {
  const day = Math.min(28, Math.max(1, Number(billingDay) || 1));
  return `${normalizeRentPeriod(period)}-${String(day).padStart(2, "0")}`;
}

export function rentPeriodLabel(period) {
  const normalized = normalizeRentPeriod(period);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${normalized}-01T00:00:00Z`));
}
