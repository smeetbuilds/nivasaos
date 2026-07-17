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

export async function installAction(formData) { return auth.installAction(formData); }
export async function loginAction(formData) { return auth.loginAction(formData); }
export async function logoutAction(formData) { return auth.logoutAction(formData); }
export async function createPropertyAction(formData) { return properties.createPropertyAction(formData); }
export async function updatePropertyAction(formData) { return propertyRelease.updatePropertyReleaseAction(formData); }
export async function createUnitAction(formData) { return properties.createUnitAction(formData); }
export async function updateUnitAction(formData) { return properties.updateUnitAction(formData); }
export async function createTenantAction(formData) { return properties.createTenantAction(formData); }
export async function updateTenantAction(formData) { return properties.updateTenantAction(formData); }
export async function createLeaseAction(formData) { return leases.createLeaseAction(formData); }
export async function endLeaseAction(formData) { return leases.endLeaseAction(formData); }
export async function createInvoiceAction(formData) { return finance.createInvoiceAction(formData); }
export async function createRentRunAction(formData) { return finance.createRentRunAction(formData); }
export async function recordPaymentAction(formData) { return finance.recordPaymentAction(formData); }
export async function createLateFeeRunAction(formData) { return finance.createLateFeeRunAction(formData); }
export async function voidInvoiceAction(formData) { return finance.voidInvoiceAction(formData); }
export async function logReminderAction(formData) { return finance.logReminderAction(formData); }
export async function createMaintenanceAction(formData) { return maintenance.createMaintenanceAction(formData); }
export async function updateMaintenanceAction(formData) { return maintenance.updateMaintenanceAction(formData); }
export async function createTeamMemberAction(formData) { return team.createTeamMemberAction(formData); }
export async function updateTeamMemberAction(formData) { return team.updateTeamMemberAction(formData); }
export async function toggleUserAction(formData) { return team.toggleUserAction(formData); }
export async function updateUserPermissionsAction(formData) { return team.updateUserPermissionsAction(formData); }
export async function updateSettingsAction(formData) { return settings.updateSettingsAction(formData); }
export async function changePasswordAction(formData) { return settings.changePasswordAction(formData); }
export async function updateBillingPolicyAction(formData) { return billing.updateBillingPolicyAction(formData); }

export async function createTenantInviteAction(formData) { return portal.createTenantInviteAction(formData); }
export async function disableTenantPortalAction(formData) { return portal.disableTenantPortalAction(formData); }
export async function activateTenantPortalAction(formData) { return portal.activateTenantPortalAction(formData); }
export async function tenantLoginAction(formData) { return portal.tenantLoginAction(formData); }
export async function tenantLogoutAction(formData) { return portal.tenantLogoutAction(formData); }
export async function updateTenantPortalProfileAction(formData) { return portal.updateTenantPortalProfileAction(formData); }
export async function submitTenantPaymentAction(formData) { return portal.submitTenantPaymentAction(formData); }
export async function cancelTenantPaymentSubmissionAction(formData) { return portal.cancelTenantPaymentSubmissionAction(formData); }
export async function reviewPaymentSubmissionAction(formData) { return portal.reviewPaymentSubmissionAction(formData); }
export async function recordDepositTransactionAction(formData) { return portal.recordDepositTransactionAction(formData); }
export async function createTenantMaintenanceAction(formData) { return portal.createTenantMaintenanceAction(formData); }
export async function addTenantMaintenanceCommentAction(formData) { return portal.addTenantMaintenanceCommentAction(formData); }
export async function addStaffMaintenanceCommentAction(formData) { return portal.addStaffMaintenanceCommentAction(formData); }

export async function createInspectionAction(formData) { return handover.createInspectionAction(formData); }
export async function addInspectionItemAction(formData) { return handover.addInspectionItemAction(formData); }
export async function shareInspectionAction(formData) { return handover.shareInspectionAction(formData); }
export async function acknowledgeInspectionAction(formData) { return handover.acknowledgeInspectionAction(formData); }
export async function completeInspectionAction(formData) { return handover.completeInspectionAction(formData); }
export async function uploadLeaseDocumentAction(formData) { return handover.uploadLeaseDocumentAction(formData); }
export async function archiveLeaseDocumentAction(formData) { return handover.archiveLeaseDocumentAction(formData); }
export async function recordKeyTransactionAction(formData) { return handover.recordKeyTransactionAction(formData); }

export async function updateWorkspaceModulesAction(formData) { return modules.updateWorkspaceModulesAction(formData); }
export async function createSpaceAction(formData) { return spaces.createSpaceAction(formData); }
export async function updateSpaceAction(formData) { return spaces.updateSpaceAction(formData); }
export async function allocateSpaceAction(formData) { return spaces.allocateSpaceAction(formData); }
export async function releaseSpaceAllocationAction(formData) { return spaces.releaseSpaceAllocationAction(formData); }
export async function createServiceAction(formData) { return services.createServiceAction(formData); }
export async function updateServiceAction(formData) { return services.updateServiceAction(formData); }
export async function subscribeServiceAction(formData) { return services.subscribeServiceAction(formData); }
export async function endServiceSubscriptionAction(formData) { return services.endServiceSubscriptionAction(formData); }
export async function billServiceSubscriptionAction(formData) { return services.billServiceSubscriptionAction(formData); }
export async function createVisitorEntryAction(formData) { return visitors.createVisitorEntryAction(formData); }
export async function updateVisitorStatusAction(formData) { return visitors.updateVisitorStatusAction(formData); }
export async function preregisterTenantVisitorAction(formData) { return visitors.preregisterTenantVisitorAction(formData); }
export async function cancelTenantVisitorAction(formData) { return visitors.cancelTenantVisitorAction(formData); }
export async function saveCommercialProfileAction(formData) { return commercial.saveCommercialProfileAction(formData); }

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
export async function bulkServiceBillingAction(formData) { return verticals.bulkServiceBillingAction(formData); }
