import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant-auth";
import { portalServicesData } from "@/lib/module-data";
import { moduleById, supportsCapability } from "@/lib/modules/catalog";
import { dateLabel, money } from "@/lib/format";
import Badge from "@/components/Badge";
import Icon from "@/components/Icon";

export const metadata = { title: "My services" };

export default async function PortalServicesPage() {
  const tenant = await requireTenant();
  const module = moduleById(tenant.module_id);
  if (!supportsCapability(module.id, "servicePlans")) redirect("/portal");
  const services = portalServicesData(tenant.tenant_id);
  const active = services.filter((service) => service.status === "active");
  const included = active.filter((service) => service.billing_frequency === "included").length;
  const chargeable = active.filter((service) => service.billing_frequency !== "included");
  return <>
    <header className="portal-page-head"><div><span className="eyebrow">{module.shortLabel} entitlements</span><h1>My services</h1><p>Services attached to your {module.terminology.agreement.toLowerCase()} or specifically assigned to your resident profile.</p></div><Link href="/portal/billing" className="button secondary">Open billing <Icon name="arrow" size={16}/></Link></header>
    <section className="portal-metric-grid module-portal-metrics"><article><span>Active services</span><strong>{active.length}</strong><small>Currently assigned</small></article><article><span>Included</span><strong>{included}</strong><small>No separate service invoice</small></article><article><span>Chargeable</span><strong>{chargeable.length}</strong><small>One-time or recurring</small></article><article><span>Historical</span><strong>{services.length-active.length}</strong><small>Ended or cancelled</small></article></section>
    <section className="portal-card"><div className="portal-card-head"><div><span className="eyebrow">Current and historical</span><h2>Service register</h2></div></div>{services.length ? <div className="portal-service-list">{services.map((service) => {const amount=Number(service.custom_amount??service.default_amount);return <article key={service.id} className={service.status==="active"?"is-active":""}><span className="portal-service-icon"><Icon name="services" size={20}/></span><span><strong>{service.name}</strong><small>{service.property_name} · {service.unit_name} · {service.lease_reference}</small><p>{service.description || `${service.category} service`}</p></span><span><strong>{service.billing_frequency==="included"?"Included":money(amount,service.currency)}</strong><small>{service.billing_frequency.replaceAll("_"," ")} · from {dateLabel(service.start_date)}</small>{service.latest_invoice&&<Link href="/portal/billing" className="text-link">Invoice {service.latest_invoice}</Link>}</span><Badge tone={service.status}>{service.status}</Badge></article>})}</div> : <div className="portal-empty-state"><Icon name="services" size={30}/><strong>No services assigned</strong><p>Your property team will add meals, utilities, laundry, parking, CAM, or other relevant services here.</p></div>}</section>
  </>;
}
