import { createLateFeeRunAction, updateBillingPolicyAction } from "@/app/actions";
import { all } from "@/lib/db";
import { lateFeeSummary } from "@/lib/billing";
import { dateLabel, money, today } from "@/lib/format";
import { permissionScopeSql, requirePortfolioPermission } from "@/lib/permissions";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";

export const metadata = { title: "Billing rules" };

function policyDescription(policy) {
  if (policy.late_fee_type === "none") return "Late fees disabled";
  const value = policy.late_fee_type === "percent" ? `${Number(policy.late_fee_value)}% of outstanding rent` : money(policy.late_fee_value, policy.currency);
  const cap = Number(policy.late_fee_cap || 0) > 0 ? ` · capped at ${money(policy.late_fee_cap, policy.currency)}` : "";
  return `${value}${cap}`;
}

export default async function BillingPage({ searchParams }) {
  const user = await requirePortfolioPermission("billing.manage");
  const query = await searchParams;
  const scope = permissionScopeSql(user, "billing.manage", "p");
  const policies = all(
    `SELECT p.id,p.name,p.currency,p.status,
      COALESCE(bp.grace_days,0) grace_days,
      COALESCE(bp.late_fee_type,'none') late_fee_type,
      COALESCE(bp.late_fee_value,0) late_fee_value,
      bp.late_fee_cap,bp.updated_at
     FROM properties p
     LEFT JOIN billing_policies bp ON bp.property_id=p.id
     WHERE ${scope.clause}
     ORDER BY p.name`,
    scope.params
  );
  const summary = lateFeeSummary(user);
  const configured = policies.filter((policy) => policy.late_fee_type !== "none").length;
  const feeTotal = summary.byCurrency.length === 0 ? money(0) : summary.byCurrency.length === 1 ? money(summary.byCurrency[0].amount, summary.byCurrency[0].currency) : `${summary.byCurrency.length} currencies`;
  const feeDetail = summary.byCurrency.length ? summary.byCurrency.map((row) => money(row.amount, row.currency)).join(" · ") : "No fees currently eligible";

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Collection policy" title="Grace periods & late fees" description="Define transparent property-level rules, preview eligible rent invoices, and generate each late fee at most once." actions={<OpenModalButton target="late-fee-run-modal" icon="billing">Apply eligible fees</OpenModalButton>}/>
    <section className="metric-grid billing-metrics"><article className="metric-card"><span>Properties configured</span><strong>{configured}</strong><small>of {policies.length} permitted properties</small></article><article className="metric-card risk"><span>Eligible rent invoices</span><strong>{summary.count}</strong><small>Past due beyond the configured grace period</small></article><article className="metric-card"><span>Fees in preview</span><strong>{feeTotal}</strong><small>{feeDetail}</small></article><article className="metric-card"><span>Duplicate protection</span><strong>1 per invoice</strong><small>Voided fees can be regenerated later</small></article></section>
    <section className="policy-grid">{policies.map((policy) => <article className="panel policy-card" key={policy.id}><div className="panel-head"><div><span className="eyebrow">{policy.currency} property</span><h2>{policy.name}</h2></div><Badge tone={policy.late_fee_type === "none" ? "inactive" : "active"}>{policy.late_fee_type === "none" ? "Disabled" : "Active"}</Badge></div><div className="policy-body"><div><span>Grace period</span><strong>{policy.grace_days} day{Number(policy.grace_days) === 1 ? "" : "s"}</strong></div><div><span>Late-fee rule</span><strong>{policyDescription(policy)}</strong></div><p>Fees apply only to unpaid rent invoices after the grace period ends. Existing active fees are skipped automatically.</p><OpenModalButton target={`billing-policy-${policy.id}`} icon="edit" className="button secondary">Edit policy</OpenModalButton></div></article>)}</section>
    <section className="panel billing-preview"><div className="panel-head"><div><span className="eyebrow">Dry-run preview</span><h2>Rent invoices eligible today</h2></div><Badge tone={summary.count ? "overdue" : "paid"}>{summary.count ? `${summary.count} ready` : "Nothing due"}</Badge></div>{summary.rows.length ? <div className="table-wrap"><table><thead><tr><th>Rent invoice</th><th>Tenant / unit</th><th>Property</th><th>Due</th><th>Grace ended</th><th>Balance</th><th>Fee to create</th></tr></thead><tbody>{summary.rows.map((row) => <tr key={row.id}><td><strong>{row.number}</strong><small>{row.lease_reference || "No lease reference"}</small></td><td>{row.tenant_name || "Unassigned"}<small>{row.unit_name || "—"}</small></td><td>{row.property_name}</td><td>{dateLabel(row.due_date)}</td><td>{dateLabel(row.grace_ends)}</td><td>{money(row.balance, row.currency)}</td><td><strong>{money(row.fee_amount, row.currency)}</strong><small>{row.late_fee_type === "percent" ? `${Number(row.late_fee_value)}% rule` : "Flat fee"}</small></td></tr>)}</tbody></table></div> : <Empty icon="billing" title="No late fees to apply" text="Enable a property policy or wait until an unpaid rent invoice passes its grace period."/>}</section>
    {policies.map((policy) => <form action={updateBillingPolicyAction} key={`policy-${policy.id}`}><ModalForm id={`billing-policy-${policy.id}`} title={`Billing policy · ${policy.name}`} description="Changes affect future fee runs only; existing invoices are never recalculated." submitLabel="Save policy" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="propertyId" value={policy.id}/><div className="summary-box"><span>Property currency</span><strong>{policy.currency}</strong><small>Flat fees and caps use this currency.</small></div><div className="field-grid two"><label><span>Grace period in days</span><input type="number" name="graceDays" min="0" max="60" defaultValue={policy.grace_days} required/><small>A fee becomes eligible the day after this period ends.</small></label><label><span>Late-fee type</span><select name="lateFeeType" defaultValue={policy.late_fee_type}><option value="none">Disabled</option><option value="flat">Flat amount</option><option value="percent">Percentage of outstanding rent</option></select></label></div><div className="field-grid two"><label><span>Fee value</span><input type="number" name="lateFeeValue" min="0" step="0.01" defaultValue={policy.late_fee_value}/><small>Enter the property-currency amount or percentage.</small></label><label><span>Optional cap</span><input type="number" name="lateFeeCap" min="0" step="0.01" defaultValue={policy.late_fee_cap || ""}/><small>Leave blank for no maximum.</small></label></div><div className="policy-warning">Use only rules permitted by the tenancy and consumer laws that apply to this property.</div></div></ModalForm></form>)}
    <form action={createLateFeeRunAction}><ModalForm id="late-fee-run-modal" title="Apply eligible late fees" description="The preview above is recalculated at submission. Each source rent invoice can have only one active late-fee invoice." submitLabel="Generate late fees" pendingLabel="Generating…"><div className="modal-body"><div className="rent-run-notice"><span className="metric-icon">{summary.count}</span><div><strong>{summary.count} invoice{summary.count === 1 ? " is" : "s are"} currently eligible</strong><span>{feeDetail}</span></div></div><label><span>Property scope</span><select name="propertyId"><option value="">All permitted properties</option>{policies.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label><label><span>Fee issue and due date</span><input type="date" name="issueDate" defaultValue={today()} required/></label><div className="policy-warning">This creates separate receivable invoices. It does not alter the original rent amount or payment history.</div></div></ModalForm></form>
  </>;
}
