"use server";

import { runStructuredAction } from "@/lib/action-state";
import { installAction as installWorkspace } from "@/lib/actions/auth";
import { activateTenantPortalAction as activatePortalAccess } from "@/lib/actions/portal-accounts";
import { changePasswordAction as changeWorkspacePassword, updateSettingsAction as updateWorkspaceSettings } from "@/lib/actions/settings";

export async function installWorkspaceAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction((formData) => installWorkspace(formData), previousStateOrFormData, maybeFormData);
}

export async function activatePortalAccessAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction((formData) => activatePortalAccess(formData), previousStateOrFormData, maybeFormData);
}

export async function updateWorkspaceSettingsAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction((formData) => updateWorkspaceSettings(formData), previousStateOrFormData, maybeFormData);
}

export async function changeWorkspacePasswordAction(previousStateOrFormData, maybeFormData) {
  return runStructuredAction((formData) => changeWorkspacePassword(formData), previousStateOrFormData, maybeFormData);
}
