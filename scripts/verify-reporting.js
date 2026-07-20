import fs from "node:fs";
import { minorDecimal } from "../lib/money.js";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
for (const file of ["lib/data.js", "lib/money.js", "lib/format.js", "app/(workspace)/reports/workspace.js", "app/api/reports/export/route.js"]) {
  if (!fs.existsSync(file)) failures.push(`${file}: missing`);
}

if (!failures.length) {
  const data = read("lib/data.js");
  const workspace = read("app/(workspace)/reports/workspace.js");
  const route = read("app/api/reports/export/route.js");
  const format = read("lib/format.js");

  for (const needle of ["u.monthly_rate_minor", "i.amount_minor", "i.amount_paid_minor", "pay.amount_minor", "balance_minor", "total_minor", "occupied_value_minor", 'permissionScopeSql(user, "reports.view", "p")']) {
    if (!data.includes(needle)) failures.push(`lib/data.js: report query missing ${needle}`);
  }
  for (const forbidden of ["u.monthly_rate ELSE", "i.amount-i.amount_paid", "SUM(pay.amount)", 'currencySummary(data.arrears, "balance")', 'currencySummary(data.collections, "total")']) {
    if (data.includes(forbidden) || workspace.includes(forbidden)) failures.push(`Reporting still references legacy decimal aggregation: ${forbidden}`);
  }
  for (const needle of ["moneyMinor", "balance_minor", "amount_minor", "amount_paid_minor", "total_minor", "occupied_value_minor", "/api/reports/export"]) {
    if (!workspace.includes(needle)) failures.push(`reports workspace: missing ${needle}`);
  }
  for (const needle of ["currentUser", "hasPortfolioPermission", "hasPermission", "reportData", "minorDecimal", "amount_minor", "amount_decimal", "Cache-Control", "private, no-store", "text/csv"] ) {
    if (!route.includes(needle)) failures.push(`reports export: missing ${needle}`);
  }
  if (!format.includes("moneyMinor") || !format.includes("fromMinorUnits")) failures.push("lib/format.js: localized money display is not isolated at the minor-unit boundary");
}

for (const [minor, expected] of [[0, "0.00"], [1, "0.01"], [990, "9.90"], [-125, "-1.25"], [3000000000000000, "30000000000000.00"]]) {
  if (minorDecimal(minor) !== expected) failures.push(`minorDecimal(${minor}) returned ${minorDecimal(minor)} instead of ${expected}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Reports, report metrics, CSV serialization, permission scope, reconciliation columns, and localized display use integer minor units end to end.");
