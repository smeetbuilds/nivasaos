import { requireUser } from "@/lib/auth";
import { get, run, scalar, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { assertPermission } from "@/lib/permission-core";
import { today, uid } from "@/lib/format";
import { choice, integer, safeRedirect, text } from "@/lib/actions/shared";
import { saveProof, validDate } from "@/lib/actions/finance-common";
import { DEPOSIT_TYPES, limitedText, paymentMethod, refreshPortalViews, removeUpload } from "@/lib/actions/portal-common";
import { MAX_MONEY_MINOR, moneyInput } from "@/lib/money";

export async function recordDepositTransactionAction(formData) {
  const actor = await requireUser();
  const leaseId = integer(formData, "leaseId");
  const lease = get("SELECT * FROM leases WHERE id=$leaseId", { leaseId });
  if (!lease) throw new Error("Lease not found");
  assertPermission(actor, "deposits.manage", lease.property_id);
  const tenantId = integer(formData, "tenantId") || null;
  if (tenantId && !get("SELECT 1 FROM lease_tenants WHERE lease_id=$leaseId AND tenant_id=$tenantId", { leaseId, tenantId })) throw new Error("Tenant is not assigned to this lease");
  const amount = moneyInput(formData, "amount", { label: "Deposit amount", minMinor: 1 });
  const transactionType = choice(formData, "transactionType", DEPOSIT_TYPES, "received");
  const method = paymentMethod(formData);
  const transactedAt = validDate(text(formData, "transactedAt") || today(), "Deposit date");
  const proofPath = await saveProof(formData.get("proof"));
  try {
    transaction(() => {
      if (["refund", "debit"].includes(transactionType)) {
        const heldMinor = Number(scalar(
          `SELECT COALESCE(SUM(CASE transaction_type
             WHEN 'received' THEN CAST(ROUND(amount*100) AS INTEGER)
             WHEN 'credit' THEN CAST(ROUND(amount*100) AS INTEGER)
             ELSE -CAST(ROUND(amount*100) AS INTEGER) END),0)
           FROM deposit_transactions WHERE lease_id=$leaseId`,
          { leaseId }
        ) || 0);
        if (!Number.isSafeInteger(heldMinor) || heldMinor < 0 || heldMinor > MAX_MONEY_MINOR) {
          throw new Error("Held deposit balance is outside the supported monetary range");
        }
        if (amount.minor > heldMinor) throw new Error("Deposit reduction exceeds the amount currently held");
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
          amount: amount.value,
          method,
          transactedAt,
          proofPath,
          notes: limitedText(formData, "notes", 2000),
          recordedBy: actor.id
        }
      );
      recordAudit({ actor, action: "record", entityType: "deposit_transaction", entityId: Number(result.lastInsertRowid), propertyId: lease.property_id, summary: `Recorded deposit transaction ${reference}`, metadata: { leaseId, tenantId, amount: amount.value, amountMinor: amount.minor, type: transactionType } });
    });
  } catch (error) {
    removeUpload(proofPath);
    throw error;
  }
  refreshPortalViews();
  safeRedirect("/tenant-portal", "Deposit transaction recorded");
}
