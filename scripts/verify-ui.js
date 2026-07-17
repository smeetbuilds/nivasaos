import fs from "node:fs";
import path from "node:path";
import { SEMANTIC_TONES, STATUS_TONES, normalizeStatus } from "../lib/statuses.js";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contains = (source, value, message) => assert(source.includes(value), message);
const excludes = (source, value, message) => assert(!source.includes(value), message);

function sourceFiles(directory) {
  const absolute = path.join(root, directory);
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(child);
    return entry.isFile() && /\.(js|jsx)$/.test(entry.name) ? [child] : [];
  });
}

const shell = read("components/AppShell.js");
const modal = read("components/ModalForm.js");
const modalTrigger = read("components/OpenModalButton.js");
const actionButton = read("components/ActionButton.js");
const confirmAction = read("components/ConfirmAction.js");
const badge = read("components/Badge.js");
const pageHeader = read("components/PageHeader.js");
const flash = read("components/Flash.js");
const permissions = read("lib/permissions.js");
const invoiceWorkspace = read("app/(workspace)/invoices/workspace.js");
const invoicePage = read("app/(workspace)/invoices/page.js");
const invoiceTable = read("app/(workspace)/invoices/InvoiceTable.js");
const operations = read("app/(workspace)/operations/page.js");
const tenantPage = read("app/(workspace)/tenants/page.js");
const leasePage = read("app/(workspace)/leases/page.js");
const maintenancePage = read("app/(workspace)/maintenance/page.js");
const teamPage = read("app/(workspace)/team/page.js");
const settingsPage = read("app/(workspace)/settings/page.js");
const modulesPage = read("app/(workspace)/modules/page.js");
const reservationsPage = read("app/(workspace)/reservations/page.js");
const propertyActions = read("lib/actions/properties.js");
const leaseActions = read("lib/actions/leases.js");
const maintenanceActions = read("lib/actions/maintenance.js");
const teamActions = read("lib/actions/team.js");
const settingsActions = read("lib/actions/settings.js");
const moduleActions = read("lib/actions/modules.js");
const portalMaintenanceActions = read("lib/actions/portal-maintenance.js");
const globals = read("app/globals.css");
const contractCss = read("app/styles/part-13.css");

contains(shell, "mobile-drawer", "Responsive shell is missing the mobile navigation drawer.");
contains(shell, "mobile-bottom-nav", "Responsive shell is missing the mobile bottom navigation.");
contains(shell, 'aria-current={active ? "page" : undefined}', "Navigation does not expose active route semantics.");
contains(shell, "inert={!drawerOpen}", "Closed mobile navigation must be removed from keyboard focus.");
contains(shell, 'hasModule("hostel")', "Reservations navigation must be gated by the Hostel module.");
excludes(shell, "new MutationObserver", "Tables must not be rewritten after hydration.");
excludes(shell, "dataset.mobileReady", "Responsive tables must not depend on client-side mutation markers.");

contains(modalTrigger, "icon = null", "Modal triggers must not silently receive a creation icon.");
contains(modalTrigger, 'aria-haspopup="dialog"', "Modal triggers must expose dialog semantics.");
contains(modalTrigger, "aria-controls={target}", "Modal triggers must identify their controlled dialog.");
contains(modal, "aria-describedby={descriptionId}", "Dialog descriptions must be programmatically associated.");
contains(modal, 'data-intent={intent}', "Dialogs must expose semantic intent.");
contains(modal, 'intent === "danger"', "Dialogs must support destructive submit treatment.");
contains(actionButton, "useFormStatus", "Server Action buttons must expose a pending state.");
contains(confirmAction, 'intent="danger"', "Destructive confirmations must use the shared danger contract.");
contains(invoiceTable, "<ConfirmAction", "Invoice voiding must use the shared confirmation contract.");
excludes(invoiceTable, "danger-link", "Legacy destructive-action classes must not be used.");

contains(pageHeader, '<header className="page-header">', "PageHeader must render semantic header markup.");
contains(flash, 'role={error ? "alert" : "status"}', "Flash messages must expose alert or status semantics.");
contains(badge, "toneForStatus", "Badges must resolve through the explicit status registry.");
for (const status of ["submitted", "approved", "rejected", "completed", "reserved", "checked_in", "checked_out", "no_show", "open", "blocked", "pending", "invited", "expected"]) {
  assert(Boolean(STATUS_TONES[status]), `Status registry is missing ${status}.`);
}

contains(permissions, "PROPERTY_SCOPED_PERMISSIONS", "Permission scope classification is missing.");
contains(permissions, "propertyIdsForPermission", "Property permission resolution is missing.");
contains(permissions, "permissionScopeSql", "Property-scoped SQL authorization is missing.");
contains(permissions, "requirePortfolioPermission", "Page-level portfolio permission enforcement is missing.");
contains(invoiceWorkspace, 'permissionScopeSql(user, "billing.manage", "p")', "Invoice data must be scoped by billing permission.");
contains(invoicePage, 'requirePortfolioPermission("billing.manage")', "Invoice route must enforce billing permission.");
contains(invoiceTable, "row.canManageBilling", "Invoice row actions must use property-specific permission state.");
contains(operations, 'hasPermission(user, "requests.review", request.property_id)', "Request row actions must use property-specific permission checks.");
excludes(operations, "const canReview =", "Portfolio-wide request-review booleans must not drive row actions.");

