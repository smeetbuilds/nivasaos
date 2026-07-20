import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { accessibleProperties, reportData } from "@/lib/data";
import { hasPermission } from "@/lib/permission-core";
import { moneyMinor, dateLabel } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import Empty from "@/components/Empty";
import Icon from "@/components/Icon";

export const metadata = { title: "Reports" };

function currencySummary(rows, amountField) {
  const groups = [...rows.reduce((map, row) => map.set(row.currency, (map.get(row.currency) || 0) + Number(row[amountField] || 0)), new Map()).entries()];
  return {
    label: groups.length === 0 ? moneyMinor(0) : groups.length === 1 ? moneyMinor(groups[0][1], groups[0][0]) : `${groups.length} currencies`,
    detail: groups.length ? groups.map(([currency, amount]) => moneyMinor(amount, currency)).join(" · ") : "No activity"
  };
}

export default async function ReportsPage({ searchParams }) {
  const user = await requireUser();
  const query = await searchParams;
  const propertyId = query?.property ? Number(query.property) : null;
  const properties = accessibleProperties(user).filter((property) => hasPermission(user, "reports.view", property.id));
  const data = reportData(user, propertyId);
  const arrears = currencySummary(data.arrears, "balance_minor");
  const collections = currencySummary(data.collections, "total_minor");
  const occupiedUnits = data.occupancy.reduce((sum, row) => sum + Number(row.occupied || 0), 0);
  const totalUnits = data.occupancy.reduce((sum, row) => sum + Number(row.total_units || 0), 0);
  const occupancyRate = totalUnits ? Math.round(occupiedUnits / totalUnits * 100) : 0;
  const collectionMaxByCurrency = data.collections.reduce((map, row) => {
    const amount = Number(row.total_minor || 0);
    map.set(row.currency, Math.max(map.get(row.currency) || 0, amount));
    return map;
  }, new Map());
  const exportHref = propertyId ? `/api/reports/export?property=${propertyId}` : "/api/reports/export";

  return <>
    <PageHeader eyebrow="Portfolio intelligence" title="Reports" description="Review occupancy, collections, and arrears using exact integer minor-unit totals and only properties available to your account." actions={<><a href={exportHref} className="button secondary"><Icon name="document" size={17}/>Export CSV</a><Link href="/invoices" className="button secondary"><Icon name="invoice" size={17}/>Invoices</Link><Link href="/payments" className="button secondary"><Icon name="payment" size={17}/>Payments</Link></>}/>

    <section className="metric-grid finance-summary-grid report-summary-grid" aria-label="Reporting summary">
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="property"/></div><span>Properties in report</span><strong>{data.occupancy.length}</strong><small>Report permission scope applied</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="unit"/></div><span>Occupancy</span><strong>{occupancyRate}%</strong><small>{occupiedUnits} of {totalUnits} configured units occupied</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="payment"/></div><span>Collections shown</span><strong>{collections.label}</strong><small>{collections.detail}</small></article>
      <article className="metric-card compact-metric risk"><div className="metric-icon"><Icon name="billing"/></div><span>Overdue balance</span><strong>{arrears.label}</strong><small>{data.arrears.length} invoice(s) · {arrears.detail}</small></article>
    </section>

    <form method="get" className="panel finance-toolbar report-scope-toolbar" aria-label="Filter reports by property">
      <div className="finance-toolbar-copy"><span className="eyebrow">Report scope</span><strong>{propertyId ? "Single-property view" : "Portfolio-wide view"}</strong><small>On-screen metrics and CSV exports use the same permission and property boundary.</small></div>
      <div className="finance-filter-grid report-filter-grid">
        <label><span>Property</span><select name="property" defaultValue={propertyId || ""}><option value="">All reportable properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
        <div className="finance-filter-actions"><button className="button secondary" type="submit">Apply scope</button>{propertyId && <Link href="/reports" className="text-link">Reset</Link>}</div>
      </div>
    </form>

    <section className="dashboard-grid report-dashboard-grid">
      <article className="panel report-insight-panel">
        <div className="panel-head"><div><span className="eyebrow">Utilisation</span><h2>Occupancy by property</h2></div><span className="panel-count">{data.occupancy.length} properties</span></div>
        {data.occupancy.length ? <div className="report-list">{data.occupancy.map((row) => {
          const pct = row.total_units ? Math.round(row.occupied / row.total_units * 100) : 0;
          return <div className="report-row" key={row.property_id}><div><strong>{row.property_name}</strong><span>{row.occupied || 0} occupied · {row.available || 0} available</span></div><div className="report-value"><strong>{pct}%</strong><span>{moneyMinor(row.occupied_value_minor, row.currency)}/mo</span></div><progress className="progress native-progress full" max="100" value={pct} aria-label={`${pct}% occupied`}>{pct}%</progress></div>;
        })}</div> : <Empty title="No occupancy data" text="Add units to see property utilisation."/>}
      </article>

      <article className="panel report-insight-panel">
        <div className="panel-head"><div><span className="eyebrow">Cash movement</span><h2>Collections by month</h2></div><span className="panel-count">Last 12 months</span></div>
        {data.collections.length ? <div className="bar-list finance-bar-list">{data.collections.map((row) => {
          const currencyMax = Math.max(collectionMaxByCurrency.get(row.currency) || 0, 1);
          const pct = Math.max(5, Number(row.total_minor || 0) / currencyMax * 100);
          return <div className="bar-row" key={`${row.month}-${row.property_id}`}><span>{row.month}</span><progress className="progress native-progress" max="100" value={pct} aria-label={`${row.month} ${row.currency} collections relative to other ${row.currency} months`}>{pct}%</progress><strong>{moneyMinor(row.total_minor, row.currency)}</strong></div>;
        })}</div> : <div className="quiet-state">No payment history in the last 12 months.</div>}
      </article>

      <article className="panel span-2 finance-directory-panel">
        <div className="panel-head"><div><span className="eyebrow">Receivables risk</span><h2>Arrears register</h2></div><span className="panel-count">{data.arrears.length} overdue</span></div>
        {data.arrears.length ? <div className="table-wrap"><table className="finance-table arrears-table" data-mobile-cards="arrears"><thead><tr><th>Invoice</th><th>Person</th><th>Property</th><th>Due date</th><th>Billed</th><th>Paid</th><th>Balance</th></tr></thead><tbody>{data.arrears.map((row) => <tr key={row.invoice_id}><td data-label="Invoice"><strong>{row.number}</strong></td><td data-label="Person">{row.tenant_name || "Unassigned"}</td><td data-label="Property">{row.property_name}</td><td data-label="Due date">{dateLabel(row.due_date)}</td><td data-label="Billed">{moneyMinor(row.amount_minor, row.currency)}</td><td data-label="Paid">{moneyMinor(row.amount_paid_minor, row.currency)}</td><td data-label="Balance"><strong className="finance-balance">{moneyMinor(row.balance_minor, row.currency)}</strong></td></tr>)}</tbody></table></div> : <div className="quiet-state">No overdue invoices in this scope.</div>}
      </article>
    </section>
  </>;
}
