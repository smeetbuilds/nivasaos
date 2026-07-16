# Lease handover and possession records

NivasaOS v0.8 adds a self-hosted evidence trail for move-in, periodic checks, move-out, tenant-visible documents, meter readings, keys, acknowledgements, and optional deposit deductions.

## Recommended move-in workflow

1. Create or activate the lease.
2. Open **Handover** and create a **Move-in** inspection.
3. Record meter readings and add room-by-room condition items.
4. Upload the signed agreement, inventory, photographs, or PDF report with **Tenant-visible** access where appropriate.
5. Record every key, access card, remote, or mailbox key issued.
6. Share the inspection with the tenants.
7. Ask each resident to review and acknowledge receipt in the tenant portal.
8. Complete the inspection when the operational record is final.

## Tenant acknowledgement

Acknowledgement is deliberately described as confirmation of receipt and review. It is not presented as an electronic signature, admission of damage, waiver, or replacement for jurisdiction-specific tenancy documentation.

Tenants may add a note while acknowledging. That note is retained with the inspection and appears in the audit history.

## Document visibility

- **Tenant-visible:** every tenant linked to the lease can open the file in the resident portal.
- **Internal:** only authenticated staff with access to the property can open the file.
- **Archived:** hidden from current workspace lists and unavailable to tenants, while the database history and local file remain preserved.

Only PDF, JPG, PNG, and WebP files up to 10 MB are accepted. NivasaOS validates MIME type, file size, and file signatures, stores random server-side names, and serves files through authenticated routes with private no-store headers.

Do not upload passwords, OTPs, full payment-card details, unnecessary identity documents, or unrelated personal records.

## Key ledger

Record issued, returned, lost, and replaced keys separately. A return or loss cannot exceed the tracked quantity outstanding for that key type. If any tracked key items remain outstanding, NivasaOS blocks lease move-out until they are returned or recorded lost.

## Move-out and deposit deductions

1. Create a **Move-out** inspection.
2. Add condition items and assessed charges only where there is documented damage or a missing item.
3. Share the report with tenants and retain their notes.
4. Complete the report.
5. Owners and admins may optionally post the total assessed amount as one deposit debit.

Safeguards:

- deductions are available only from move-out inspections;
- the assessed total cannot exceed the deposit currently held;
- one deposit transaction can be linked to only one inspection;
- completing the same inspection again cannot create another deduction;
- the lease cannot end while an existing move-out inspection remains incomplete;
- the deposit ledger remains separate from rent payments.

A property operator remains responsible for complying with local tenancy, notice, evidence, deposit-protection, deduction, tax, and dispute-resolution requirements.

## Backup requirements

Uploaded lease documents use the same authenticated local upload directory as payment and deposit proofs. The built-in backup command includes this directory. Copy backups off-host and encrypt them according to the sensitivity of the records stored.