contains(tenantPage, 'requirePortfolioPermission("people.manage")', "People route must enforce people.manage.");
contains(tenantPage, 'permissionScopeSql(user, "people.manage", "p")', "People data must be property-permission scoped.");
contains(propertyActions, 'assertPermission(actor, "people.manage", propertyId)', "Tenant creation must enforce people.manage.");
contains(propertyActions, 'assertPermission(actor, "people.manage", before.property_id)', "Tenant updates must enforce people.manage per row property.");
contains(leasePage, 'requirePortfolioPermission("agreements.manage")', "Agreement route must enforce agreements.manage.");
contains(leasePage, "<ConfirmAction", "Agreement move-out must use confirmation.");
contains(leaseActions, 'assertPermission(actor, "agreements.manage", propertyId)', "Agreement creation must enforce agreements.manage.");
contains(leaseActions, 'assertPermission(actor, "agreements.manage", lease.property_id)', "Agreement move-out must enforce property permission.");
contains(maintenancePage, 'requirePortfolioPermission("maintenance.manage")', "Maintenance route must enforce maintenance.manage.");
contains(maintenancePage, "<ActionButton", "Maintenance transitions must expose pending state.");
contains(maintenanceActions, 'assertPermission(actor, "maintenance.manage", propertyId)', "Maintenance creation must enforce property permission.");
contains(maintenanceActions, 'assertPermission(actor, "maintenance.manage", ticket.property_id)', "Maintenance updates must enforce row permission.");
contains(portalMaintenanceActions, 'assertPermission(actor, "maintenance.manage", ticket.property_id)', "Staff maintenance comments must enforce row permission.");
contains(teamPage, 'requirePortfolioPermission("team.manage")', "Team route must enforce team.manage.");
contains(teamPage, "<ConfirmAction", "Account disabling must use confirmation.");
contains(teamActions, 'assertPortfolioPermission(actor, "team.manage")', "Team actions must enforce team.manage.");
contains(teamActions, "assertTargetWithinManagerScope", "Delegated team managers must not cross their property boundary.");
contains(teamActions, "You cannot change your own permissions", "Delegated managers must not self-escalate permissions.");
contains(teamActions, "grantable", "Delegated managers must not grant capabilities beyond their own authority.");
contains(teamActions, "targetPropertyIds.every", "Global grants must remain valid across every target property.");
contains(teamPage, "const manageable=", "Team row actions must hide accounts outside the manager contract.");
contains(settingsPage, 'requirePortfolioPermission("settings.manage")', "Settings route must enforce settings.manage.");
contains(settingsActions, 'assertPortfolioPermission(actor, "settings.manage")', "Settings writes must enforce settings.manage.");
contains(modulesPage, 'requirePortfolioPermission("settings.manage")', "Modules route must enforce settings.manage.");
contains(moduleActions, 'assertPortfolioPermission(actor, "settings.manage")', "Module writes must enforce settings.manage.");
contains(reservationsPage, 'requirePortfolioPermission("reservations.manage")', "Reservations route must enforce reservations.manage.");
contains(reservationsPage, "<TransitionConfirmation", "Reservation no-show, cancellation, and checkout must require confirmation.");
contains(reservationsPage, "<ActionButton", "Reservation check-in must expose pending state.");

const financeContracts = {
  "lib/actions/finance-invoices.js": ["billing.manage", "permissionScopeSql"],
  "lib/actions/finance-fees.js": ["billing.manage", "assertPermission"],
  "lib/actions/finance-reminders.js": ["billing.manage", "assertPermission"],
  "lib/actions/finance-payments.js": ["payments.manage", "assertPermission"],
  "lib/actions/billing.js": ["billing.manage", "assertPermission"]
};
for (const [file, contracts] of Object.entries(financeContracts)) {
  const source = read(file);
  for (const contract of contracts) contains(source, contract, `${file} is missing ${contract} authorization.`);
  excludes(source, 'requireRole(["owner", "admin"])', `${file} must not use role-only financial authorization.`);
}

for (const [file, source] of Object.entries({
  agreements: leasePage, team: teamPage, reservations: reservationsPage, invoices: invoiceTable
})) {
  excludes(source, "danger-text", `${file} still uses the legacy destructive class.`);
}

contains(contractCss, ".button.danger", "Destructive button styling is missing.");
for (const tone of SEMANTIC_TONES) contains(contractCss, `.badge-${tone}`, `Semantic badge style ${tone} is missing.`);
contains(globals, '@import "./styles/part-13.css";', "Interaction contract stylesheet is not loaded.");

const uiSources = [...sourceFiles("app"), ...sourceFiles("components")];
for (const file of uiSources) {
  const source = read(file);
  for (const match of source.matchAll(/<Badge\b[^>]*\btone=(?:"([^"]+)"|'([^']+)')/g)) {
    const literal = normalizeStatus(match[1] || match[2]);
    assert(SEMANTIC_TONES.includes(literal) || Boolean(STATUS_TONES[literal]), `${file} uses unregistered badge tone ${literal}.`);
  }
}

console.log("Permission-aligned navigation, property-scoped financial actions, shared interaction contracts, explicit status tones, and accessibility semantics verified.");
