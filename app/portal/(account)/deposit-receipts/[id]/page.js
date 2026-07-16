import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant-auth";
import { get } from "@/lib/db";
import { dateLabel, money } from "@/lib/format";
import PrintReceiptButton from "@/components/PrintReceiptButton";

export const metadata = { title: "Deposit receipt" };

export default async function DepositReceiptPage({ params }) {
  const tenant = await requireTenant();
  const { id } = await params;
  const item = get(
    `SELECT dt.*,p.name property_name,p.address,p.city,p.country,p.currency,l.reference lease_reference,l.deposit lease_deposit,
      u.name unit_name,rec.name recorder_name,attributed.full_name attributed_tenant_name,attributed.email attributed_tenant_email
     FROM deposit_transactions dt
     JOIN leases l ON l.id=dt.lease_id
     JOIN lease_tenants lt ON lt.lease_id=l.id
     JOIN properties p ON p.id=dt.property_id
     JOIN units u ON u.id=l.unit_id
     LEFT JOIN users rec ON rec.id=dt.recorded_by
     LEFT JOIN tenants attributed ON attributed.id=dt.tenant_id
     WHERE dt.id=$transactionId AND lt.tenant_id=$tenantId`,
    { transactionId: Number(id), tenantId: tenant.tenant_id }
  );
  if (!item) notFound();
  const company = get("SELECT value FROM settings WHERE key='company_name'")?.value || item.property_name;
  const outgoing = ["refund", "debit"].includes(item.transaction_type);
  return <article className="receipt-page">
    <div className="receipt-toolbar"><a href="/portal/lease" className="button secondary">Back to deposit ledger</a><span className="table-actions">{item.proof_path && (!item.tenant_id || item.tenant_id === tenant.tenant_id) && <a href={`/portal/proofs/deposits/${item.id}`} target="_blank" className="button secondary">View proof</a>}<PrintReceiptButton/></span></div>
    <section className="receipt-document">
      <header><div><span className="receipt-brand">{company}</span><h1>Deposit {outgoing ? "refund" : "receipt"}</h1><p>Refundable deposit ledger record</p></div><div className="receipt-number"><span>Reference</span><strong>{item.reference}</strong></div></header>
      <div className={`receipt-paid${outgoing ? " receipt-outgoing" : ""}`}><span>{outgoing ? "Amount returned / deducted" : "Amount received / credited"}</span><strong>{money(item.amount, item.currency)}</strong><small>{dateLabel(item.transacted_at)}</small></div>
      <div className="receipt-grid"><span><small>Attributed to</small><strong>{item.attributed_tenant_name || "All residents on lease"}</strong><p>{item.attributed_tenant_email || "Lease-level deposit movement"}</p></span><span><small>Lease</small><strong>{item.lease_reference}</strong><p>{item.property_name} · {item.unit_name}</p></span><span><small>Transaction type</small><strong>{item.transaction_type.replaceAll("_", " ")}</strong><p>{item.method.replaceAll("_", " ")}</p></span><span><small>Lease deposit requirement</small><strong>{money(item.lease_deposit, item.currency)}</strong><p>{item.notes || "No additional note"}</p></span></div>
      <div className="receipt-confirmation"><strong>Deposit ledger updated</strong><p>This document records one movement in the refundable deposit ledger. The current held balance is calculated from all received, credited, refunded, and debited entries.</p></div>
      <footer><span>Recorded by {item.recorder_name || "Property team"}</span><span>Built by Aahav Labs · aahavlabs.in</span></footer>
    </section>
  </article>;
}
