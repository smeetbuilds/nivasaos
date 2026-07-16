import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { canAccessProperty, requireUser } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { today, uid } from "@/lib/format";
import { assertProperty, integer, number, safeRedirect, text } from "@/lib/actions/shared";

export async function createInvoiceAction(formData) {
  const user = await requireUser();
  const propertyId = await assertProperty(formData, user);
  const leaseId = integer(formData, "leaseId") || null;
  const tenantId = integer(formData, "tenantId") || null;
  if (leaseId && !get("SELECT 1 FROM leases WHERE id=$leaseId AND property_id=$propertyId", { leaseId, propertyId })) throw new Error("Invalid lease");
  if (tenantId && !get("SELECT 1 FROM tenants WHERE id=$tenantId AND property_id=$propertyId", { tenantId, propertyId })) throw new Error("Invalid tenant");
  const invoiceAmount = number(formData, "amount");
  if (invoiceAmount <= 0) throw new Error("Invoice amount must be positive");
  run(
    `INSERT INTO invoices (property_id,lease_id,tenant_id,number,description,issue_date,due_date,amount,status)
     VALUES ($propertyId,$leaseId,$tenantId,$number,$description,$issueDate,$dueDate,$amount,'issued')`,
    {
      propertyId, leaseId, tenantId,
      number: uid("INV"),
      description: text(formData, "description", true),
      issueDate: text(formData, "issueDate") || today(),
      dueDate: text(formData, "dueDate", true),
      amount: invoiceAmount
    }
  );
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  safeRedirect("/invoices", "Invoice created");
}

async function saveProof(file) {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error("Proof file must be 5 MB or smaller");
  const allowed = new Map([
    ["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"], ["application/pdf", ".pdf"]
  ]);
  const ext = allowed.get(file.type);
  if (!ext) throw new Error("Proof must be JPG, PNG, WebP, or PDF");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (from, length) => String.fromCharCode(...bytes.slice(from, from + length));
  const valid =
    (ext === ".jpg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (ext === ".png" && bytes[0] === 0x89 && ascii(1, 3) === "PNG") ||
    (ext === ".webp" && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") ||
    (ext === ".pdf" && ascii(0, 5) === "%PDF-");
  if (!valid) throw new Error("The uploaded proof content does not match its file type");
  const directory = path.resolve(process.env.NIVASA_UPLOAD_DIR || "./storage/uploads");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = `${Date.now()}-${randomBytes(10).toString("hex")}${ext}`;
  const destination = path.join(directory, filename);
  await Bun.write(destination, bytes);
  try { fs.chmodSync(destination, 0o600); } catch {}
  return filename;
}

export async function recordPaymentAction(formData) {
  const user = await requireUser();
  const propertyId = await assertProperty(formData, user);
  const invoiceId = integer(formData, "invoiceId") || null;
  const tenantId = integer(formData, "tenantId") || null;
  const amount = number(formData, "amount");
  if (amount <= 0) throw new Error("Payment amount must be positive");
  let invoice = null;
  if (invoiceId) {
    invoice = get("SELECT * FROM invoices WHERE id=$invoiceId AND property_id=$propertyId", { invoiceId, propertyId });
    if (!invoice || ["paid", "void"].includes(invoice.status)) throw new Error("Invoice cannot receive a payment");
    const balance = Number(invoice.amount) - Number(invoice.amount_paid);
    if (amount > balance + 0.001) throw new Error("Payment exceeds invoice balance");
  }
  if (tenantId && !get("SELECT 1 FROM tenants WHERE id=$tenantId AND property_id=$propertyId", { tenantId, propertyId })) throw new Error("Invalid tenant");
  const proofPath = await saveProof(formData.get("proof"));
  try {
    transaction(() => {
      run(
        `INSERT INTO payments (property_id,invoice_id,tenant_id,reference,amount,method,paid_at,proof_path,notes,recorded_by)
       VALUES ($propertyId,$invoiceId,$tenantId,$reference,$amount,$method,$paidAt,$proofPath,$notes,$userId)`,
      {
        propertyId, invoiceId, tenantId, amount, proofPath, userId: user.id,
        reference: uid("PAY"),
        method: text(formData, "method") || "bank_transfer",
        paidAt: text(formData, "paidAt") || today(),
        notes: text(formData, "notes")
      }
    );
      if (invoice) {
        const newPaid = Number(invoice.amount_paid) + amount;
        const newStatus = newPaid >= Number(invoice.amount) ? "paid" : "part_paid";
        run("UPDATE invoices SET amount_paid=$newPaid,status=$newStatus,updated_at=CURRENT_TIMESTAMP WHERE id=$invoiceId", { newPaid, newStatus, invoiceId });
      }
    });
  } catch (error) {
    if (proofPath) {
      const filePath = path.join(path.resolve(process.env.NIVASA_UPLOAD_DIR || "./storage/uploads"), path.basename(proofPath));
      try { fs.unlinkSync(filePath); } catch {}
    }
    throw error;
  }
  revalidatePath("/payments");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  safeRedirect("/payments", "Payment recorded");
}

export async function logReminderAction(formData) {
  const user = await requireUser();
  const invoiceId = integer(formData, "invoiceId");
  const invoice = get("SELECT i.*,t.phone,t.id tenant_id FROM invoices i LEFT JOIN tenants t ON t.id=i.tenant_id WHERE i.id=$invoiceId", { invoiceId });
  if (!invoice || !canAccessProperty(user, invoice.property_id)) throw new Error("Invoice access denied");
  run(
    `INSERT INTO notification_log (property_id,tenant_id,invoice_id,driver,recipient,message,status,created_by)
     VALUES ($propertyId,$tenantId,$invoiceId,'whatsapp_link',$recipient,$message,'prepared',$userId)`,
    {
      propertyId: invoice.property_id,
      tenantId: invoice.tenant_id,
      invoiceId,
      recipient: invoice.phone || "unknown",
      message: text(formData, "message", true),
      userId: user.id
    }
  );
  revalidatePath("/invoices");
}
