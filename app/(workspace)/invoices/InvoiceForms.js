import { createInvoiceAction, createLateFeeRunAction, createRentRunAction } from "@/app/actions";
import { today } from "@/lib/format";
import ModalForm from "@/components/ModalForm";
import StatefulForm from "@/components/StatefulForm";
import Icon from "@/components/Icon";

export default function InvoiceForms({ workspace, lateFeeDetail }) {
  const { properties, leases, tenants, currentPeriod, rentRunStatus, lateFees, canManageBilling } = workspace;
  if (!canManageBilling) return null;
  return <>
    <StatefulForm action={createInvoiceAction}><ModalForm id="invoice-modal" title="Create an invoice" description="Linking a lease and tenant is recommended for collection, reporting, and reminders." submitLabel="Issue invoice" pendingLabel="Issuing…"><div className="modal-body">
      <label><span>Property</span><select name="propertyId" required>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
      <div className="field-grid two"><label><span>Lease (optional)</span><select name="leaseId"><option value="">No lease</option>{leases.map((lease) => <option key={lease.id} value={lease.id}>{lease.property_name} · {lease.unit_name} · {lease.reference}</option>)}</select></label><label><span>Tenant</span><select name="tenantId"><option value="">Unassigned</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.property_name} · {tenant.full_name}</option>)}</select></label></div>
      <label><span>Description</span><input name="description" required placeholder="Utilities, repairs, or another charge"/></label>
      <div className="field-grid three"><label><span>Issue date</span><input type="date" name="issueDate" defaultValue={today()}/></label><label><span>Due date</span><input type="date" name="dueDate" required/></label><label><span>Amount</span><input type="number" min="0.01" step="0.01" name="amount" required/></label></div>
    </div></ModalForm></StatefulForm>

    <StatefulForm action={createRentRunAction}><ModalForm id="rent-run-modal" title="Run monthly rent billing" description="NivasaOS creates only missing invoices inside your billing permission scope." submitLabel="Generate rent invoices" pendingLabel="Generating…"><div className="modal-body">
      <div className="rent-run-notice"><Icon name="invoice" size={20}/><div><strong>Idempotent by lease and month</strong><span>Existing non-void rent invoices are skipped automatically. Manual and late-fee invoices are not affected.</span></div></div>
      <label><span>Property scope</span><select name="propertyId"><option value="">All permitted properties</option>{properties.filter((property) => property.status === "active").map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
      <div className="field-grid two"><label><span>Rent period</span><input type="month" name="period" defaultValue={currentPeriod} required/></label><label><span>Invoice issue date</span><input type="date" name="issueDate" defaultValue={today()} required/></label></div>
      <div className="summary-box"><span>Current period readiness</span><strong>{Number(rentRunStatus.invoiced || 0)} / {Number(rentRunStatus.active || 0)} permitted active leases invoiced</strong><small>Due dates use each lease&apos;s billing day. Rent amounts use the lease rent.</small></div>
    </div></ModalForm></StatefulForm>

    <StatefulForm action={createLateFeeRunAction}><ModalForm id="late-fee-run-modal" title="Apply eligible late fees" description="Rules are read from each permitted property’s billing policy and recalculated when you submit." submitLabel="Generate late fees" pendingLabel="Generating…"><div className="modal-body">
      <div className="rent-run-notice"><Icon name="billing" size={20}/><div><strong>{lateFees.count} invoice{lateFees.count === 1 ? " is" : "s are"} eligible right now</strong><span>{lateFeeDetail}. Each rent invoice can have only one active late fee.</span></div></div>
      <label><span>Property scope</span><select name="propertyId"><option value="">All permitted properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
      <label><span>Fee issue and due date</span><input type="date" name="issueDate" defaultValue={today()} required/></label>
      <div className="summary-box"><span>Safe generation</span><strong>Original rent invoices remain unchanged</strong><small>Late fees are created as separate receivables and can be voided before payment if entered in error.</small></div>
    </div></ModalForm></StatefulForm>
  </>;
}
