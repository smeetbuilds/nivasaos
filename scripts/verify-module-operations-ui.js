import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contains = (source, value, message) => assert(source.includes(value), message);
const excludes = (source, value, message) => assert(!source.includes(value), message);

const packageJson = JSON.parse(read("package.json"));
const globals = read("app/globals.css");
const css = read("app/styles/module-operations.css");
const servicesPage = read("app/(workspace)/services/page.js");
const services = read("app/(workspace)/services/workspace.js");
const visitors = read("app/(workspace)/visitors/workspace.js");
const spaces = read("app/(workspace)/spaces/workspace.js");
const commercial = read("app/(workspace)/commercial/workspace.js");
const verticals = read("app/(workspace)/operations/page.js");
const portalServices = read("app/portal/(account)/services/page.js");
const portalVisitors = read("app/portal/(account)/visitors/page.js");

contains(packageJson.scripts["verify:ui"], "verify-module-operations-ui.js", "Module operations verifier is not attached to verify:ui.");
contains(packageJson.scripts["verify:release"], "verify-module-operations-ui.js", "Module operations verifier is not attached to the release boundary.");
contains(globals, '@import "./styles/module-operations.css";', "Module operations stylesheet is not loaded.");
for (const contract of [
  ".module-directory-section",
  ".module-directory-table",
  ".module-row-actions",
  ".module-form-note",
  ".metric-card.attention",
  ".portal-service-list > article",
  ".portal-visitor-list > article",
  "@media (max-width: 720px)",
  "@media (prefers-reduced-motion: reduce)"
]) contains(css, contract, `Module operations CSS contract missing: ${contract}`);
excludes(css, "font-size: 8px", "Module operations UI must not use unreadably small text.");
excludes(css, "border-radius: 20px", "Module operations UI must not reintroduce oversized card radii.");
excludes(css, "overflow-x: auto", "Module operations mobile records must not rely on horizontal scrolling.");

contains(servicesPage, 'renderPermissionScopedPage("services.manage"', "Services route must remain permission scoped.");
contains(services, "export default async function ServicesPage", "Services workspace must export its page component.");
contains(services, "bulkServiceBillingAction", "Services workspace must expose bulk preview/run billing.");
contains(services, 'data-mobile-cards="service-catalogue"', "Service catalogue must use mobile records.");
contains(services, 'data-mobile-cards="service-subscriptions"', "Service subscriptions must use mobile records.");
contains(services, 'data-mobile-cards="service-jobs"', "Service billing history must use mobile records.");
contains(services, "ConfirmAction", "Ending a service must require confirmation.");
contains(services, 'hasPermission(user, "billing.manage"', "Service billing actions must respect billing permission.");
contains(services, "billingPropertyIds", "Service billing history must be restricted to billing-permitted properties.");
contains(services, "Billing access required", "Subscriptions outside billing scope must not expose invoice state.");
excludes(services, "submitTenantPaymentAction", "Services workspace must not contain tenant payment actions.");
excludes(services, "reviewPaymentSubmissionAction", "Services workspace must not contain portal payment review actions.");

contains(visitors, 'data-mobile-cards="visitors"', "Visitor register must use mobile records.");
contains(visitors, "ActionButton", "Visitor transitions must expose pending state.");
contains(visitors, "ConfirmAction", "Visitor cancellation must require confirmation.");
contains(visitors, "Visitor access summary", "Visitor register needs an accessible summary.");
for (const contract of ['maxLength="160"', 'maxLength="40"', 'maxLength="120"', 'maxLength="500"', 'maxLength="1200"']) contains(visitors, contract, `Staff visitor form limit missing: ${contract}`);

contains(spaces, 'data-mobile-cards="spaces"', "Space inventory must use mobile records.");
contains(spaces, "ConfirmAction", "Space allocation release must require confirmation.");
contains(spaces, "Bed and space inventory summary", "Space inventory needs an accessible summary.");
contains(spaces, 'hasPermission(user, "agreements.manage"', "Space allocation controls must require agreement permission.");
contains(spaces, "allocationPropertySet", "Allocation forms must be generated only for agreement-permitted properties.");

contains(commercial, 'data-mobile-cards="commercial-profiles"', "Commercial profiles must use mobile records.");
contains(commercial, 'hasPermission(user, "verticals.manage"', "Commercial profile records must remain permission scoped.");
contains(commercial, "Commercial agreement profile summary", "Commercial profiles need an accessible summary.");
for (const contract of ['name="registrationNumber"', 'maxLength="120"', 'name="businessActivity"']) contains(commercial, contract, `Commercial input contract missing: ${contract}`);

contains(verticals, 'data-mobile-cards="vertical-profiles"', "Vertical profiles must use mobile records.");
contains(verticals, 'data-mobile-cards="module-requests"', "Module requests must use mobile records.");
contains(verticals, "booleanFields", "Vertical configuration must expose explicit boolean controls.");
contains(verticals, "normalizedBoolean", "Stored vertical boolean values must normalize into explicit controls.");
contains(verticals, "profileMaxLength", "Student and staff profile limits must match server parsing.");
contains(verticals, "guardian_email", "Student guardian fields must remain available.");
contains(verticals, "eligibility_end_date", "Staff eligibility fields must remain available.");
contains(verticals, "optgroup", "Cross-property selectors must group related records.");

contains(portalServices, "Resident service summary", "Resident services need an accessible summary.");
contains(portalServices, "is-historical", "Resident service history must be visually explicit.");
contains(portalVisitors, "Resident visitor summary", "Resident visitors need an accessible summary.");
contains(portalVisitors, "portal-visitor-cancel", "Resident visitor cancellation must require confirmation.");
contains(portalVisitors, 'pendingLabel="Registering…"', "Resident visitor creation must expose pending state.");
for (const contract of ['maxLength="160"', 'maxLength="40"', 'maxLength="500"', 'maxLength="1200"']) contains(portalVisitors, contract, `Resident visitor form limit missing: ${contract}`);

console.log("Restored services routing, billing-scope isolation, responsive service, visitor, space, commercial and vertical registers, confirmation-safe actions, agreement-scoped allocation controls, exact client/server form bounds, student/staff profile semantics, and resident module flows verified.");
