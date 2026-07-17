function nonNegativeAmount(value, fallback, label) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative number`);
  return parsed;
}

export function allocatedSpaceTotals(spaces = []) {
  return spaces.reduce(
    (totals, space) => ({
      monthlyRent: totals.monthlyRent + Number(space.monthly_rate || 0),
      deposit: totals.deposit + Number(space.deposit || 0)
    }),
    { monthlyRent: 0, deposit: 0 }
  );
}

export function resolveAgreementPricing({ spaces = [], unitRate = 0, unitDeposit = 0, requestedRent = "", requestedDeposit = "" }) {
  const spaceTotals = allocatedSpaceTotals(spaces);
  const derivedRent = spaces.length ? spaceTotals.monthlyRent : Number(unitRate || 0);
  const derivedDeposit = spaces.length ? spaceTotals.deposit : Number(unitDeposit || 0);
  return {
    monthlyRent: nonNegativeAmount(requestedRent, derivedRent, "Monthly rent"),
    deposit: nonNegativeAmount(requestedDeposit, derivedDeposit, "Deposit"),
    source: spaces.length ? "allocated_spaces" : "unit"
  };
}
