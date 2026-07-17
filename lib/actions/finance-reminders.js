import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { assertPermission } from "@/lib/permissions";
import { integer, text } from "@/lib/actions/shared";

export async function logReminderAction(formData) {
  const user = await requireUser();
  const invoiceId = integer(formData, "invoiceId");
  const invoice = get("SELECT i.*,t.phone,t.id tenant_id FROM invoices i LEFT JOIN tenants t ON t.id=i.tenant_id WHERE i.id=$invoiceId", { invoiceId });
  if (!invoice) throw new Error("Invoice not found");
  assertPermission(user, "billing.manage", invoice.property_id);
  transaction(() => {
    run(
      `INSERT INTO notification_log (property_id,tenant_id,invoice_id,driver,recipient,message,status,created_by)
       VALUES ($propertyId,$tenantId,$invoiceId,'whatsapp_link',$recipient,$message,'prepared',$userId)`,
      { propertyId: invoice.property_id, tenantId: invoice.tenant_id, invoiceId, recipient: invoice.phone || "unknown", message: text(formData, "message", true), userId: user.id }
    );
    recordAudit({ actor: user, action: "notify", entityType: "invoice", entityId: invoiceId, propertyId: invoice.property_id, summary: `Prepared WhatsApp reminder for ${invoice.number}`, metadata: { driver: "whatsapp_link" } });
  });
  revalidatePath("/invoices"); revalidatePath("/audit");
}
