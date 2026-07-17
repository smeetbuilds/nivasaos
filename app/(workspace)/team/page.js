import { createTeamMemberAction, toggleUserAction, updateTeamMemberAction, updateUserPermissionsAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { accessibleProperties } from "@/lib/data";
import { dateLabel } from "@/lib/format";
import { permissionsForUser } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/verticals";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";

export const metadata = { title: "Team" };

const permissionGroups = {
  Portfolio: ["portfolio.view", "people.manage", "agreements.manage", "verticals.manage"],
  Finance: ["billing.manage", "payments.manage", "services.manage"],
  Operations: ["visitors.manage", "maintenance.manage", "handover.manage", "requests.review", "reservations.manage", "housekeeping.manage"],
  Governance: ["reports.view", "team.manage", "settings.manage", "audit.view"]
};

function permissionLabel(value) {
  return value.replace(".manage", "").replace(".view", "").replace(".review", " review").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PropertyChecks({ properties, selected = [] }) {
  const selectedSet = new Set(selected.map(Number));
  return <fieldset className="checkbox-fieldset"><legend>Assigned properties</legend><div className="checkbox-grid">{properties.map((property) => <label className="check-card" key={property.id}><input type="checkbox" name="propertyIds" value={property.id} defaultChecked={selectedSet.has(Number(property.id))}/><span><strong>{property.name}</strong><small>{property.city || property.country}</small></span></label>)}</div><small>Property assignment is the hard data boundary. Permissions cannot grant access outside this list.</small></fieldset>;
}

function PermissionChecks({ selected }) {
  const selectedSet = new Set(selected);
  return <div className="permission-matrix">{Object.entries(permissionGroups).map(([group, permissions]) => <fieldset key={group}><legend>{group}</legend><div className="permission-grid">{permissions.map((permission) => <label className="permission-card" key={permission}><input type="checkbox" name="permissions" value={permission} defaultChecked={selectedSet.has(permission)}/><span><strong>{permissionLabel(permission)}</strong><small>{permission}</small></span></label>)}</div></fieldset>)}</div>;
}

export default async function TeamPage({ searchParams }) {
  const user = await requireRole(["owner"]);
  const properties = accessibleProperties(user);
  const members = all(
    `SELECT u.id,u.name,u.email,u.role,u.status,u.created_at,
      GROUP_CONCAT(p.name, ', ') property_names,GROUP_CONCAT(p.id, ',') property_ids
     FROM users u LEFT JOIN user_properties up ON up.user_id=u.id LEFT JOIN properties p ON p.id=up.property_id
     GROUP BY u.id ORDER BY CASE u.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.name`
  );
  const query = await searchParams;

  return <>
    <Flash searchParams={query}/><PageHeader eyebrow="Access control" title="Team, roles & permissions" description="Property assignment controls which records are reachable. The permission matrix controls what each account may do globally or inside an assigned property." actions={<OpenModalButton target="team-modal">Add team member</OpenModalButton>}/>
    <div className="role-cards"><article><strong>Owner</strong><span>Immutable full system control.</span></article><article><strong>Admin</strong><span>Broad operational defaults with owner-controlled overrides.</span></article><article><strong>Staff</strong><span>Task-focused defaults that can be narrowed by property.</span></article></div>
    <div className="panel"><div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Property scope</th><th>Effective permissions</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead><tbody>{members.map((member) => { const effective = member.role === "owner" ? PERMISSIONS : permissionsForUser(member); return <tr key={member.id}><td><div className="person-cell"><span className="avatar">{member.name[0]}</span><span><strong>{member.name}</strong><small>{member.email}</small></span></div></td><td><Badge tone={member.role}>{member.role}</Badge></td><td>{member.role === "owner" ? "All properties" : member.property_names || "No properties assigned"}</td><td><strong>{effective.length}</strong><small>of {PERMISSIONS.length} capabilities</small></td><td>{dateLabel(member.created_at.slice(0, 10))}</td><td><Badge tone={member.status}>{member.status}</Badge></td><td>{member.role !== "owner" && <div className="row-actions"><OpenModalButton target={`team-edit-${member.id}`} icon="edit" className="text-button">Account</OpenModalButton><OpenModalButton target={`permissions-${member.id}-global`} icon="audit" className="text-button">Permissions</OpenModalButton><form action={toggleUserAction}><input type="hidden" name="userId" value={member.id}/><button className={`text-button ${member.status === "active" ? "danger" : ""}`}>{member.status === "active" ? "Disable" : "Enable"}</button></form></div>}</td></tr>; })}</tbody></table></div></div>

    <form action={createTeamMemberAction}><ModalForm id="team-modal" title="Add a team member" description="Create their login and choose the properties they can reach. Permissions can be refined after creation." submitLabel="Create account" pendingLabel="Creating…"><div className="modal-body"><div className="field-grid two"><label><span>Name</span><input name="name" required/></label><label><span>Role</span><select name="role"><option value="staff">Staff</option><option value="admin">Admin</option></select></label></div><label><span>Email</span><input type="email" name="email" required/></label><label><span>Temporary password</span><input type="password" name="password" minLength="10" required/><small>Share it securely and ask the user to replace it.</small></label><PropertyChecks properties={properties}/></div></ModalForm></form>

    {members.filter((member) => member.role !== "owner").map((member) => {
      const selectedProperties = String(member.property_ids || "").split(",").filter(Boolean).map(Number);
      const propertyRecords = properties.filter((property) => selectedProperties.includes(Number(property.id)));
      return <div key={`controls-${member.id}`}>
        <form action={updateTeamMemberAction}><ModalForm id={`team-edit-${member.id}`} title={`Edit ${member.name}`} description="Role and property changes revoke inaccessible assignments and permission overrides." submitLabel="Save access" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="userId" value={member.id}/><div className="field-grid two"><label><span>Name</span><input name="name" defaultValue={member.name} required/></label><label><span>Role</span><select name="role" defaultValue={member.role}><option value="staff">Staff</option><option value="admin">Admin</option></select></label></div><label><span>Email</span><input type="email" name="email" defaultValue={member.email} required/></label><PropertyChecks properties={properties} selected={selectedProperties}/></div></ModalForm></form>
        <form action={updateUserPermissionsAction}><ModalForm id={`permissions-${member.id}-global`} title={`${member.name} · global permissions`} description="These effective capabilities apply across every property assigned to this account. Saving revokes active sessions." submitLabel="Save global permissions" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="userId" value={member.id}/><PermissionChecks selected={permissionsForUser(member)}/>{propertyRecords.length > 0 && <div className="permission-scope-links"><span>Property-specific overrides</span>{propertyRecords.map((property) => <OpenModalButton key={property.id} target={`permissions-${member.id}-${property.id}`} className="button secondary">{property.name}</OpenModalButton>)}</div>}</div></ModalForm></form>
        {propertyRecords.map((property) => <form action={updateUserPermissionsAction} key={`permission-form-${member.id}-${property.id}`}><ModalForm id={`permissions-${member.id}-${property.id}`} title={`${member.name} · ${property.name}`} description="This explicit property matrix overrides the account’s global permissions only for this assigned property." submitLabel="Save property permissions" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="userId" value={member.id}/><input type="hidden" name="permissionPropertyId" value={property.id}/><PermissionChecks selected={permissionsForUser(member, property.id)}/></div></ModalForm></form>)}
      </div>;
    })}
  </>;
}
