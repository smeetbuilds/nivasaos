import {
  billServiceSubscriptionAction,
  bulkServiceBillingAction,
  createServiceAction,
  endServiceSubscriptionAction,
  subscribeServiceAction,
  updateServiceAction
} from "@/app/actions";
import { propertyScopeSql, requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { dateLabel, dateTimeLabel, money, today } from "@/lib/format";
import { supportsCapability } from "@/lib/modules/catalog";
import { hasPermission } from "@/lib/permissions";
import Badge from "@/components/Badge";
import ConfirmAction from "@/components/ConfirmAction";
import Empty from "@/components/Empty";
import Flash from "@/components/Flash";
import ModalForm from "@/components/ModalForm";
import ModuleBadge from "@/components/ModuleBadge";
import OpenModalButton from "@/components/OpenModalButton";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Services & add-ons" };

function currentPeriods() {
  const date = today();
  const year = date.slice(0, 4);
  const month = date.slice(0, 7);
  const quarter = `${year}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
  return { year, month, quarter, oneTime: "one-time" };
}

function periodForFrequency(frequency, periods) {
  if (frequency === "one_time") return periods.oneTime;
  if (frequency === "quarterly") return periods.quarter;
  if (frequency === "annual") return periods.year;
  return periods.month;
}

function periodHint(frequency) {
  if (frequency === "one_time") return "Stored as the single one-time run.";
  if (frequency === "quarterly") return "Use YYYY-Q1 to YYYY-Q4.";
  if (frequency === "annual") return "Use YYYY.";
  return "Use YYYY-MM.";
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

export default async function ServicesPage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const periods = currentPeriods();
  const query = await searchParams;
  const allProperties = all(`SELECT p.* FROM properties p WHERE ${scope.clause} AND p.status='active' ORDER BY p.name`, scope.params);
  const properties = allProperties.filter((property) => supportsCapability(property.module_id, "servicePlans") && hasPermission(user, "services.manage", property.id));
  const propertyIds = properties.map((property) => Number(property.id));
  const billingProperties = properties.filter((property) => hasPermission(user, "billing.manage", property.id));
  const billingPropertyIds = billingProperties.map((property) => Number(property.id));
  const services = propertyIds.length ? all(
    `SELECT sc.*,p.name property_name,p.currency,p.module_id,
      (SELECT COUNT(*) FROM lease_services ls WHERE ls.service_id=sc.id AND ls.status='active') active_subscriptions
     FROM service_catalog sc JOIN properties p ON p.id=sc.property_id
     WHERE sc.property_id IN (${propertyIds.map(() => "?").join(",")})
     ORDER BY p.name,sc.active DESC,sc.name`,
    propertyIds
  ) : [];
  const subscriptions = propertyIds.length ? all(
    `SELECT ls.*,sc.name service_name,sc.billing_frequency,sc.amount service_amount,p.name property_name,p.currency,p.module_id,
      l.reference lease_reference,u.name unit_name,t.full_name tenant_name,sbr.invoice_id current_invoice_id,i.number current_invoice_number
     FROM lease_services ls JOIN service_catalog sc ON sc.id=ls.service_id JOIN properties p ON p.id=ls.property_id
     JOIN leases l ON l.id=ls.lease_id JOIN units u ON u.id=l.unit_id LEFT JOIN tenants t ON t.id=ls.tenant_id
     LEFT JOIN service_billing_runs sbr ON sbr.subscription_id=ls.id AND sbr.period=CASE sc.billing_frequency
       WHEN 'one_time' THEN ? WHEN 'monthly' THEN ? WHEN 'quarterly' THEN ? WHEN 'annual' THEN ? ELSE '' END
     LEFT JOIN invoices i ON i.id=sbr.invoice_id
     WHERE ls.property_id IN (${propertyIds.map(() => "?").join(",")})
     ORDER BY CASE ls.status WHEN 'active' THEN 0 ELSE 1 END,p.name,sc.name,ls.id DESC`,
    [periods.oneTime, periods.month, periods.quarter, periods.year, ...propertyIds]
  ) : [];
  const leases = propertyIds.length ? all(
    `SELECT l.id,l.reference,l.property_id,p.name property_name,u.name unit_name
     FROM leases l JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id
     WHERE l.property_id IN (${propertyIds.map(() => "?").join(",")}) AND l.status='active'
     ORDER BY p.name,u.name,l.reference`,
    propertyIds
  ) : [];
  const tenants = leases.length ? all(
    `SELECT lt.lease_id,t.id,t.full_name
     FROM lease_tenants lt JOIN tenants t ON t.id=lt.tenant_id
     WHERE lt.lease_id IN (${leases.map(() => "?").join(",")}) ORDER BY t.full_name`,
    leases.map((lease) => Number(lease.id))
  ) : [];
  const jobs = billingPropertyIds.length ? all(
    `SELECT bj.*,p.name property_name
     FROM bulk_jobs bj JOIN properties p ON p.id=bj.property_id
     WHERE bj.property_id IN (${billingPropertyIds.map(() => "?").join(",")}) AND bj.job_type='service_billing'
     ORDER BY bj.created_at DESC,bj.id DESC LIMIT 50`,
    billingPropertyIds
  ) : [];

  const activeSubscriptions = subscriptions.filter((item) => item.status === "active");
  const billable = activeSubscriptions.filter((item) => item.billing_frequency !== "included" && hasPermission(user, "billing.manage", item.property_id));
  const billed = billable.filter((item) => item.current_invoice_id).length;
  const awaitingBilling = billable.filter((item) => !item.current_invoice_id).length;
  const activeJobs = jobs.filter((job) => ["preview", "running"].includes(job.status)).length;
  const activeServices = services.filter((service) => service.active);

  return <>
    <Flash searchParams={query}/>
    <PageHeader
      eyebrow="Module services"
      title="Services & add-ons"
      description="Manage resident entitlements, assignment history, individual billing, and property-wide repeat-safe billing runs from one controlled workspace."
      actions={<div className="module-page-actions">
        {billingProperties.length > 0 && <OpenModalButton target="service-bulk" icon="billing">Bulk billing</OpenModalButton>}
        {properties.length > 0 && <OpenModalButton target="service-create" className="button secondary" icon="plus">New service</OpenModalButton>}
        {activeServices.length > 0 && leases.length > 0 && <OpenModalButton target="service-assign" className="button secondary">Assign service</OpenModalButton>}
      </div>}
    />

    <section className="metric-grid module-metric-grid" aria-label="Service operations summary">
      <article className="metric-card"><span>Active catalogue items</span><strong>{activeServices.length}</strong><small>Across {properties.length} permitted properties</small></article>
      <article className="metric-card"><span>Active subscriptions</span><strong>{activeSubscriptions.length}</strong><small>Agreement or resident level</small></article>
      <article className="metric-card"><span>Billed current cycle</span><strong>{billed}</strong><small>Within your billing permission scope</small></article>
      <article className={`metric-card${awaitingBilling ? " risk" : ""}`}><span>Awaiting billing</span><strong>{awaitingBilling}</strong><small>{activeJobs ? `${activeJobs} preview or run job(s) active` : "Included or out-of-scope services excluded"}</small></article>
    </section>

    <section className="panel module-directory-section" aria-labelledby="service-catalogue-title">
      <div className="panel-head"><div><span className="eyebrow">Available entitlements</span><h2 id="service-catalogue-title">Service catalogue</h2></div>{properties.length > 0 && <OpenModalButton target="service-create" className="button secondary">Add service</OpenModalButton>}</div>
      {services.length ? <div className="table-wrap"><table className="module-directory-table" data-mobile-cards="service-catalogue" aria-label="Service catalogue">
        <thead><tr><th>Service</th><th>Property</th><th>Frequency</th><th>Default charge</th><th>Subscriptions</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{services.map((service) => <tr key={service.id}>
          <td data-label="Service"><strong>{service.name}</strong><small>{service.category} · {service.description || "No description"}</small></td>
          <td data-label="Property"><ModuleBadge moduleId={service.module_id} compact/><strong>{service.property_name}</strong></td>
          <td data-label="Frequency"><strong>{service.billing_frequency.replaceAll("_", " ")}</strong></td>
          <td data-label="Default charge"><strong>{service.billing_frequency === "included" ? "Included" : money(service.amount, service.currency)}</strong></td>
          <td data-label="Subscriptions"><strong>{service.active_subscriptions}</strong><small>Currently active</small></td>
          <td data-label="Status"><Badge tone={service.active ? "active" : "inactive"}>{service.active ? "active" : "inactive"}</Badge></td>
          <td data-label="Actions"><OpenModalButton target={`service-edit-${service.id}`} icon="edit" className="text-button">Edit service</OpenModalButton></td>
        </tr>)}</tbody>
      </table></div> : <Empty icon="services" title="No services configured" text={properties.length ? "Create a module-relevant service, then assign it to an active agreement or individual resident." : "Enable a module with service plans and create a compatible property first."}/>} 
    </section>

    <section className="panel module-directory-section" aria-labelledby="service-subscriptions-title">
      <div className="panel-head"><div><span className="eyebrow">Active delivery</span><h2 id="service-subscriptions-title">Agreement and resident subscriptions</h2></div>{activeServices.length > 0 && leases.length > 0 && <OpenModalButton target="service-assign" className="button secondary">Assign service</OpenModalButton>}</div>
      {subscriptions.length ? <div className="table-wrap"><table className="module-directory-table" data-mobile-cards="service-subscriptions" aria-label="Service subscriptions">
        <thead><tr><th>Service</th><th>Agreement / resident</th><th>Charge</th><th>Started</th><th>Current cycle</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{subscriptions.map((item) => {
          const amount = Number(item.custom_amount ?? item.service_amount);
          const currentPeriod = periodForFrequency(item.billing_frequency, periods);
          const canBill = hasPermission(user, "billing.manage", item.property_id);
          return <tr key={item.id}>
            <td data-label="Service"><strong>{item.service_name}</strong><small>{item.property_name} · {item.unit_name}</small></td>
            <td data-label="Agreement / resident"><strong>{item.lease_reference}</strong><small>{item.tenant_name || "Agreement-level service"}</small></td>
            <td data-label="Charge"><strong>{item.billing_frequency === "included" ? "Included" : money(amount, item.currency)}</strong><small>{item.billing_frequency.replaceAll("_", " ")}</small></td>
            <td data-label="Started"><strong>{dateLabel(item.start_date)}</strong>{item.end_date && <small>Ended {dateLabel(item.end_date)}</small>}</td>
            <td data-label="Current cycle">{!canBill ? <span className="quiet-copy">Billing access required</span> : item.current_invoice_number ? <><Badge tone="paid">Billed</Badge><small>{currentPeriod} · {item.current_invoice_number}</small></> : item.status === "active" && item.billing_frequency !== "included" ? <><Badge tone="draft">Not billed</Badge><small>{currentPeriod}</small></> : <span className="quiet-copy">Not applicable</span>}</td>
            <td data-label="Status"><Badge tone={item.status}>{item.status.replaceAll("_", " ")}</Badge></td>
            <td data-label="Actions"><div className="table-actions module-row-actions">
              {item.status === "active" && item.billing_frequency !== "included" && !item.current_invoice_id && canBill && <OpenModalButton target={`service-bill-${item.id}`} className="text-button">Bill cycle</OpenModalButton>}
              {item.status === "active" && <ConfirmAction action={endServiceSubscriptionAction} id={`service-end-${item.id}`} triggerLabel="End service" triggerClassName="text-button danger" title={`End ${item.service_name}?`} description={`${item.property_name} · ${item.lease_reference}`} submitLabel="End service" pendingLabel="Ending…"><div className="modal-body"><input type="hidden" name="subscriptionId" value={item.id}/><input type="hidden" name="endDate" value={today()}/><div className="confirm-consequence">Future billing stops immediately. Existing invoices and service history remain unchanged.</div></div></ConfirmAction>}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty icon="services" title="No service subscriptions" text="Assign a catalogue service to an active agreement or a specific linked resident."/>}
    </section>

    {billingProperties.length > 0 && <section className="panel module-directory-section" aria-labelledby="service-jobs-title">
      <div className="panel-head"><div><span className="eyebrow">Controlled batch processing</span><h2 id="service-jobs-title">Bulk billing history</h2></div><OpenModalButton target="service-bulk" className="button secondary">Preview or run</OpenModalButton></div>
      {jobs.length ? <div className="table-wrap"><table className="module-directory-table" data-mobile-cards="service-jobs" aria-label="Service bulk billing history">
        <thead><tr><th>Property</th><th>Period</th><th>Prepared</th><th>Status</th><th>Created</th><th>Result</th></tr></thead>
        <tbody>{jobs.map((job) => {
          const preview = parseJson(job.preview_json, []);
          const result = parseJson(job.result_json, {});
          return <tr key={job.id}>
            <td data-label="Property"><strong>{job.property_name}</strong><small>Service billing</small></td>
            <td data-label="Period"><strong>{job.period}</strong></td>
            <td data-label="Prepared"><strong>{Array.isArray(preview) ? preview.length : 0}</strong><small>Eligible invoice(s)</small></td>
            <td data-label="Status"><Badge tone={job.status}>{job.status.replaceAll("_", " ")}</Badge></td>
            <td data-label="Created"><strong>{dateTimeLabel(job.created_at)}</strong></td>
            <td data-label="Result"><strong>{result.created ?? result.createdCount ?? (job.status === "completed" ? "Completed" : "—")}</strong><small>{job.error_text || (job.status === "preview" ? "Preview only · no invoices created" : "Idempotency protected")}</small></td>
          </tr>;
        })}</tbody>
      </table></div> : <Empty icon="billing" title="No bulk billing jobs" text="Preview a property and period before creating service invoices in a repeat-safe batch."/>}
    </section>}

    {properties.length > 0 && <form action={createServiceAction}><ModalForm id="service-create" title="Create a service" description="Configure the catalogue item before assigning it. Included services never create a separate invoice." submitLabel="Create service" pendingLabel="Creating…"><div className="modal-body">
      <label><span>Property</span><select name="propertyId" required>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label>
      <div className="field-grid two"><label><span>Service name</span><input name="name" required maxLength="160" placeholder="Meal plan"/></label><label><span>Category</span><input name="category" maxLength="80" placeholder="Meals, laundry, CAM, parking"/></label></div>
      <div className="field-grid two"><label><span>Billing frequency</span><select name="billingFrequency"><option value="included">Included</option><option value="one_time">One time</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label><label><span>Default charge</span><input type="number" min="0" step="0.01" name="amount" defaultValue="0" inputMode="decimal"/></label></div>
      <label><span>Description</span><textarea name="description" rows="3" maxLength="1800"/></label>
      <div className="module-form-note">Changing frequency later requires every active subscription for this service to be ended first.</div>
    </div></ModalForm></form>}

    {services.map((service) => <form action={updateServiceAction} key={`edit-${service.id}`}><ModalForm id={`service-edit-${service.id}`} title={`Edit ${service.name}`} description="Existing subscriptions retain their custom charge; catalogue defaults apply where no custom amount exists." submitLabel="Save service" pendingLabel="Saving…"><div className="modal-body">
      <input type="hidden" name="serviceId" value={service.id}/><div className="summary-box"><span>Property</span><strong>{service.property_name}</strong><small>{service.active_subscriptions} active subscription(s)</small></div>
      <div className="field-grid two"><label><span>Name</span><input name="name" defaultValue={service.name} required maxLength="160"/></label><label><span>Category</span><input name="category" defaultValue={service.category} maxLength="80"/></label></div>
      <div className="field-grid two"><label><span>Frequency</span><select name="billingFrequency" defaultValue={service.billing_frequency}>{["included", "one_time", "monthly", "quarterly", "annual"].map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label><span>Default charge</span><input type="number" min="0" step="0.01" name="amount" defaultValue={service.amount} inputMode="decimal"/></label></div>
      <label><span>Description</span><textarea name="description" rows="3" maxLength="1800" defaultValue={service.description || ""}/></label>
      <label className="check-row"><input type="checkbox" name="active" defaultChecked={Boolean(service.active)}/><span><strong>Available for new assignments</strong><small>Deactivation does not erase existing subscriptions or invoices.</small></span></label>
    </div></ModalForm></form>)}

    {activeServices.length > 0 && leases.length > 0 && <form action={subscribeServiceAction}><ModalForm id="service-assign" title="Assign a service" description="Service, agreement, property, and resident relationships are revalidated before assignment." submitLabel="Assign service" pendingLabel="Assigning…"><div className="modal-body">
      <label><span>Service</span><select name="serviceId" required>{properties.map((property) => <optgroup label={property.name} key={property.id}>{activeServices.filter((service) => Number(service.property_id) === Number(property.id)).map((service) => <option value={service.id} key={service.id}>{service.name} · {service.billing_frequency.replaceAll("_", " ")}</option>)}</optgroup>)}</select></label>
      <label><span>Active agreement</span><select name="leaseId" required>{properties.map((property) => <optgroup label={property.name} key={property.id}>{leases.filter((lease) => Number(lease.property_id) === Number(property.id)).map((lease) => <option value={lease.id} key={lease.id}>{lease.unit_name} · {lease.reference}</option>)}</optgroup>)}</select><small>Choose an agreement from the same property as the selected service.</small></label>
      <label><span>Specific resident (optional)</span><select name="tenantId"><option value="">Agreement-level service</option>{tenants.map((tenant) => <option value={tenant.id} key={`${tenant.lease_id}-${tenant.id}`}>{tenant.full_name} · agreement #{tenant.lease_id}</option>)}</select></label>
      <div className="field-grid two"><label><span>Start date</span><input type="date" name="startDate" defaultValue={today()} required/></label><label><span>Custom charge (optional)</span><input type="number" min="0" step="0.01" name="customAmount" inputMode="decimal" placeholder="Use catalogue default"/></label></div>
    </div></ModalForm></form>}

    {subscriptions.filter((item) => item.status === "active" && item.billing_frequency !== "included" && !item.current_invoice_id && hasPermission(user, "billing.manage", item.property_id)).map((item) => <form action={billServiceSubscriptionAction} key={`bill-${item.id}`}><ModalForm id={`service-bill-${item.id}`} title={`Bill ${item.service_name}`} description="The subscription and period pair is unique, so repeated submissions cannot create duplicate invoices." submitLabel="Create invoice" pendingLabel="Creating…"><div className="modal-body">
      <input type="hidden" name="subscriptionId" value={item.id}/><div className="summary-box"><span>Charge</span><strong>{money(Number(item.custom_amount ?? item.service_amount), item.currency)}</strong><small>{item.property_name} · {item.lease_reference} · {item.tenant_name || "agreement level"}</small></div>
      <label><span>Billing period</span><input name="period" defaultValue={periodForFrequency(item.billing_frequency, periods)} readOnly={item.billing_frequency === "one_time"} required/><small>{periodHint(item.billing_frequency)}</small></label>
      <label><span>Invoice due date</span><input type="date" name="dueDate" defaultValue={today()} required/></label>
    </div></ModalForm></form>)}

    {billingProperties.length > 0 && <form action={bulkServiceBillingAction}><ModalForm id="service-bulk" title="Preview or run service billing" description="A preview stores the eligible invoice list without changing balances. A run creates only still-unbilled, positive-value subscriptions for the selected period." submitLabel="Process billing" pendingLabel="Processing…"><div className="modal-body">
      <label><span>Property</span><select name="propertyId" required>{billingProperties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label>
      <div className="field-grid two"><label><span>Billing period</span><input name="period" defaultValue={periods.month} required placeholder="YYYY-MM, YYYY-Q1, YYYY, or one-time"/></label><label><span>Invoice due date</span><input type="date" name="dueDate" defaultValue={today()} required/></label></div>
      <label><span>Mode</span><select name="mode" defaultValue="preview"><option value="preview">Preview only · create no invoices</option><option value="run">Run · create eligible invoices</option></select></label>
      <div className="policy-warning">Use preview first. Completed property-and-period runs are idempotency locked and cannot be repeated.</div>
    </div></ModalForm></form>}
  </>;
}
