import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant-auth";
import { get } from "@/lib/db";
import { dateLabel, money } from "@/lib/format";
import PrintReceiptButton from "@/components/PrintReceiptButton";

export const metadata = { title: "Payment receipt" };

export default async function PaymentReceiptPage({ params }) {
  const tenant = await requireTenant();
  const { id } = await params;
  const payment = get(
    `SELECT pay.*,p.name property_name,p.address,p.city,p.country,p.currency,i.number invoice_number,i.description invoice_description,
      l.reference lease_reference,u.name unit_name,rec.name recorder_name,payer.full_name payer_name,payer.email payer_email
     FROM payments pay
     JOIN properties p ON p.id=pay.property_id
     LEFT JOIN invoices i ON i.id=pay.invoice_id
     LEFT JOIN leases l ON l.id=i.lease_id
     LEFT JOIN units u ON u.id=l.unit_id
     LEFT JOIN users rec ON rec.id=pay.recorded_by
     LEFT JOIN tenants payer ON payer.id=pay.tenant_id
     WHERE pay.id=$paymentId AND (
       pay.tenant_id=$tenantId OR EXISTS (
         SELECT 1 FROM invoices access_i JOIN lease_tenants access_lt ON access_lt.lease_id=access_i.lease_id
         WHERE access_i.id=pay.invoice_id AND access_lt.tenant_id=$tenantId
       )
     )`,
    { paymentId: Number(id), tenantId: tenant.tenant_id }
  );
  if (!payment) notFound();
  const company = get("SELECT value FROM settings WHERE key='company_name'")?.value || payment.property_name;
  return <article className="receipt-page">
    <div className="receipt-toolbar"><a href="/portal/billing" className="button secondary">Back to billing</a><span className="table-actions">{payment.proof_path && payment.tenant_id === tenant.tenant_id && <a href={`/portal/proofs/payments/${payment.id}`} target="_blank" className="button secondary">View proof</a>}<PrintReceiptButton/></span></div>
    <section className="receipt-document">
      <header><div><span className="receipt-brand">{company}</span><h1>Payment receipt</h1><p>Official payment record from NivasaOS</p></div><div className="receipt-number"><span>Receipt</span><strong>{payment.reference}</strong></div></header>
      <div className="receipt-paid"><span>Amount received</span><strong>{money(payment.amount, payment.currency)}</strong><small>Paid on {dateLabel(payment.paid_at)}</small></div>
      <div className="receipt-grid"><span><small>Paid by</small><strong>{payment.payer_name || tenant.full_name}</strong><p>{payment.payer_email || tenant.account_email}</p></span><span><small>Property</small><strong>{payment.property_name}</strong><p>{[payment.address, payment.city, payment.country].filter(Boolean).join(", ")}</p></span><span><small>Payment method</small><strong>{payment.method.replaceAll("_", " ")}</strong><p>{payment.notes || "No additional note"}</p></span><span><small>Applied to</small><strong>{payment.invoice_number || "Unallocated payment"}</strong><p>{payment.invoice_description || payment.lease_reference || "General account payment"}{payment.unit_name ? ` · ${payment.unit_name}` : ""}</p></span></div>
      <div className="receipt-confirmation"><strong>Payment recorded</strong><p>This receipt confirms the amount entered in the property ledger. It does not replace statutory tax documentation where local law requires another document.</p></div>
      <footer><span>Recorded by {payment.recorder_name || "Property team"}</span><span>Built by Aahav Labs · aahavlabs.in</span></footer>
    </section>
  </article>;
}
