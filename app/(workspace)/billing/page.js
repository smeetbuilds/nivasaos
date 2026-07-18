import Link from "next/link";
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
import Icon from "@/components/Icon";

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
  const filters = {
    q: String(query?.q || "").trim().toLowerCase(),
    rule: ["active", "disabled"].includes(String(query?.rule || "")) ? String(query?.rule || "") : ""
  };
  const filteredPolicies = policies.filter((policy) => {
    const haystack = `${policy.name} ${policy.currency} ${policyDescription(policy)}`.toLowerCase();
    const ruleMatches = !filters.rule || (filters.rule === "active" ? policy.late_fee_type !== "none" : policy.late_fee_type === "none");
    return (!filters.q || haystack.includes(filters.q)) && ruleMatches;
  });

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Collection governance" title="Grace periods & late fees" description="Define transparent property-level collection rules, preview eligible rent invoices, and preserve one active late fee per source invoice." actions={<><Link href="/invoices" className="button secondary"><Icon name="invoice" size={17}/>Invoices</Link><OpenModalButton target="late-fee-run-modal" icon="billing">Apply eligible fees</OpenModalButton></>}/>

    <section className="metric-grid finance-summary-grid" aria-label="Billing policy summary">
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="property"/></div><span>Properties configured</span><strong>{configured}</strong><small>of {policies.length} permitted properties</small></article>
      <article className="metric-card compact-metric risk"><div className="metric-icon"><Icon name="invoice"/></div><span>Eligible rent invoices</span><strong>{summary.count}</strong><small>Past due beyond configured grace</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="billing"/></div><span>Fees in preview</span><strong>{feeTotal}</strong><small>{feeDetail}</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="report"/></div><span>Duplicate protection</span><strong>1 per invoice</strong><small>Voided fees can be generated later</small></article>
    </section>

    {policies.length > 0 && <form className="panel finance-toolbar policy-finance-toolbar" method="get" aria-label="Filter billing policies">
      <div className="finance-toolbar-copy"><span className="eyebrow">Policy register</span><strong>Property billing rules</strong><small>{filteredPolicies.length} of {policies.length} policies shown</small></div>
      <div className="finance-filter-grid policy-filter-grid">
        <label className="finance-search-field"><span>Search</span><input type="search" name="q" defaultValue={query?.q || ""} placeholder="Property, currency, or rule"/></label>
        <label><span>Rule state</span><select name="rule" defaultValue={filters.rule}><option value="">All rules</option><option value="active">Late fee active</option><option value="disabled">Late fee disabled</option></select></label>
        <div className="finance-filter-actions"><button className="button secondary" type="submit">Apply</button><Link href="/billing" className="text-link">Reset</Link></div>
      </div>
    </form>}

    {filteredPolicies.length ? <section className="policy-grid finance-policy-grid">{filteredPolicies.map((policy) => <article className="panel policy-card finance-policy-card" key={policy.id}>
      <div className="panel-head"><div><span className="eyebrow">{policy.currency} · {policy.status} property</span><h2>{policy.name}</h2></div><Badge tone={policy.late_fee_type === "none" ? "inactive" : "active"}>{policy.late_fee_type === "none" ? "Disabled" : "Active"}</Badge></div>
      <div className="policy-body">
        <div className="finance-policy-facts"><span><small>Grace period</small><strong>{policy.grace_days} day{Number(policy.grace_days) === 1 ? "" : "s"}</strong></span><span><small>Fee rule</small><strong>{policyDescription(policy)}</strong></span></div>
        <p>Fees apply only to unpaid rent invoices after the grace period ends. Existing active fee invoices are skipped automatically.</p>
        <OpenModalButton target={`billing-policy-${policy.id}`} icon="edit" className="button secondary">Edit policy</OpenModalButton>
      </div>
    </article>)}</section> : policies.length ? <Empty icon="billing" title="No billing policies match these filters" text="Adjust the search or rule-state filter to view more properties."/> : <Empty icon="billing" title="No properties available" text="Add a property before defining collection policies."/>}

    <section className="panel billing-preview finance-preview-panel"><div className="panel-head"><div><span className="eyebrow">Dry-run preview</span><h2>Rent invoices eligible today</h2></div><Badge tone={summary.count ? "overdue" : "paid"}>{summary.count ? `${summary.count} ready` : "Nothing due"}</Badge></div>{summary.rows.length ? <div className="table-wrap"><table className="finance-table"><thead><tr><th>Rent invoice</th><th>Person / unit</th><th>Property</th><th>Due</th><th>Grace ended</th><th>Balance</th><th>Fee to create</th></tr></thead><tbody>{summary.rows.map((row) => <tr key={row.id}><td><strong>{row.number}</strong><small>{row.lease_reference || "No agreement reference"}</small></td><td><strong>{row.tenant_name || "Unassigned"}</strong><small>{row.unit_name || "No unit"}</small></td><td>{row.property_name}</td><td>{dateLabel(row.due_date)}</td><td>{dateLabel(row.grace_ends)}</td><td>{money(row.balance, row.currency)}</td><td><strong className="finance-balance">{money(row.fee_amount, row.currency)}</strong><small>{row.late_fee_type === "percent" ? `${Number(row.late_fee_value)}% rule` : "Flat fee"}</small></td></tr>)}</tbody></table></div> : <Empty icon="billing" title="No late fees to apply" text="Enable a property policy or wait until an unpaid rent invoice passes its grace period."/>}</section>

    {policies.map((policy) => <form action={updateBillingPolicyAction} key={`policy-${policy.id}`}><ModalForm id={`billing-policy-${policy.id}`} title={`Billing policy · ${policy.name}`} description="Changes affect future fee runs only; existing invoices are never recalculated." submitLabel="Save policy" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="propertyId" value={policy.id}/><div className="summary-box"><span>Property currency</span><strong>{policy.currency}</strong><small>Flat fees and caps use this currency.</small></div><div className="field-grid two"><label><span>Grace period in days</span><input type="number" name="graceDays" min="0" max="60" defaultValue={policy.grace_days} required/><small>A fee becomes eligible the day after this period ends.</small></label><label><span>Late-fee type</span><select name="lateFeeType" defaultValue={policy.late_fee_type}><option value="none">Disabled</option><option value="flat">Flat amount</option><option value="percent">Percentage of outstanding rent</option></select></label></div><div className="field-grid two"><label><span>Fee value</span><input type="number" name="lateFeeValue" min="0" step="0.01" defaultValue={policy.late_fee_value}/><small>Enter the property-currency amount or percentage.</small></label><label><span>Optional cap</span><input type="number" name="lateFeeCap" min="0" step="0.01" defaultValue={policy.late_fee_cap || ""}/><small>Leave blank for no maximum.</small></label></div><div className="policy-warning">Use only rules permitted by the tenancy and consumer laws that apply to this property.</div></div></ModalForm></form>)}
    <form action={createLateFeeRunAction}><ModalForm id="late-fee-run-modal" title="Apply eligible late fees" description="The preview above is recalculated at submission. Each source rent invoice can have only one active late-fee invoice." submitLabel="Generate late fees" pendingLabel="Generating…"><div className="modal-body"><div className="rent-run-notice"><span className="metric-icon">{summary.count}</span><div><strong>{summary.count} invoice{summary.count === 1 ? " is" : "s are"} currently eligible</strong><span>{feeDetail}</span></div></div><label><span>Property scope</span><select name="propertyId"><option value="">All permitted properties</option>{policies.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label><label><span>Fee issue and due date</span><input type="date" name="issueDate" defaultValue={today()} required/></label><div className="policy-warning">This creates separate receivable invoices. It does not alter the original rent amount or payment history.</div></div></ModalForm></form>
  </>;
}
