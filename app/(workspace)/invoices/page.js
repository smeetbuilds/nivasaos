import Link from "next/link";
import { money } from "@/lib/format";
import { rentPeriodLabel } from "@/lib/rent";
import { requirePortfolioPermission } from "@/lib/permissions";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import Flash from "@/components/Flash";
import Icon from "@/components/Icon";
import { loadInvoiceWorkspace } from "./workspace";
import InvoiceTable from "./InvoiceTable";
import InvoiceForms from "./InvoiceForms";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }) {
  const user = await requirePortfolioPermission("billing.manage");
  const query = await searchParams;
  const workspace = loadInvoiceWorkspace(user, query);
  const { rows, outstandingByCurrency, rentRunStatus, currentPeriod, lateFees, canManageBilling } = workspace;
  const outstandingLabel = outstandingByCurrency.length === 0 ? money(0) : outstandingByCurrency.length === 1 ? money(outstandingByCurrency[0].balance, outstandingByCurrency[0].currency) : `${outstandingByCurrency.length} currencies`;
  const outstandingDetail = outstandingByCurrency.length ? outstandingByCurrency.map((row) => money(row.balance, row.currency)).join(" · ") : "No open balance";
  const rentPending = Math.max(0, Number(rentRunStatus.active || 0) - Number(rentRunStatus.invoiced || 0));
  const rentProgress = Number(rentRunStatus.active || 0) ? Math.round(Number(rentRunStatus.invoiced || 0) / Number(rentRunStatus.active || 0) * 100) : 0;
  const lateFeeDetail = lateFees.byCurrency.length ? lateFees.byCurrency.map((row) => money(row.amount, row.currency)).join(" · ") : "No eligible late fees";

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Receivables control" title="Invoices & overdue rent" description="Run recurring billing, issue controlled charges, apply policy-based fees, and monitor every balance inside your permitted property scope." actions={canManageBilling && <><OpenModalButton target="late-fee-run-modal" icon="billing" className="button secondary">Apply late fees</OpenModalButton><OpenModalButton target="rent-run-modal" icon="invoice" className="button secondary">Run monthly rent</OpenModalButton><OpenModalButton target="invoice-modal" icon="plus">Create invoice</OpenModalButton></>}/>

    <section className="metric-grid finance-summary-grid" aria-label="Receivables summary">
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="invoice"/></div><span>Invoices shown</span><strong>{rows.length}</strong><small>Current filters and permission scope</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="report"/></div><span>Open invoices</span><strong>{workspace.openCount}</strong><small>Issued, part-paid, or draft</small></article>
      <article className="metric-card compact-metric risk"><div className="metric-icon"><Icon name="billing"/></div><span>Overdue</span><strong>{workspace.overdueCount}</strong><small>Past due and not settled</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="payment"/></div><span>Outstanding</span><strong>{outstandingLabel}</strong><small>{outstandingDetail}</small></article>
    </section>

    <section className="billing-strips finance-command-grid" aria-label="Billing operations">
      <article className="rent-run-strip finance-command-card">
        <div className="finance-command-icon"><Icon name="invoice" size={19}/></div>
        <div className="finance-command-copy"><span className="eyebrow">{rentPeriodLabel(currentPeriod)} rent run</span><strong>{rentPending ? `${rentPending} active agreement${rentPending === 1 ? "" : "s"} still need an invoice` : "Monthly rent billing is complete"}</strong><p>{Number(rentRunStatus.invoiced || 0)} of {Number(rentRunStatus.active || 0)} permitted active agreements have a rent invoice for this period.</p><div className="progress finance-progress"><i style={{ width: `${rentProgress}%` }}/></div></div>
        {canManageBilling && <OpenModalButton target="rent-run-modal" icon="invoice" className="button secondary">{rentPending ? "Generate missing invoices" : "Review rent run"}</OpenModalButton>}
      </article>
      {canManageBilling && <article className="late-fee-strip finance-command-card">
        <div className="finance-command-icon is-warning"><Icon name="billing" size={19}/></div>
        <div className="finance-command-copy"><span className="eyebrow">Late-fee preview</span><strong>{lateFees.count ? `${lateFees.count} rent invoice${lateFees.count === 1 ? " is" : "s are"} eligible` : "No late fees are eligible today"}</strong><p>{lateFeeDetail}</p></div>
        <div className="strip-actions"><Link href="/billing" className="button secondary">Review rules</Link><OpenModalButton target="late-fee-run-modal" icon="billing" className="button secondary">Apply fees</OpenModalButton></div>
      </article>}
    </section>

    <InvoiceTable workspace={workspace}/>
    <InvoiceForms workspace={workspace} lateFeeDetail={lateFeeDetail}/>
  </>;
}
