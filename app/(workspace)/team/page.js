import { createTeamMemberAction, toggleUserAction, updateTeamMemberAction, updateUserPermissionsAction } from "@/app/actions";
import { all } from "@/lib/db";
import { accessibleProperties } from "@/lib/data";
import { dateLabel } from "@/lib/format";
import { permissionsForUser, portfolioPermissionsForUser, requirePortfolioPermission } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/verticals";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import ConfirmAction from "@/components/ConfirmAction";
import ActionButton from "@/components/ActionButton";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";

export const metadata = { title: "Team" };

const permissionGroups = {
  Portfolio: ["portfolio.view", "properties.manage", "inventory.manage", "people.manage", "agreements.manage", "verticals.manage"],
  Finance: ["billing.manage", "payments.manage", "deposits.manage", "services.manage"],
  Operations: ["portal.manage", "visitors.manage", "maintenance.manage", "handover.manage", "requests.review", "reservations.manage", "housekeeping.manage"],
  Governance: ["reports.view", "team.manage", "settings.manage", "audit.view"]
};

const permissionGroupDescriptions = {
  Portfolio: "Properties, inventory, people, agreements, and model-specific records",
  Finance: "Billing, collections, deposits, payments, and recurring services",
  Operations: "Portal access, requests, visitors, maintenance, reservations, and turnover",
  Governance: "Reporting, accounts, workspace settings, and audit evidence"
};

const permissionDescriptions = {
  "portfolio.view": "View assigned properties and portfolio summaries",
  "properties.manage": "Create properties and change their operating setup",
  "inventory.manage": "Create and maintain units, rooms, beds, and spaces",
  "people.manage": "Create and maintain occupants and contacts",
  "agreements.manage": "Create, activate, and end agreements",
  "verticals.manage": "Manage model-specific operational profiles",
  "billing.manage": "Issue invoices and manage billing rules",
  "payments.manage": "Record and reconcile incoming payments",
  "deposits.manage": "Record, hold, apply, and return security deposits",
  "services.manage": "Manage recurring property services",
  "portal.manage": "Manage portal accounts, access, and resident handoff",
  "visitors.manage": "Maintain visitor entry and exit records",
  "maintenance.manage": "Create and progress maintenance work",
  "handover.manage": "Manage move-in and move-out handovers",
  "requests.review": "Review tenant and resident requests",
  "reservations.manage": "Create and manage hostel reservations",
  "housekeeping.manage": "Plan and update housekeeping work",
  "reports.view": "Open operational and financial reports",
  "team.manage": "Create accounts and assign access",
  "settings.manage": "Change modules and workspace configuration",
  "audit.view": "Review immutable audit history"
};

const permissionLabel = (value) => value.replace(".manage", "").replace(".view", "").replace(".review", " review").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function PropertyChecks({ properties, selected = [] }) {
  const selectedSet = new Set(selected.map(Number));
  return <fieldset className="checkbox-fieldset access-scope-fieldset">
    <legend>Assigned properties</legend>
    {properties.length ? <div className="checkbox-grid">{properties.map((property) => <label className="check-card" key={property.id}><input type="checkbox" name="propertyIds" value={property.id} defaultChecked={selectedSet.has(Number(property.id))}/><span><strong>{property.name}</strong><small>{property.city || property.country}</small></span></label>)}</div> : <div className="access-empty">No assignable property is available in your current scope.</div>}
    <small>Property assignment is the hard data boundary. Permissions cannot grant access outside this list.</small>
  </fieldset>;
}

function PermissionChecks({ selected }) {
  const selectedSet = new Set(selected);
  return <div className="permission-matrix">{Object.entries(permissionGroups).map(([group, permissions]) => <fieldset key={group}>
    <legend><span>{group}</span><small>{permissionGroupDescriptions[group]}</small></legend>
    <div className="permission-grid">{permissions.map((permission) => <label className="permission-card" key={permission}><input type="checkbox" name="permissions" value={permission} defaultChecked={selectedSet.has(permission)}/><span><strong>{permissionLabel(permission)}</strong><small>{permissionDescriptions[permission] || permission}</small></span></label>)}</div>
  </fieldset>)}</div>;
}

