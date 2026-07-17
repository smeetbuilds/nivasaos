import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { assertPermission } from "@/lib/permissions";
import { choice, integer, number, safeRedirect } from "@/lib/actions/shared";
import { LATE_FEE_TYPES } from "@/lib/billing-rules";

export async function updateBillingPolicyAction(formData) {
  const user = await requireUser();
  const propertyId = integer(formData, "propertyId");
  assertPermission(user, "billing.manage", propertyId);
  const property = get("SELECT name FROM properties WHERE id=$propertyId", { propertyId });
  if (!property) throw new Error("Property not found");

  const graceDays = integer(formData, "graceDays");
  if (graceDays < 0 || graceDays > 60) throw new Error("Grace days must be between 0 and 60");
  const lateFeeType = choice(formData, "lateFeeType", LATE_FEE_TYPES, "none");
  let lateFeeValue = number(formData, "lateFeeValue");
  let lateFeeCap = number(formData, "lateFeeCap", 0);
  if (lateFeeValue < 0 || lateFeeCap < 0) throw new Error("Late fee values cannot be negative");
  if (lateFeeType === "percent" && lateFeeValue > 100) throw new Error("Percentage late fees cannot exceed 100%");
  if (lateFeeType === "none") {
    lateFeeValue = 0;
    lateFeeCap = 0;
  } else if (lateFeeValue <= 0) throw new Error("Enter a positive late fee value");

  const before = get("SELECT * FROM billing_policies WHERE property_id=$propertyId", { propertyId });
  transaction(() => {
    run(
      `INSERT INTO billing_policies (property_id,grace_days,late_fee_type,late_fee_value,late_fee_cap,updated_by,updated_at)
       VALUES ($propertyId,$graceDays,$lateFeeType,$lateFeeValue,$lateFeeCap,$userId,CURRENT_TIMESTAMP)
       ON CONFLICT(property_id) DO UPDATE SET
         grace_days=excluded.grace_days,
         late_fee_type=excluded.late_fee_type,
         late_fee_value=excluded.late_fee_value,
         late_fee_cap=excluded.late_fee_cap,
         updated_by=excluded.updated_by,
         updated_at=CURRENT_TIMESTAMP`,
      { propertyId, graceDays, lateFeeType, lateFeeValue, lateFeeCap: lateFeeCap || null, userId: user.id }
    );
    recordAudit({
      actor: user,
      action: "settings",
      entityType: "billing_policy",
      entityId: propertyId,
      propertyId,
      summary: `Updated late-fee policy for ${property.name}`,
      metadata: {
        previous: before ? { graceDays: before.grace_days, type: before.late_fee_type, value: before.late_fee_value, cap: before.late_fee_cap } : null,
        current: { graceDays, type: lateFeeType, value: lateFeeValue, cap: lateFeeCap || null }
      }
    });
  });

  revalidatePath("/billing"); revalidatePath("/invoices"); revalidatePath("/dashboard"); revalidatePath("/audit");
  safeRedirect("/billing", `Billing policy saved for ${property.name}`);
}
