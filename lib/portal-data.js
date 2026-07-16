import "server-only";
import { all, get } from "@/lib/db";

const invoiceAccess = `(
  i.tenant_id=$tenantId OR
  EXISTS (SELECT 1 FROM lease_tenants access_lt WHERE access_lt.lease_id=i.lease_id AND access_lt.tenant_id=$tenantId)
)`;

const paymentAccess = `(
  pay.tenant_id=$tenantId OR
  EXISTS (
    SELECT 1 FROM invoices access_i
    JOIN lease_tenants access_lt ON access_lt.lease_id=access_i.lease_id
    WHERE access_i.id=pay.invoice_id AND access_lt.tenant_id=$tenantId
  )
)`;

export function portalDashboardData(tenantId) {
  const activeLease = get(
    `SELECT l.*,p.name property_name,p.address property_address,p.city,p.country,p.currency,
      u.name unit_name,u.unit_type,u.floor,
      COALESCE((SELECT SUM(CASE dt.transaction_type WHEN 'received' THEN dt.amount WHEN 'credit' THEN dt.amount ELSE -dt.amount END) FROM deposit_transactions dt WHERE dt.lease_id=l.id),0) deposit_held,
      (SELECT GROUP_CONCAT(t2.full_name, ', ') FROM lease_tenants lt2 JOIN tenants t2 ON t2.id=lt2.tenant_id WHERE lt2.lease_id=l.id) resident_names
     FROM leases l
     JOIN lease_tenants lt ON lt.lease_id=l.id
     JOIN properties p ON p.id=l.property_id
     JOIN units u ON u.id=l.unit_id
     WHERE lt.tenant_id=$tenantId AND l.status='active'
     ORDER BY l.start_date DESC LIMIT 1`,
    { tenantId: Number(tenantId) }
  );
  const outstanding = all(
    `SELECT p.currency,COUNT(*) invoice_count,SUM(i.amount-i.amount_paid) balance
     FROM invoices i JOIN properties p ON p.id=i.property_id
     WHERE ${invoiceAccess} AND i.status NOT IN ('paid','void') AND i.amount>i.amount_paid
     GROUP BY p.currency ORDER BY p.currency`,
    { tenantId: Number(tenantId) }
  );
  const nextInvoice = get(
    `SELECT i.*,p.currency,p.name property_name
     FROM invoices i JOIN properties p ON p.id=i.property_id
     WHERE ${invoiceAccess} AND i.status NOT IN ('paid','void') AND i.amount>i.amount_paid
     ORDER BY i.due_date ASC,i.id ASC LIMIT 1`,
    { tenantId: Number(tenantId) }
  );
  const recentPayments = all(
    `SELECT pay.id,pay.reference,pay.amount,pay.method,pay.paid_at,p.currency,i.number invoice_number,payer.full_name payer_name
     FROM payments pay JOIN properties p ON p.id=pay.property_id LEFT JOIN invoices i ON i.id=pay.invoice_id
     LEFT JOIN tenants payer ON payer.id=pay.tenant_id
     WHERE ${paymentAccess}
     ORDER BY pay.paid_at DESC,pay.id DESC LIMIT 5`,
    { tenantId: Number(tenantId) }
  );
  const openTickets = get(
    "SELECT COUNT(*) total FROM maintenance_tickets WHERE tenant_id=$tenantId AND status!='resolved'",
    { tenantId: Number(tenantId) }
  );
  const pendingSubmissions = get(
    "SELECT COUNT(*) total FROM payment_submissions WHERE tenant_id=$tenantId AND status='pending'",
    { tenantId: Number(tenantId) }
  );
  return { activeLease, outstanding, nextInvoice, recentPayments, openTickets: Number(openTickets?.total || 0), pendingSubmissions: Number(pendingSubmissions?.total || 0) };
}

