# Modular operating models

NivasaOS separates the **workspace module catalogue** from the **operating model assigned to each property**.

This design allows one self-hosted installation to operate a residential apartment portfolio, a PG, a hostel, student housing, staff accommodation, and commercial premises without mixing incompatible inventory or workflows.

## Initial module catalogue

| Module | Relevant operations |
|---|---|
| Residential rentals | Unit-level occupancy, household leases, deposits, maintenance, meter handover, resident portal |
| PG & co-living | Room and bed allocation, services, visitor register, deposits, recurring billing, resident portal |
| Hostel & dormitory | Bed-level occupancy, access items, meal/locker services, visitor movements, rapid stay lifecycle |
| Student housing | Bed allocation, student records, services, visitor oversight, term-based housing agreements |
| Staff accommodation | Employee resident allocation, included or chargeable services, visitors, handover and audit |
| Commercial rentals | Business profiles, registration/tax references, CAM, escalation, fit-out, notice terms, tenant portal |

The common finance, payment, deposit, maintenance, document, handover, authentication, audit, and reporting layers are shared.

## Workspace modules

The first-run installer requires at least one allowlisted module and records a primary module.

- Multiple modules may be enabled.
- Every property selects exactly one enabled module.
- The primary module controls onboarding defaults only.
- A module cannot be disabled while any property still uses it.
- Module configuration is owner-only.

Module definitions live in `lib/modules/catalog.js`. They contain:

- stable module ID;
- display terminology;
- capability list;
- safe starter inventory;
- legacy property-type mapping;
- portal label and icon.

## Property assignment and locking

`properties.module_id` is the authoritative operating-model identity.

A property may change modules only before operational records exist. Once units, people, agreements, invoices, or maintenance records are present, the module is locked. This avoids reinterpreting historical inventory and financial records under a different model.

Legacy migration maps:

- `boarding_house` → `pg_coliving`;
- `apartment`, `rental`, and `mixed` → `residential`.

The migration also enables every module already used by a property.

## Shared-space occupancy

Modules with the `spaceInventory` capability use two inventory layers:

1. `units`: room, dormitory, quarter, or similar container;
2. `rentable_spaces`: bed, bunk, desk, parking space, locker, or another assignable position.

Safeguards:

- active configured spaces cannot exceed unit capacity;
- a space can have only one active allocation;
- property, unit, agreement, resident, and space relationships are revalidated server-side;
- active agreement creation rechecks available spaces inside the database transaction;
- one available space is allocated per selected resident;
- allocation conflicts roll back the complete agreement operation;
- ending one agreement releases only its own spaces;
- a room remains occupied while another active agreement remains.

Draft shared-accommodation agreements do not reserve spaces. Inventory is allocated only when an agreement is created active.

## Service catalogue and billing

Modules with `servicePlans` support:

- catalogue services such as meals, laundry, Wi-Fi, housekeeping, locker, parking, utilities, or CAM;
- included, one-time, monthly, quarterly, and annual frequencies;
- lease-level or resident-specific subscriptions;
- optional custom subscription pricing;
- controlled end dates;
- normal invoices recorded in the shared finance ledger.

`service_billing_runs` enforces one invoice for each subscription and billing period. Repeated submissions cannot create duplicates.

Included services never create a separate invoice.

## Visitor register

Modules with `visitorRegister` support resident pre-registration and staff-controlled physical movement.

- A resident may create an `expected` visit for an active linked agreement.
- A resident may cancel their own visit while it remains expected.
- A resident cannot mark arrival or departure.
- Staff transition `expected → checked_in → checked_out`.
- Status updates are conditional and reject concurrent or invalid transitions.
- Visitor records remain property-scoped and auditable.

## Commercial lease profiles

The commercial module adds one profile per agreement:

- business or trading name;
- company registration and tax references;
- business activity;
- common-area maintenance charge;
- escalation percentage and date;
- fit-out deadline;
- notice period;
- commercial notes.

The profile is connected to the existing agreement, property, premises, business tenant, documents, handover, billing, and portal records rather than creating a separate commercial ledger.

## Tenant portal behavior

The portal shell derives its terminology and capabilities from the authenticated tenant's property module.

Universal portal areas:

- home;
- agreement and handover;
- billing, proofs, and receipts;
- maintenance;
- profile.

Capability-specific portal areas:

- services for `servicePlans`;
- visitors for `visitorRegister`;
- allocated bed/space records for `spaceInventory`;
- business profile and commercial terms for `commercialProfiles`.

Portal queries always start from the authenticated tenant ID or a linked agreement. Workspace module enablement never grants a tenant access to another property.

## Adding a future module

A future module should normally register a new catalogue definition and reuse existing capabilities. Add a new capability only when the data and authorization model is genuinely different.

A module contribution must include:

1. stable module ID and terminology;
2. explicit capabilities;
3. non-financial safe starter template;
4. property and tenant authorization review;
5. fresh and legacy migration coverage;
6. module-aware staff and portal UX;
7. responsive mobile review;
8. repository verifier contracts;
9. changelog and security documentation.

Do not fork common invoice, payment, deposit, maintenance, tenant authentication, or audit logic merely to change terminology.

## Deployment verification

Run on a Bun-enabled machine:

```bash
bun run verify:modules
bun run gate
```

The module verifier covers catalogue allowlisting, legacy mapping, database tables, active-space uniqueness, service billing idempotency, visitor lifecycle, commercial profiles, scoped metrics, and critical source contracts.
