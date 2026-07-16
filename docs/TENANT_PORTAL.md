# Tenant portal operations

The tenant portal is a self-hosted resident account area under `/portal`. It uses separate accounts and sessions from owner/admin/staff access.

## Recommended onboarding

1. Create the tenant profile with a unique email address.
2. Create and activate the lease, including every resident who may view the shared household ledger.
3. Open **Tenant portal** and create the one-time invitation.
4. Share the link privately. It expires after seven days and is invalid after password setup.
5. Ask the resident to sign in at `/portal/login` and verify their home, billing, and profile details.

## Payment proof workflow

A tenant selects an invoice, enters the amount/date/reference, and uploads JPG, PNG, WebP, or PDF proof. The submission remains pending and reserves that amount against duplicate submissions, but the official invoice balance is unchanged. Staff inspect the proof and either:

- approve it, which atomically creates the payment and updates the invoice; or
- reject it with a resident-visible reason.

Only approved payments generate official printable receipts.

## Deposit workflow

Deposits are intentionally separate from rent payments. Staff record received amounts, refunds, credits, or debits against a lease. The portal shows:

- the contractual deposit requirement;
- the calculated amount currently held;
- every movement and its printable record.

Outgoing movements cannot exceed the amount currently held.

## Shared leases and privacy

Residents linked to the same lease can see shared lease invoices, approved payment activity, and lease-level deposit movements. Receipts identify the actual payer when a payment is attributed to another resident. Personal profile and payment-proof submission records remain tenant-scoped.

## Maintenance communication

Residents can report issues only for active homes linked to them. Tenant-visible updates and internal staff notes are separate. Status transitions are visible to the resident, and resolved tickets no longer accept resident replies.

## Account recovery and disabling

Creating a new link for an active account produces a password-reset link. Disabling access revokes portal sessions and outstanding invites without deleting historical tenant, lease, payment, receipt, deposit, or maintenance records.
