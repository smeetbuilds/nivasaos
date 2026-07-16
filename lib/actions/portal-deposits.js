import { canAccessProperty, requireUser } from "@/lib/auth";
import { get, run, scalar, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { today, uid } from "@/lib/format";
import { choice, integer, number, safeRedirect, text } from "@/lib/actions/shared";
import { saveProof, validDate } from "@/lib/actions/finance-common";
import { DEPOSIT_TYPES, limitedText, paymentMethod, refreshPortalViews, removeUpload } from "@/lib/actions/portal-common";

export async function recordDepositTransactionAction(formData) {
  const actor = await requireUser();
  const leaseId = integer(formData, "leaseId");
  const lease = get("SELECT * FROM leases WHERE id=$leaseId", { leaseId });
  if (!lease || !canAccessProperty(actor, lease.property_id)) throw new Error("Lease access denied");
  const tenantId = integer(formData, "tenantId") || null;
  if (tenantId && !get("SELECT 1 FROM lease_tenants WHERE lease_id=$leaseId AND tenant_id=$tenantId", { leaseId, tenantId })) throw new Error("Tenant is not assigned to this lease");
  const amount = number(formData, "amount");
  if (amount <= 0) throw new Error("Deposit amount must be positive");
  const transactionType = choice(formData, "transactionType", DEPOSIT_TYPES, "received");
  const method = paymentMethod(formData);
  const transactedAt = validDate(text(formData, "transactedAt") || today(), "Deposit date");
  const proofPath = await saveProof(formData.get("proof"));
  try {
    transaction(() => {
      if (["refund", "debit"].includes(transactionType)) {
        const held = Number(scalar(
          "SELECT COALESCE(SUM(CASE transaction_type WHEN 'received' THEN amount WHEN 'credit' THEN amount ELSE -amount END),0) FROM deposit_transactions WHERE lease_id=$leaseId",
          { leaseId }
        ) || 0);
        if (amount > held + 0.001) throw new Error("Deposit reduction exceeds the amount currently held");
      }
      const reference = uid("DEP");
      const result = run(
        `INSERT INTO deposit_transactions (property_id,lease_id,tenant_id,reference,transaction_type,amount,method,transacted_at,proof_path,notes,recorded_by)
         VALUES ($propertyId,$leaseId,$tenantId,$reference,$transactionType,$amount,$method,$transactedAt,$proofPath,$notes,$recordedBy)`,
        {
          propertyId: lease.property_id,
          leaseId,
          tenantId,
          reference,
          transactionType,
          amount,
          method,
          transactedAt,
          proofPath,
          notes: limitedText(formData, "notes", 2000),
          recordedBy: actor.id
        }
      );
      recordAudit({ actor, action: "record", entityType: "deposit_transaction", entityId: Number(result.lastInsertRowid), propertyId: lease.property_id, summary: `Recorded deposit transaction ${reference}`, metadata: { leaseId, tenantId, amount, type: transactionType } });
    });
  } catch (error) {
    removeUpload(proofPath);
    throw error;
  }
  refreshPortalViews();
  safeRedirect("/tenant-portal", "Deposit transaction recorded");
}