export default async function TeamPage({ searchParams }) {
  const user = await requirePortfolioPermission("team.manage");
  const properties = accessibleProperties(user);
  const members = all(`SELECT u.id,u.name,u.email,u.role,u.status,u.created_at,GROUP_CONCAT(p.name, ', ') property_names,GROUP_CONCAT(p.id, ',') property_ids FROM users u LEFT JOIN user_properties up ON up.user_id=u.id LEFT JOIN properties p ON p.id=up.property_id WHERE $isOwner=1 OR u.role='owner' OR NOT EXISTS (SELECT 1 FROM user_properties target WHERE target.user_id=u.id AND target.property_id NOT IN (SELECT property_id FROM user_properties WHERE user_id=$managerId)) GROUP BY u.id ORDER BY CASE u.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.name`, { isOwner: user.role === "owner" ? 1 : 0, managerId: user.id });
  const query = await searchParams;
  const activeAccounts = members.filter((member) => member.status === "active").length;
  const adminAccounts = members.filter((member) => member.role === "owner" || member.role === "admin").length;
  const staffAccounts = members.filter((member) => member.role === "staff").length;
  const scopedAccounts = members.filter((member) => member.role !== "owner" && member.property_names).length;

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Access control" title="Team, roles & permissions" description="Property assignment controls which records are reachable. The permission matrix controls what each account may do globally or inside an assigned property." actions={<OpenModalButton target="team-modal" icon="plus">Add team member</OpenModalButton>}/>

    <section className="role-cards team-summary-grid" aria-label="Team access summary">
      <article><span>Team accounts</span><strong>{members.length}</strong><small>{activeAccounts} currently active</small></article>
      <article><span>Administrators</span><strong>{adminAccounts}</strong><small>Owner and admin-level accounts</small></article>
      <article><span>Staff accounts</span><strong>{staffAccounts}</strong><small>Task-focused operational access</small></article>
      <article><span>Property scoped</span><strong>{scopedAccounts}</strong><small>Accounts limited to assigned properties</small></article>
    </section>

    <section className="panel team-directory-panel" aria-labelledby="team-directory-title">
      <div className="panel-head"><div><span className="eyebrow">Directory</span><h2 id="team-directory-title">Workspace accounts</h2><p>{members.length} account{members.length === 1 ? "" : "s"} visible inside your management scope</p></div></div>
      <div className="table-wrap"><table className="team-directory-table" data-mobile-cards="team"><thead><tr><th>User</th><th>Role</th><th>Property scope</th><th>Effective permissions</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead><tbody>{members.map((member) => {
        const effective = member.role === "owner" ? PERMISSIONS : portfolioPermissionsForUser(member);
        const manageable = member.role !== "owner" && Number(member.id) !== Number(user.id) && (user.role === "owner" || member.role === "staff");
        return <tr key={member.id}>
          <td data-label="User"><div className="person-cell"><span className="avatar">{member.name[0]}</span><span><strong>{member.name}</strong><small>{member.email}</small></span></div></td>
          <td data-label="Role"><Badge tone={member.role}>{member.role}</Badge></td>
          <td data-label="Property scope">{member.role === "owner" ? "All properties" : member.property_names || "No properties assigned"}</td>
          <td data-label="Effective permissions"><strong>{effective.length}</strong><small>of {PERMISSIONS.length} capabilities across assigned properties</small></td>
          <td data-label="Created">{dateLabel(member.created_at.slice(0, 10))}</td>
          <td data-label="Status"><Badge tone={member.status}>{member.status}</Badge></td>
          <td data-label="Actions">{manageable && <div className="row-actions"><OpenModalButton target={`team-edit-${member.id}`} icon="edit" className="text-button">Account</OpenModalButton><OpenModalButton target={`permissions-${member.id}-global`} icon="audit" className="text-button">Permissions</OpenModalButton>{member.status === "active" ? <ConfirmAction action={toggleUserAction} id={`disable-user-${member.id}`} triggerLabel="Disable" title={`Disable ${member.name}?`} description="This immediately revokes active sessions and removes the account from unresolved maintenance assignments." submitLabel="Disable account" pendingLabel="Disabling…"><div className="modal-body"><input type="hidden" name="userId" value={member.id}/><div className="confirm-consequence">The account can be enabled later, but current sessions will not be restored.</div></div></ConfirmAction> : <form action={toggleUserAction}><input type="hidden" name="userId" value={member.id}/><ActionButton className="text-button" pendingLabel="Enabling…">Enable</ActionButton></form>}</div>}</td>
        </tr>;
      })}</tbody></table></div>
    </section>

    <form action={createTeamMemberAction}><ModalForm id="team-modal" title="Add a team member" description="Create their login and choose the properties they can reach. Permissions can be refined after creation." submitLabel="Create account" pendingLabel="Creating…"><div className="modal-body"><div className="field-grid two"><label><span>Name</span><input name="name" required/></label><label><span>Role</span><select name="role"><option value="staff">Staff</option>{user.role === "owner" && <option value="admin">Admin</option>}</select></label></div><label><span>Email</span><input type="email" name="email" autoComplete="email" required/></label><label><span>Temporary password</span><input type="password" name="password" minLength="10" maxLength="256" autoComplete="new-password" required/><small>Use at least 10 characters. The user should replace this temporary credential after sign-in.</small></label><PropertyChecks properties={properties}/></div></ModalForm></form>

    {members.filter((member) => member.role !== "owner" && Number(member.id) !== Number(user.id) && (user.role === "owner" || member.role === "staff")).map((member) => {
      const selectedProperties = String(member.property_ids || "").split(",").filter(Boolean).map(Number);
      const propertyRecords = properties.filter((property) => selectedProperties.includes(Number(property.id)));
      return <div key={`controls-${member.id}`}>
        <form action={updateTeamMemberAction}><ModalForm id={`team-edit-${member.id}`} title={`Edit ${member.name}`} description="Role and property changes revoke inaccessible assignments and active sessions." submitLabel="Save access" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="userId" value={member.id}/><div className="field-grid two"><label><span>Name</span><input name="name" defaultValue={member.name} required/></label><label><span>Role</span><select name="role" defaultValue={member.role}><option value="staff">Staff</option><option value="admin">Admin</option></select></label></div><label><span>Email</span><input type="email" name="email" defaultValue={member.email} autoComplete="email" required/></label><PropertyChecks properties={properties} selected={selectedProperties}/></div></ModalForm></form>
        <form action={updateUserPermissionsAction}><ModalForm id={`permissions-${member.id}-global`} title={`${member.name} · global permissions`} description="These capabilities apply across every property assigned to this account. Saving revokes active sessions." submitLabel="Save global permissions" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="userId" value={member.id}/><PermissionChecks selected={permissionsForUser(member)}/>{propertyRecords.length > 0 && <div className="permission-scope-links"><span>Property-specific overrides</span>{propertyRecords.map((property) => <OpenModalButton key={property.id} target={`permissions-${member.id}-${property.id}`} className="button secondary">{property.name}</OpenModalButton>)}</div>}</div></ModalForm></form>
        {propertyRecords.map((property) => <form action={updateUserPermissionsAction} key={`permission-form-${member.id}-${property.id}`}><ModalForm id={`permissions-${member.id}-${property.id}`} title={`${member.name} · ${property.name}`} description="This explicit property matrix overrides the account's global permissions only for this assigned property." submitLabel="Save property permissions" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="userId" value={member.id}/><input type="hidden" name="permissionPropertyId" value={property.id}/><PermissionChecks selected={permissionsForUser(member, property.id)}/></div></ModalForm></form>)}
      </div>;
    })}
  </>;
}
