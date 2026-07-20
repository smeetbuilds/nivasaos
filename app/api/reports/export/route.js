import { currentUser } from "@/lib/auth";
import { reportData } from "@/lib/data";
import { hasPermission, hasPortfolioPermission } from "@/lib/permission-core";
import { minorDecimal } from "@/lib/money";

export const dynamic = "force-dynamic";

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function row(values) {
  return values.map(csvCell).join(",");
}

export async function GET(request) {
  const user = await currentUser();
  if (!user) return new Response("Authentication required", { status: 401 });
  if (!hasPortfolioPermission(user, "reports.view")) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const propertyId = Number(url.searchParams.get("property") || 0) || null;
  if (propertyId && !hasPermission(user, "reports.view", propertyId)) return new Response("Forbidden", { status: 403 });
  const data = reportData(user, propertyId);
  const lines = [
    row(["record_type", "period_or_due_date", "reference", "person", "property", "currency", "amount_decimal", "amount_minor", "secondary_decimal", "secondary_minor", "notes"]),
    ...data.occupancy.map((item) => row([
      "occupancy", data.businessToday, "", "", item.property_name, item.currency,
      minorDecimal(item.occupied_value_minor), item.occupied_value_minor, "", "",
      `${item.occupied || 0} occupied; ${item.available || 0} available; ${item.total_units || 0} total`
    ])),
    ...data.collections.map((item) => row([
      "collection", item.month, "", "", item.property_name, item.currency,
      minorDecimal(item.total_minor), item.total_minor, "", "", "Exact monthly collection total"
    ])),
    ...data.arrears.map((item) => row([
      "arrears", item.due_date, item.number, item.tenant_name || "Unassigned", item.property_name, item.currency,
      minorDecimal(item.balance_minor), item.balance_minor,
      minorDecimal(item.amount_minor), item.amount_minor,
      `Paid ${minorDecimal(item.amount_paid_minor)} (${item.amount_paid_minor} minor units)`
    ]))
  ];
  const filename = `nivasaos-report-${data.businessToday}${propertyId ? `-property-${propertyId}` : ""}.csv`;
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
