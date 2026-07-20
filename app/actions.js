"use server";

import * as auth from "@/lib/actions/auth";
import * as properties from "@/lib/actions/properties";
import * as propertyRelease from "@/lib/actions/property-module-update";
import * as leases from "@/lib/actions/leases";
import * as finance from "@/lib/actions/finance";
import * as maintenance from "@/lib/actions/maintenance";
import * as team from "@/lib/actions/team";
import * as settings from "@/lib/actions/settings";
import * as billing from "@/lib/actions/billing";
import * as portal from "@/lib/actions/portal";
import * as handover from "@/lib/actions/handover";
import * as modules from "@/lib/actions/modules";
import * as spaces from "@/lib/actions/spaces";
import * as services from "@/lib/actions/services";
import * as visitors from "@/lib/actions/visitors";
import * as commercial from "@/lib/actions/commercial";
import * as verticals from "@/lib/actions/verticals";
import { runStructuredAction } from "@/lib/action-state";
import {
  authorizeEntityAction,
  authorizeGlobalAction,
  authorizePropertyAction
} from "@/lib/action-authorization";

export async function installAction(formData) { return auth.installAction(formData); }
export async function loginAction(formData) { return auth.loginAction(formData); }
export async function logoutAction(formData) { return auth.logoutAction(formData); }

export async function createPropertyAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction(async (formData) => {
    await authorizeGlobalAction("properties.manage");
    return properties.createPropertyAction(formData);
  }, previousStateOrFormData, maybeFormData);
}
export async function updatePropertyAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction(async (formData) => {
    await authorizeGlobalAction("properties.manage");
    await authorizePropertyAction(formData, "portfolio.view");
    return propertyRelease.updatePropertyReleaseAction(formData);
  }, previousStateOrFormData, maybeFormData);
}
export async function createUnitAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction(async (formData) => {
    await authorizePropertyAction(formData, "inventory.manage");
    return properties.createUnitAction(formData);
  }, previousStateOrFormData, maybeFormData);
}
export async function updateUnitAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction(async (formData) => {
    await authorizeEntityAction(formData, "inventory.manage", "unit");
    return properties.updateUnitAction(formData);
  }, previousStateOrFormData, maybeFormData);
}
export async function createTenantAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction((formData) => properties.createTenantAction(formData), previousStateOrFormData, maybeFormData);
}
export async function updateTenantAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction((formData) => properties.updateTenantAction(formData), previousStateOrFormData, maybeFormData);
}
export async function createLeaseAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction((formData) => leases.createLeaseAction(formData), previousStateOrFormData, maybeFormData);
}
export async function endLeaseAction(formData) { return leases.endLeaseAction(formData); }
export async function createInvoiceAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction((formData) => finance.createInvoiceAction(formData), previousStateOrFormData, maybeFormData);
}
export async function createRentRunAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction((formData) => finance.createRentRunAction(formData), previousStateOrFormData, maybeFormData);
}
export async function recordPaymentAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction((formData) => finance.recordPaymentAction(formData), previousStateOrFormData, maybeFormData);
}
export async function createLateFeeRunAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction((formData) => finance.createLateFeeRunAction(formData), previousStateOrFormData, maybeFormData);
}
export async function voidInvoiceAction(formData) { return finance.voidInvoiceAction(formData); }
export async function logReminderAction(formData) { return finance.logReminderAction(formData); }
export async function createMaintenanceAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction((formData) => maintenance.createMaintenanceAction(formData), previousStateOrFormData, maybeFormData);
}
export async function updateMaintenanceAction(formData) { return maintenance.updateMaintenanceAction(formData); }
export async function createTeamMemberAction(formData) { return team.createTeamMemberAction(formData); }
export async function updateTeamMemberAction(formData) { return team.updateTeamMemberAction(formData); }
export async function toggleUserAction(formData) { return team.toggleUserAction(formData); }
export async function updateUserPermissionsAction(formData) { return team.updateUserPermissionsAction(formData); }
export async function updateSettingsAction(formData) { return settings.updateSettingsAction(formData); }
export async function changePasswordAction(formData) { return settings.changePasswordAction(formData); }
export async function updateBillingPolicyAction(formData) { return billing.updateBillingPolicyAction(formData); }

export async function createTenantInviteAction(formData) {
  await authorizeEntityAction(formData, "portal.manage", "tenant");
  return portal.createTenantInviteAction(formData);
}
export async function disableTenantPortalAction(formData) {
  await authorizeEntityAction(formData, "portal.manage", "tenant");
  return portal.disableTenantPortalAction(formData);
}
export async function activateTenantPortalAction(formData) { return portal.activateTenantPortalAction(formData); }
export async function tenantLoginAction(formData) { return portal.tenantLoginAction(formData); }
export async function tenantLogoutAction(formData) { return portal.tenantLogoutAction(formData); }
export async function updateTenantPortalProfileAction(formData) { return portal.updateTenantPortalProfileAction(formData); }
export async function submitTenantPaymentAction(formData) { return portal.submitTenantPaymentAction(formData); }
export async function cancelTenantPaymentSubmissionAction(formData) { return portal.cancelTenantPaymentSubmissionAction(formData); }
export async function reviewPaymentSubmissionAction(formData) {
  await authorizeEntityAction(formData, "payments.manage", "paymentSubmission");
  return portal.reviewPaymentSubmissionAction(formData);
}
export async function recordDepositTransactionAction(formData) {
  await authorizeEntityAction(formData, "deposits.manage", "lease");
  return portal.recordDepositTransactionAction(formData);
}
export async function createTenantMaintenanceAction(formData) { return portal.createTenantMaintenanceAction(formData); }
export async function addTenantMaintenanceCommentAction(formData) { return portal.addTenantMaintenanceCommentAction(formData); }
export async function addStaffMaintenanceCommentAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction((formData) => portal.addStaffMaintenanceCommentAction(formData), previousStateOrFormData, maybeFormData);
}

