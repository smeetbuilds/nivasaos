"use server";

import * as auth from "@/lib/actions/auth";
import * as properties from "@/lib/actions/properties";
import * as leases from "@/lib/actions/leases";
import * as finance from "@/lib/actions/finance";
import * as maintenance from "@/lib/actions/maintenance";
import * as team from "@/lib/actions/team";
import * as settings from "@/lib/actions/settings";
import * as billing from "@/lib/actions/billing";
import * as portal from "@/lib/actions/portal";

export async function installAction(formData) { return auth.installAction(formData); }
export async function loginAction(formData) { return auth.loginAction(formData); }
export async function logoutAction(formData) { return auth.logoutAction(formData); }
export async function createPropertyAction(formData) { return properties.createPropertyAction(formData); }
export async function updatePropertyAction(formData) { return properties.updatePropertyAction(formData); }
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