export function portalBillingData(tenantId) {
  const invoices = all(
    `SELECT i.*,p.name property_name,p.currency,l.reference lease_reference,u.name unit_name,
      COALESCE((SELECT SUM(ps.amount) FROM payment_submissions ps WHERE ps.invoice_id=i.id AND ps.status='pending'),0) pending_amount
     FROM invoices i
     JOIN properties p ON p.id=i.property_id
     LEFT JOIN leases l ON l.id=i.lease_id
     LEFT JOIN units u ON u.id=l.unit_id
     WHERE ${invoiceAccess}
     ORDER BY CASE WHEN i.status NOT IN ('paid','void') AND i.due_date<date('now') THEN 0 ELSE 1 END,i.due_date DESC,i.id DESC`,
    { tenantId: Number(tenantId) }
  );
  const payments = all(
    `SELECT pay.*,p.name property_name,p.currency,i.number invoice_number,u.name unit_name,payer.full_name payer_name
     FROM payments pay
     JOIN properties p ON p.id=pay.property_id
     LEFT JOIN invoices i ON i.id=pay.invoice_id
     LEFT JOIN leases l ON l.id=i.lease_id
     LEFT JOIN units u ON u.id=l.unit_id
     LEFT JOIN tenants payer ON payer.id=pay.tenant_id
     WHERE ${paymentAccess}
     ORDER BY pay.paid_at DESC,pay.id DESC`,
    { tenantId: Number(tenantId) }
  );
  const submissions = all(
    `SELECT ps.*,p.name property_name,p.currency,i.number invoice_number,i.amount invoice_amount,i.amount_paid,
      pay.reference payment_reference
     FROM payment_submissions ps
     JOIN properties p ON p.id=ps.property_id
     LEFT JOIN invoices i ON i.id=ps.invoice_id
     LEFT JOIN payments pay ON pay.id=ps.payment_id
     WHERE ps.tenant_id=$tenantId
     ORDER BY ps.created_at DESC,ps.id DESC`,
    { tenantId: Number(tenantId) }
  );
  return { invoices, payments, submissions };
}

export function portalLeaseData(tenantId) {
  const leases = all(
    `SELECT l.*,p.name property_name,p.address property_address,p.city,p.country,p.currency,
      u.name unit_name,u.unit_type,u.floor,
      COALESCE((SELECT SUM(CASE dt.transaction_type WHEN 'received' THEN dt.amount WHEN 'credit' THEN dt.amount ELSE -dt.amount END) FROM deposit_transactions dt WHERE dt.lease_id=l.id),0) deposit_held,
      (SELECT GROUP_CONCAT(t2.full_name, ', ') FROM lease_tenants lt2 JOIN tenants t2 ON t2.id=lt2.tenant_id WHERE lt2.lease_id=l.id) resident_names
     FROM leases l
     JOIN lease_tenants lt ON lt.lease_id=l.id
     JOIN properties p ON p.id=l.property_id
     JOIN units u ON u.id=l.unit_id
     WHERE lt.tenant_id=$tenantId
     ORDER BY CASE l.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,l.start_date DESC`,
    { tenantId: Number(tenantId) }
  );
  const deposits = all(
    `SELECT dt.*,p.name property_name,p.currency,l.reference lease_reference,u.name unit_name,attributed.full_name attributed_tenant_name
     FROM deposit_transactions dt
     JOIN leases l ON l.id=dt.lease_id
     JOIN lease_tenants lt ON lt.lease_id=l.id
     JOIN properties p ON p.id=dt.property_id
     JOIN units u ON u.id=l.unit_id
     LEFT JOIN tenants attributed ON attributed.id=dt.tenant_id
     WHERE lt.tenant_id=$tenantId
     ORDER BY dt.transacted_at DESC,dt.id DESC`,
    { tenantId: Number(tenantId) }
  );
  return { leases, deposits };
}

export function portalMaintenanceData(tenantId) {
  const leases = all(
    `SELECT l.id,l.reference,l.property_id,l.unit_id,p.name property_name,u.name unit_name
     FROM leases l JOIN lease_tenants lt ON lt.lease_id=l.id JOIN properties p ON p.id=l.property_id JOIN units u ON u.id=l.unit_id
     WHERE lt.tenant_id=$tenantId AND l.status='active' ORDER BY p.name,u.name`,
    { tenantId: Number(tenantId) }
  );
  const tickets = all(
    `SELECT mt.*,p.name property_name,u.name unit_name,assignee.name assigned_name
     FROM maintenance_tickets mt
     JOIN properties p ON p.id=mt.property_id
     LEFT JOIN units u ON u.id=mt.unit_id
     LEFT JOIN users assignee ON assignee.id=mt.assigned_to
     WHERE mt.tenant_id=$tenantId
     ORDER BY CASE mt.status WHEN 'reported' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,mt.updated_at DESC`,
    { tenantId: Number(tenantId) }
  );
  const ticketIds = tickets.map((ticket) => Number(ticket.id));
  const comments = ticketIds.length ? all(
    `SELECT mc.*,u.name user_name,t.full_name tenant_name
     FROM maintenance_comments mc
     LEFT JOIN users u ON u.id=mc.actor_user_id
     LEFT JOIN tenants t ON t.id=mc.actor_tenant_id
     WHERE mc.visibility='tenant' AND mc.ticket_id IN (${ticketIds.map(() => "?").join(",")})
     ORDER BY mc.created_at ASC,mc.id ASC`,
    ticketIds
  ) : [];
  const commentsByTicket = comments.reduce((map, comment) => {
    const key = Number(comment.ticket_id);
    if (!map[key]) map[key] = [];
    map[key].push(comment);
    return map;
  }, {});
  return { leases, tickets, commentsByTicket };
}