export async function createInspectionAction(formData) {
  await authorizeEntityAction(formData, "handover.manage", "lease");
  return handover.createInspectionAction(formData);
}
export async function addInspectionItemAction(formData) {
  await authorizeEntityAction(formData, "handover.manage", "inspection");
  return handover.addInspectionItemAction(formData);
}
export async function shareInspectionAction(formData) {
  await authorizeEntityAction(formData, "handover.manage", "inspection");
  return handover.shareInspectionAction(formData);
}
export async function acknowledgeInspectionAction(formData) { return handover.acknowledgeInspectionAction(formData); }
export async function completeInspectionAction(formData) {
  await authorizeEntityAction(formData, "handover.manage", "inspection");
  if (formData.get("applyDeduction") === "on") await authorizeEntityAction(formData, "deposits.manage", "inspection");
  return handover.completeInspectionAction(formData);
}
export async function uploadLeaseDocumentAction(formData) {
  await authorizeEntityAction(formData, "handover.manage", "lease");
  return handover.uploadLeaseDocumentAction(formData);
}
export async function archiveLeaseDocumentAction(formData) {
  await authorizeEntityAction(formData, "handover.manage", "document");
  return handover.archiveLeaseDocumentAction(formData);
}
export async function recordKeyTransactionAction(formData) {
  await authorizeEntityAction(formData, "handover.manage", "lease");
  return handover.recordKeyTransactionAction(formData);
}

export async function updateWorkspaceModulesAction(formData) { return modules.updateWorkspaceModulesAction(formData); }
export async function createSpaceAction(formData) {
  await authorizePropertyAction(formData, "inventory.manage");
  return spaces.createSpaceAction(formData);
}
export async function updateSpaceAction(formData) {
  await authorizeEntityAction(formData, "inventory.manage", "space");
  return spaces.updateSpaceAction(formData);
}
export async function allocateSpaceAction(formData) {
  await authorizeEntityAction(formData, ["inventory.manage", "agreements.manage"], "space");
  return spaces.allocateSpaceAction(formData);
}
export async function releaseSpaceAllocationAction(formData) {
  await authorizeEntityAction(formData, ["inventory.manage", "agreements.manage"], "allocation");
  return spaces.releaseSpaceAllocationAction(formData);
}
export async function createServiceAction(formData) {
  await authorizePropertyAction(formData, "services.manage");
  return services.createServiceAction(formData);
}
export async function updateServiceAction(formData) {
  await authorizeEntityAction(formData, "services.manage", "service");
  return services.updateServiceAction(formData);
}
export async function subscribeServiceAction(formData) {
  await authorizeEntityAction(formData, "services.manage", "service");
  return services.subscribeServiceAction(formData);
}
export async function endServiceSubscriptionAction(formData) {
  await authorizeEntityAction(formData, "services.manage", "subscription");
  return services.endServiceSubscriptionAction(formData);
}
export async function billServiceSubscriptionAction(formData) {
  await authorizeEntityAction(formData, ["services.manage", "billing.manage"], "subscription");
  return services.billServiceSubscriptionAction(formData);
}
export async function createVisitorEntryAction(formData) {
  await authorizePropertyAction(formData, "visitors.manage");
  return visitors.createVisitorEntryAction(formData);
}
export async function updateVisitorStatusAction(formData) {
  await authorizeEntityAction(formData, "visitors.manage", "visitor");
  return visitors.updateVisitorStatusAction(formData);
}
export async function preregisterTenantVisitorAction(formData) { return visitors.preregisterTenantVisitorAction(formData); }
export async function cancelTenantVisitorAction(formData) { return visitors.cancelTenantVisitorAction(formData); }
export async function saveCommercialProfileAction(formData) {
  await authorizeEntityAction(formData, "verticals.manage", "lease");
  return commercial.saveCommercialProfileAction(formData);
}

export async function savePropertyOperatingConfigAction(formData) { return verticals.savePropertyOperatingConfigAction(formData); }
export async function saveResidentVerticalProfileAction(formData) { return verticals.saveResidentVerticalProfileAction(formData); }
export async function createModuleRequestAction(formData) { return verticals.createModuleRequestAction(formData); }
export async function createTenantModuleRequestAction(formData) { return verticals.createTenantModuleRequestAction(formData); }
export async function cancelTenantModuleRequestAction(formData) { return verticals.cancelTenantModuleRequestAction(formData); }
export async function reviewModuleRequestAction(formData) { return verticals.reviewModuleRequestAction(formData); }
export async function createHostelReservationAction(formData) { return verticals.createHostelReservationAction(formData); }
export async function updateHostelReservationStatusAction(formData) { return verticals.updateHostelReservationStatusAction(formData); }
export async function createHousekeepingTaskAction(formData) { return verticals.createHousekeepingTaskAction(formData); }
export async function updateHousekeepingTaskAction(formData) { return verticals.updateHousekeepingTaskAction(formData); }
export async function bulkServiceBillingAction(formData) {
  await authorizePropertyAction(formData, ["services.manage", "billing.manage"]);
  return verticals.bulkServiceBillingAction(formData);
}
