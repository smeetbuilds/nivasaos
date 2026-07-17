# Modular operating models

NivasaOS separates the **workspace module catalogue** from the **operating model assigned to each property**. One installation can operate residential rentals, PGs, hostels, student residences, staff accommodation and commercial premises without mixing incompatible records or duplicating the trusted finance and security core.

## Operating contracts

| Module | Domain-specific operations |
|---|---|
| Residential rentals | Household tenancies, renewal and notice requests, utility recovery, escalation controls, deposits and meter handover |
| PG & co-living | Bed allocation, lock-in and notice rules, meals, utilities, visitors, housekeeping, complaints and room transfers |
| Hostel & dormitory | Date-bound reservations, bed availability, arrivals, check-in/out, no-shows, guest identity and turnover housekeeping |
| Student housing | Student/member IDs, institution and programme, academic terms, guardian details, curfew, leave and overnight absence |
| Staff accommodation | Employee ID, employer, department, designation, payroll recovery, eligibility, site transfers and HR-linked move-out |
| Commercial rentals | Business profiles, tax references, CAM, escalation, fit-out, compliance, access, renewal and break notices |

Common invoices, payments, deposits, maintenance, documents, handover, authentication, audit and reporting remain shared.

## Workspace and property identity

- The installer requires at least one allowlisted module.
- Multiple modules can be enabled in one workspace.
- Every property selects exactly one enabled module.
- The primary module controls initial onboarding defaults only.
- A module cannot be disabled while a property uses it.
- Module governance is owner-only.

`properties.module_id` is authoritative. A completely unused property may change modules even when it has an inherited default configuration. The database resets that default configuration to the target module. Customized operating rules or any operational history lock the module to prevent reinterpretation of historical data.

## Conditional onboarding

The installer persists module-specific defaults in `workspace_modules.settings_json`. Examples include:

- notice, renewal and utility policies;
- PG lock-in, meal, visitor and electricity rules;
- hostel check-in, checkout, identity and turnover settings;
- academic term, guardian, curfew and leave policies;
- employer, HR, payroll and eligibility policies;
- tax, CAM, escalation and fit-out rules.

New properties inherit the selected module defaults with `is_customized=0`. Saving property-specific rules marks the configuration customized and locks module identity.

## Vertical profiles and requests

`resident_vertical_profiles` stores only the fields declared by the property module’s contract. `module_requests` provides a shared, auditable state model for module-specific workflows.

Request integrity rules:

- the tenant and optional agreement must belong to the property;
- exactly one staff or tenant creator is required;
- portal request types are allowlisted by module;
- cancellation and review use conditional state updates;
- approved requests can only be completed or cancelled;
- every mutation is audited.

## Shared-space occupancy

Modules with `spaceInventory` use:

1. `units` as the room, dormitory, quarter or container;
2. `rentable_spaces` as beds, bunks, desks, parking, lockers or other assignable positions.

Safeguards include capacity enforcement, one active allocation per space, exact optional space selection, unrestricted-only automatic allocation, space-derived pricing and atomic agreement allocation. Ending one agreement releases only its spaces.

## Hostel reservations

Hostel reservations are date-bound and separate from long-stay agreements. The application and SQLite both enforce:

- property, room and bed relationships;
- valid arrival/departure windows;
- no overlapping active reservations for one bed;
- no overlap with active resident allocations;
- no resident allocation over an active reservation;
- controlled reservation transitions;
- automatic turnover work after checkout.

Adjacent stays are allowed when the first departure date equals the next arrival date.

## Services and bulk billing

Services support included, one-time, monthly, quarterly and annual frequencies. A service can be agreement-level or resident-specific with optional custom pricing.

`service_billing_runs` enforces one invoice per subscription and period. `bulk_jobs` records property-wide previews, runs, results and failures. A batch fingerprint allows newly eligible subscriptions to be billed later in the same period without rebilling completed subscriptions.

## Housekeeping

Housekeeping tasks cover turnover, routine/deep cleaning, linen, inspections and locker resets. Unit, space, reservation and assignee relationships are database validated. The assignee must be an active owner or have access to the property.

## Permission architecture

Property assignment is the hard reachability boundary. `permission_grants` applies explicit global or property-specific allow/deny overrides on top of role defaults.

- A property-specific grant cannot exceed the user’s assigned properties.
- Global grants are unique despite the NULL property scope.
- Effective portfolio navigation is the union of global and assigned-property permissions.
- Server Actions recheck both property access and action permission.
- Permission changes revoke active sessions.

## Tenant and business portals

Portal terminology and actions come from the authenticated tenant’s property module. Universal areas cover home/agreement, billing, receipts, deposits, maintenance, documents and profile. Module-specific areas cover spaces, services, visitors, commercial terms and requests.

Mobile portals use four primary actions plus a More bottom sheet to avoid overcrowding. Every portal query starts from the authenticated tenant or a linked agreement.

## Adding a future module

A new module contribution must include:

1. stable ID and terminology;
2. explicit capabilities and vertical contract;
3. conditional onboarding fields;
4. safe non-financial starter data;
5. property, tenant and permission review;
6. fresh and legacy migrations;
7. staff and portal workflows;
8. responsive and accessibility contracts;
9. executable repository verification;
10. changelog, security and production documentation.

Do not fork invoice, payment, deposit, maintenance, authentication or audit logic merely to change terminology.

## Verification

```bash
bun run verify:modules
bun run verify:verticals
bun run verify:release
bun run gate
```

The mandatory release gate is self-hosted and does not depend on GitHub Actions.
