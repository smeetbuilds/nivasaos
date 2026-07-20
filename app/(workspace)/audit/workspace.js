import Link from "next/link";
import { requireUser, propertyScopeSql } from "@/lib/auth";
import { all } from "@/lib/db";
import { accessibleProperties } from "@/lib/data";
import { dateTimeLabel } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";

export const metadata = { title: "Audit log" };
const actions = ["all", "create", "update", "enable", "disable", "end", "record", "generate", "status", "settings", "security", "notify", "void"];

function metadataLabel(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed.fields)) return `Fields: ${parsed.fields.join(", ").replaceAll("_", " ")}`;
    if (parsed.count !== undefined) return `${parsed.count} record${Number(parsed.count) === 1 ? "" : "s"}`;
    if (Array.isArray(parsed.propertyIds)) return `${parsed.propertyIds.length} propert${parsed.propertyIds.length === 1 ? "y" : "ies"} assigned`;
    if (parsed.current && typeof parsed.current === "object") {
      const current = parsed.current;
      return `Grace: ${current.graceDays ?? 0} days · Type: ${String(current.type || "none").replaceAll("_", " ")} · Value: ${current.value ?? 0}${current.cap ? ` · Cap: ${current.cap}` : ""}`;
    }
    return Object.entries(parsed).slice(0, 3).map(([key, item]) => `${key.replaceAll("_", " ")}: ${Array.isArray(item) ? item.join(", ") : typeof item === "object" && item ? JSON.stringify(item) : item}`).join(" · ");
  } catch {
    return null;
  }
}

export default async function AuditPage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const query = await searchParams;
  const properties = accessibleProperties(user);
  const search = String(query?.search || "").trim().slice(0, 100);
  const action = actions.includes(String(query?.action || "all")) ? String(query?.action || "all") : "all";
  const propertyId = Number(query?.property || 0) || null;
  const filters = [user.role === "owner" ? "1=1" : `(a.property_id IS NOT NULL AND ${scope.clause})`];
  const params = { ...scope.params };
  if (search) {
    filters.push("(a.summary LIKE $search OR a.entity_type LIKE $search OR u.name LIKE $search OR u.email LIKE $search OR tenant_actor.full_name LIKE $search OR tenant_actor.email LIKE $search)");
    params.search = `%${search}%`;
  }
  if (action !== "all") {
    filters.push("a.action=$action");
    params.action = action;
  }
  if (propertyId) {
    filters.push("a.property_id=$propertyId");
    params.propertyId = propertyId;
  }
  const rows = all(
    `SELECT a.*,u.name actor_name,u.email actor_email,tenant_actor.full_name tenant_actor_name,tenant_actor.email tenant_actor_email,p.name property_name
     FROM audit_log a
     LEFT JOIN users u ON u.id=a.actor_user_id
     LEFT JOIN tenants tenant_actor ON tenant_actor.id=a.actor_tenant_id
     LEFT JOIN properties p ON p.id=a.property_id
     WHERE ${filters.join(" AND ")}
     ORDER BY a.created_at DESC,a.id DESC LIMIT 250`,
    params
  );

  return <>
    <PageHeader eyebrow="Accountability" title="Audit log" description="A permission-scoped operational history of staff and tenant-portal changes without storing passwords or proof contents."/>
    <form method="get" className="filter-bar audit-filter panel" aria-label="Filter audit log"><label className="filter-search"><span>Search</span><input name="search" defaultValue={search} placeholder="Actor, entity, or action summary"/></label><label><span>Property</span><select name="property" defaultValue={propertyId || ""}><option value="">All permitted properties</option>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label><label><span>Action</span><select name="action" defaultValue={action}>{actions.map((item) => <option value={item} key={item}>{item === "all" ? "All actions" : item.replaceAll("_", " ")}</option>)}</select></label><div className="filter-actions"><button className="button primary">Apply filters</button>{(search || propertyId || action !== "all") && <Link href="/audit" className="button secondary">Clear</Link>}</div></form>
    {rows.length ? <div className="panel"><div className="table-wrap"><table data-mobile-cards="audit"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Record</th><th>Property</th><th>Details</th></tr></thead><tbody>{rows.map((row) => { const detail = metadataLabel(row.metadata); const actorName = row.actor_name || row.tenant_actor_name || "Deleted actor"; const actorDetail = row.actor_email || row.tenant_actor_email || (row.actor_tenant_id ? "Tenant portal" : "System history"); return <tr key={row.id}><td data-label="Time">{dateTimeLabel(row.created_at)}</td><td data-label="Actor"><strong>{actorName}</strong><small>{actorDetail}{row.actor_tenant_id ? " · tenant portal" : ""}</small></td><td data-label="Action"><Badge tone={row.action}>{row.action}</Badge></td><td data-label="Record">{row.entity_type.replaceAll("_", " ")}<small>{row.entity_id ? `#${row.entity_id}` : "System"}</small></td><td data-label="Property">{row.property_name || "Portfolio-wide"}</td><td data-label="Details"><strong>{row.summary}</strong>{detail && <small>{detail}</small>}</td></tr>; })}</tbody></table></div></div> : <Empty icon="audit" title="No audit events match" text="Staff and resident portal changes will appear here as the property is operated."/>}
    {rows.length === 250 && <p className="result-limit">Showing the latest 250 matching events.</p>}
  </>;
}
