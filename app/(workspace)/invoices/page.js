import Link from "next/link";
import { money } from "@/lib/format";
import { rentPeriodLabel } from "@/lib/rent";
import { requirePortfolioPermission } from "@/lib/permissions";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import Flash from "@/components/Flash";
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
  const lateFeeDetail = lateFees.byCurrency.length ? lateFees.byCurrency.map((row) => money(row.amount, row.currency)).join(" · ") : "No eligible late fees";

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Receivables" title="Invoices & overdue rent" description="Run monthly billing, apply policy-based late fees, issue ad-hoc charges, and monitor every permitted balance." actions={canManageBilling && <><OpenModalButton target="late-fee-run-modal" icon="billing" className="button secondary">Apply late fees</OpenModalButton><OpenModalButton target="rent-run-modal" icon="invoice" className="button secondary">Run monthly rent</OpenModalButton><OpenModalButton target="invoice-modal" icon="plus">Create invoice</OpenModalButton></>}/>
    <section className="metric-grid invoice-metrics"><article className="metric-card"><span>Invoices shown</span><strong>{rows.length}</strong><small>Current search and permission scope</small></article><article className="metric-card"><span>Open invoices</span><strong>{workspace.openCount}</strong><small>Issued, part-paid, or draft</small></article><article className="metric-card risk"><span>Overdue</span><strong>{workspace.overdueCount}</strong><small>Past due and not settled</small></article><article className="metric-card"><span>Outstanding</span><strong>{outstandingLabel}</strong><small>{outstandingDetail}</small></article></section>
    <section className="billing-strips"><div className="rent-run-strip"><div><span className="eyebrow">{rentPeriodLabel(currentPeriod)} rent run</span><strong>{rentPending ? `${rentPending} active lease${rentPending === 1 ? "" : "s"} still need an invoice` : "Monthly rent billing is complete"}</strong><p>{Number(rentRunStatus.invoiced || 0)} of {Number(rentRunStatus.active || 0)} permitted active leases have a rent invoice for this period.</p></div>{canManageBilling && <OpenModalButton target="rent-run-modal" icon="invoice" className="button light">{rentPending ? "Generate missing invoices" : "Review rent run"}</OpenModalButton>}</div>{canManageBilling && <div className="late-fee-strip"><div><span className="eyebrow">Late-fee preview</span><strong>{lateFees.count ? `${lateFees.count} rent invoice${lateFees.count === 1 ? " is" : "s are"} eligible` : "No late fees are eligible today"}</strong><p>{lateFeeDetail}</p></div><div className="strip-actions"><Link href="/billing" className="button secondary light-border">Review rules</Link><OpenModalButton target="late-fee-run-modal" icon="billing" className="button light">Apply fees</OpenModalButton></div></div>}</section>
    <InvoiceTable workspace={workspace}/>
    <InvoiceForms workspace={workspace} lateFeeDetail={lateFeeDetail}/>
  </>;
}
