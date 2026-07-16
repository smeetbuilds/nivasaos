import {
  addInspectionItemAction,
  archiveLeaseDocumentAction,
  completeInspectionAction,
  createInspectionAction,
  recordKeyTransactionAction,
  shareInspectionAction,
  uploadLeaseDocumentAction
} from "@/app/actions";
import { propertyScopeSql, requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { dateLabel, dateTimeLabel, money, today } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import Icon from "@/components/Icon";

export const metadata = { title: "Handover & documents" };

const conditionOptions = ["excellent", "good", "fair", "damaged", "missing", "not_applicable"];

export default async function HandoverPage({ searchParams }) {
  const user = await requireUser();
  const scope = propertyScopeSql(user, "p");
  const query = await searchParams;
  const leases = all(
    `SELECT l.id,l.reference,l.property_id,l.status,l.start_date,l.end_date,l.deposit,p.name property_name,p.currency,u.name unit_name,
      (SELECT GROUP_CONCAT(t.full_name, ', ') FROM lease_tenants lt JOIN tenants t ON t.id=lt.tenant_id WHERE lt.lease_id=l.id) tenant_names,
      COALESCE((SELECT SUM(CASE dt.transaction_type WHEN 'received' THEN dt.amount WHEN 'credit' THEN dt.amount ELSE -dt.amount END) FROM deposit_transactions dt WHERE dt.lease_id=l.id),0) deposit_held
     FROM leases l JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id
     WHERE ${scope.clause}
     ORDER BY CASE l.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,l.start_date DESC`,
    scope.params
  );
  const inspections = all(
    `SELECT pi.*,p.name property_name,p.currency,l.reference lease_reference,u.name unit_name,
      (SELECT GROUP_CONCAT(t.full_name, ', ') FROM lease_tenants lt JOIN tenants t ON t.id=lt.tenant_id WHERE lt.lease_id=pi.lease_id) tenant_names,
      (SELECT COUNT(*) FROM inspection_items ii WHERE ii.inspection_id=pi.id) item_count,
      (SELECT COALESCE(SUM(ii.charge_amount),0) FROM inspection_items ii WHERE ii.inspection_id=pi.id) assessed_charge,
      (SELECT COUNT(*) FROM inspection_acknowledgements ia WHERE ia.inspection_id=pi.id) acknowledgement_count,
      (SELECT COUNT(*) FROM lease_tenants lt WHERE lt.lease_id=pi.lease_id) tenant_count
     FROM property_inspections pi JOIN properties p ON p.id=pi.property_id JOIN leases l ON l.id=pi.lease_id JOIN units u ON u.id=l.unit_id
     WHERE ${scope.clause}
     ORDER BY CASE pi.status WHEN 'draft' THEN 0 WHEN 'shared' THEN 1 WHEN 'acknowledged' THEN 2 ELSE 3 END,pi.scheduled_for DESC,pi.id DESC`,
    scope.params
  );
  const documents = all(
    `SELECT ld.*,p.name property_name,l.reference lease_reference,u.name unit_name,up.name uploader_name
     FROM lease_documents ld JOIN properties p ON p.id=ld.property_id JOIN leases l ON l.id=ld.lease_id JOIN units u ON u.id=l.unit_id
     LEFT JOIN users up ON up.id=ld.uploaded_by
     WHERE ${scope.clause} AND ld.archived_at IS NULL ORDER BY ld.created_at DESC,ld.id DESC LIMIT 150`,
    scope.params
  );
  const keyTransactions = all(
    `SELECT kt.*,p.name property_name,l.reference lease_reference,u.name unit_name,t.full_name tenant_name,rec.name recorder_name
     FROM lease_key_transactions kt JOIN properties p ON p.id=kt.property_id JOIN leases l ON l.id=kt.lease_id JOIN units u ON u.id=l.unit_id
     LEFT JOIN tenants t ON t.id=kt.tenant_id LEFT JOIN users rec ON rec.id=kt.recorded_by
     WHERE ${scope.clause} ORDER BY kt.transacted_at DESC,kt.id DESC LIMIT 150`,
    scope.params
  );
  const tenants = all(
    `SELECT t.id,t.full_name,lt.lease_id,l.reference,p.name property_name,u.name unit_name
     FROM tenants t JOIN lease_tenants lt ON lt.tenant_id=t.id JOIN leases l ON l.id=lt.lease_id JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id
     WHERE ${scope.clause} ORDER BY p.name,u.name,t.full_name`,
    scope.params
  );
  const openInspections = inspections.filter((item) => item.status !== "completed").length;
  const tenantDocuments = documents.filter((item) => item.visibility === "tenant").length;
  const keyBalance = keyTransactions.reduce((sum, item) => sum + (["issued", "replaced"].includes(item.action) ? Number(item.quantity) : -Number(item.quantity)), 0);
  const depositPending = leases.filter((lease) => lease.status === "ended" && Number(lease.deposit_held) > 0.001).length;

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Possession evidence" title="Handover & documents" description="Keep condition reports, tenant-visible files, meter readings, keys, acknowledgements, and move-out deductions connected to the lease." actions={<><OpenModalButton target="inspection-create" icon="inspection">New inspection</OpenModalButton><OpenModalButton target="document-upload" icon="document" className="button secondary">Upload document</OpenModalButton><OpenModalButton target="key-record" icon="key" className="button secondary">Record keys</OpenModalButton></>}/>

    <section className="metric-grid handover-metrics">
      <article className="metric-card"><span>Open inspections</span><strong>{openInspections}</strong><small>Draft, shared, or awaiting completion</small></article>
      <article className="metric-card"><span>Tenant-visible documents</span><strong>{tenantDocuments}</strong><small>Available in resident portals</small></article>
      <article className="metric-card"><span>Tracked keys outstanding</span><strong>{Math.max(0, keyBalance)}</strong><small>Issued or replaced minus returned or lost</small></article>
      <article className="metric-card risk"><span>Ended leases with deposit held</span><strong>{depositPending}</strong><small>Settlement still needs a refund or documented debit</small></article>
    </section>

    <section className="panel handover-section">
      <div className="panel-head"><div><span className="eyebrow">Condition evidence</span><h2>Inspections</h2></div><OpenModalButton target="inspection-create" icon="plus" className="button secondary">Create inspection</OpenModalButton></div>
      {inspections.length ? <div className="table-wrap"><table><thead><tr><th>Inspection</th><th>Lease / home</th><th>Date</th><th>Checklist</th><th>Acknowledgement</th><th>Status</th><th>Actions</th></tr></thead><tbody>{inspections.map((item) => <tr key={item.id}>
        <td><strong>{item.reference}</strong><small>{item.inspection_type.replaceAll("_", " ")}</small></td>
        <td>{item.property_name} · {item.unit_name}<small>{item.tenant_names || item.lease_reference}</small></td>
        <td>{dateLabel(item.scheduled_for)}<small>{item.completed_at ? `Completed ${dateTimeLabel(item.completed_at)}` : ""}</small></td>
        <td>{item.item_count} item(s)<small>{Number(item.assessed_charge) > 0 ? `${money(item.assessed_charge, item.currency)} assessed` : "No assessed charge"}</small></td>
        <td>{item.acknowledgement_count}/{item.tenant_count}<small>linked tenants</small></td>
        <td><Badge tone={item.status}>{item.status}</Badge></td>
        <td><div className="table-actions">{item.status === "draft" && <OpenModalButton target={`inspection-item-${item.id}`} icon="plus" className="text-button">Add item</OpenModalButton>}{item.status === "draft" && <form action={shareInspectionAction}><input type="hidden" name="inspectionId" value={item.id}/><button className="text-button">Share</button></form>}{["shared", "acknowledged"].includes(item.status) && <OpenModalButton target={`inspection-complete-${item.id}`} className="text-button">Complete</OpenModalButton>}</div></td>
      </tr>)}</tbody></table></div> : <Empty icon="inspection" title="No inspections" text="Create a move-in, periodic, or move-out report and add condition items before sharing it."/>}
    </section>

    <section className="panel handover-section">
      <div className="panel-head"><div><span className="eyebrow">Controlled files</span><h2>Lease documents</h2></div><OpenModalButton target="document-upload" icon="plus" className="button secondary">Upload file</OpenModalButton></div>
      {documents.length ? <div className="table-wrap"><table><thead><tr><th>Document</th><th>Lease / home</th><th>Visibility</th><th>Uploaded</th><th>File</th><th></th></tr></thead><tbody>{documents.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.document_type} · {item.original_name}</small></td><td>{item.property_name} · {item.unit_name}<small>{item.lease_reference}</small></td><td><Badge tone={item.visibility === "tenant" ? "active" : "inactive"}>{item.visibility}</Badge></td><td>{dateTimeLabel(item.created_at)}<small>{item.uploader_name || "Former team member"}</small></td><td><a className="text-link" href={`/api/lease-documents/${item.id}`} target="_blank">Open</a></td><td>{["owner", "admin"].includes(user.role) && <form action={archiveLeaseDocumentAction}><input type="hidden" name="documentId" value={item.id}/><button className="text-button danger-text">Archive</button></form>}</td></tr>)}</tbody></table></div> : <Empty icon="document" title="No lease documents" text="Upload agreements, inventories, notices, condition reports, or handover records."/>}
    </section>

    <section className="panel handover-section">
      <div className="panel-head"><div><span className="eyebrow">Physical access</span><h2>Key ledger</h2></div><OpenModalButton target="key-record" icon="plus" className="button secondary">Record transaction</OpenModalButton></div>
      {keyTransactions.length ? <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Lease / tenant</th><th>Key</th><th>Action</th><th>Date</th><th>Recorded by</th></tr></thead><tbody>{keyTransactions.map((item) => <tr key={item.id}><td><strong>{item.reference}</strong></td><td>{item.property_name} · {item.unit_name}<small>{item.tenant_name || item.lease_reference}</small></td><td>{item.key_type}<small>Quantity {item.quantity}</small></td><td><Badge tone={["issued", "replaced"].includes(item.action) ? "active" : "inactive"}>{item.action}</Badge></td><td>{dateLabel(item.transacted_at)}</td><td>{item.recorder_name || "Former team member"}</td></tr>)}</tbody></table></div> : <Empty icon="key" title="No key records" text="Record keys, access cards, remotes, and mailbox keys as they are issued or returned."/>}
    </section>

    <form action={createInspectionAction}><ModalForm id="inspection-create" title="Create condition inspection" description="Start a draft. Add room-by-room items, then share it with linked tenants." submitLabel="Create draft"><div className="modal-body"><label><span>Lease</span><select name="leaseId" required><option value="">Select lease</option>{leases.map((lease) => <option value={lease.id} key={lease.id}>{lease.property_name} · {lease.unit_name} · {lease.tenant_names || lease.reference}</option>)}</select></label><div className="field-grid two"><label><span>Inspection type</span><select name="inspectionType"><option value="move_in">Move-in</option><option value="periodic">Periodic</option><option value="move_out">Move-out</option></select></label><label><span>Inspection date</span><input type="date" name="scheduledFor" defaultValue={today()} required/></label></div><div className="field-grid three"><label><span>Electricity meter</span><input name="electricityMeter"/></label><label><span>Water meter</span><input name="waterMeter"/></label><label><span>Gas meter</span><input name="gasMeter"/></label></div><label><span>Summary</span><textarea name="summary" rows="4" placeholder="Overall condition, access notes, witnesses, or inspection context"/></label></div></ModalForm></form>

    <form action={uploadLeaseDocumentAction}><ModalForm id="document-upload" title="Upload lease document" description="Tenant-visible files appear in every linked resident portal. Internal files remain staff-only." submitLabel="Upload document" pendingLabel="Uploading…"><div className="modal-body"><label><span>Lease</span><select name="leaseId" required><option value="">Select lease</option>{leases.map((lease) => <option value={lease.id} key={lease.id}>{lease.property_name} · {lease.unit_name} · {lease.reference}</option>)}</select></label><label><span>Related inspection (optional)</span><select name="inspectionId"><option value="">No inspection link</option>{inspections.map((item) => <option value={item.id} key={item.id}>{item.reference} · {item.property_name} · {item.unit_name}</option>)}</select></label><div className="field-grid two"><label><span>Title</span><input name="title" required/></label><label><span>Document type</span><select name="documentType"><option>agreement</option><option>inventory</option><option>notice</option><option>inspection</option><option>handover</option><option>receipt</option><option>other</option></select></label></div><label><span>Visibility</span><select name="visibility"><option value="tenant">Tenant-visible</option><option value="internal">Internal staff only</option></select></label><label><span>PDF or image</span><input type="file" name="document" accept="application/pdf,image/jpeg,image/png,image/webp" required/><small>PDF, JPG, PNG, or WebP up to 10 MB. Stored on this server.</small></label><label><span>Notes</span><textarea name="notes" rows="3"/></label></div></ModalForm></form>

    <form action={recordKeyTransactionAction}><ModalForm id="key-record" title="Record key transaction" description="Track physical keys, access cards, remotes, and other possession items." submitLabel="Record transaction"><div className="modal-body"><label><span>Lease</span><select name="leaseId" required><option value="">Select lease</option>{leases.map((lease) => <option value={lease.id} key={lease.id}>{lease.property_name} · {lease.unit_name} · {lease.reference}</option>)}</select></label><label><span>Tenant attribution (optional)</span><select name="tenantId"><option value="">Lease-level</option>{tenants.map((tenant) => <option value={tenant.id} key={`${tenant.lease_id}-${tenant.id}`}>{tenant.property_name} · {tenant.unit_name} · {tenant.full_name}</option>)}</select></label><div className="field-grid three"><label><span>Key type</span><input name="keyType" required placeholder="Main door key"/></label><label><span>Quantity</span><input type="number" name="quantity" min="1" max="100" defaultValue="1" required/></label><label><span>Action</span><select name="keyAction"><option>issued</option><option>returned</option><option>lost</option><option>replaced</option></select></label></div><label><span>Date</span><input type="date" name="transactedAt" defaultValue={today()} required/></label><label><span>Notes</span><textarea name="notes" rows="3" placeholder="Key number, access-card ID, condition, or replacement detail"/></label></div></ModalForm></form>

    {inspections.filter((item) => item.status === "draft").map((item) => <form action={addInspectionItemAction} key={`item-${item.id}`}><ModalForm id={`inspection-item-${item.id}`} title={`Add item · ${item.reference}`} description={`${item.property_name} · ${item.unit_name} · ${item.inspection_type.replaceAll("_", " ")}`} submitLabel="Add item"><div className="modal-body"><input type="hidden" name="inspectionId" value={item.id}/><div className="field-grid two"><label><span>Area</span><input name="area" required placeholder="Bedroom, kitchen, balcony"/></label><label><span>Item</span><input name="itemName" required placeholder="Wall paint, fan, lock, mattress"/></label></div><div className="field-grid two"><label><span>Condition</span><select name="condition">{conditionOptions.map((condition) => <option value={condition} key={condition}>{condition.replaceAll("_", " ")}</option>)}</select></label><label><span>Assessed charge</span><input type="number" name="chargeAmount" min="0" step="0.01" defaultValue="0"/><small>Use only for documented damage or missing items.</small></label></div><label><span>Condition note</span><textarea name="notes" rows="4"/></label></div></ModalForm></form>)}

    {inspections.filter((item) => ["shared", "acknowledged"].includes(item.status)).map((item) => <form action={completeInspectionAction} key={`complete-${item.id}`}><ModalForm id={`inspection-complete-${item.id}`} title={`Complete ${item.reference}`} description="Completion locks the report. A move-out deduction is optional and cannot exceed the deposit held." submitLabel="Complete inspection"><div className="modal-body"><input type="hidden" name="inspectionId" value={item.id}/><div className="summary-box"><span>Checklist</span><strong>{item.item_count} item(s) · {money(item.assessed_charge, item.currency)} assessed</strong><small>{item.acknowledgement_count}/{item.tenant_count} tenant acknowledgements</small></div>{item.inspection_type === "move_out" && Number(item.assessed_charge) > 0 && ["owner", "admin"].includes(user.role) && <label className="check-card"><input type="checkbox" name="applyDeduction"/><span><strong>Post assessed amount to deposit ledger</strong><small>Creates one debit linked to this inspection. This cannot be repeated.</small></span></label>}<div className="policy-warning">Completion freezes the inspection. Tenant acknowledgement records receipt, not a legal waiver or admission.</div></div></ModalForm></form>)}
  </>;
}
