import { createTeamMemberAction, toggleUserAction, updateTeamMemberAction } from "@/app/actions";
import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { accessibleProperties } from "@/lib/data";
import { dateLabel } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";

export const metadata = { title: "Team" };

function PropertyChecks({ properties, selected = [] }) {
  const selectedSet = new Set(selected.map(Number));
  return <fieldset className="checkbox-fieldset"><legend>Assigned properties</legend><div className="checkbox-grid">{properties.map((property) => <label className="check-card" key={property.id}><input type="checkbox" name="propertyIds" value={property.id} defaultChecked={selectedSet.has(Number(property.id))}/><span><strong>{property.name}</strong><small>{property.city || property.country}</small></span></label>)}</div><small>Accounts only see records belonging to their assigned properties.</small></fieldset>;
}

export default async function TeamPage({ searchParams }) {
  const user = await requireRole(["owner"]);
  const properties = accessibleProperties(user);
  const members = all(
    `SELECT u.id,u.name,u.email,u.role,u.status,u.created_at,
      GROUP_CONCAT(p.name, ', ') property_names,
      GROUP_CONCAT(p.id, ',') property_ids
     FROM users u
     LEFT JOIN user_properties up ON up.user_id=u.id
     LEFT JOIN properties p ON p.id=up.property_id
     GROUP BY u.id
     ORDER BY CASE u.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.name`
  );
  const query = await searchParams;

  return <>
    <Flash searchParams={query}/><PageHeader eyebrow="Access control" title="Team & roles" description="Owners have full portfolio control. Admin and staff accounts are restricted to assigned properties." actions={<OpenModalButton target="team-modal">Add team member</OpenModalButton>}/>
    <div className="role-cards"><article><strong>Owner</strong><span>Full system, settings, audit, and team control.</span></article><article><strong>Admin</strong><span>Manage assigned properties and operational data.</span></article><article><strong>Staff</strong><span>Day-to-day tenant, invoice, payment, and maintenance work.</span></article></div>
    <div className="panel"><div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Property scope</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><div className="person-cell"><span className="avatar">{member.name[0]}</span><span><strong>{member.name}</strong><small>{member.email}</small></span></div></td><td><Badge tone={member.role}>{member.role}</Badge></td><td>{member.role === "owner" ? "All properties" : member.property_names || "No properties assigned"}</td><td>{dateLabel(member.created_at.slice(0, 10))}</td><td><Badge tone={member.status}>{member.status}</Badge></td><td>{member.role !== "owner" && <div className="row-actions"><OpenModalButton target={`team-edit-${member.id}`} icon="edit" className="text-button">Edit</OpenModalButton><form action={toggleUserAction}><input type="hidden" name="userId" value={member.id}/><button className={`text-button ${member.status === "active" ? "danger" : ""}`}>{member.status === "active" ? "Disable" : "Enable"}</button></form></div>}</td></tr>)}</tbody></table></div></div>

    <form action={createTeamMemberAction}><ModalForm id="team-modal" title="Add a team member" description="Create their login and choose exactly which properties they can access." submitLabel="Create account" pendingLabel="Creating…"><div className="modal-body"><div className="field-grid two"><label><span>Name</span><input name="name" required/></label><label><span>Role</span><select name="role"><option value="staff">Staff</option><option value="admin">Admin</option></select></label></div><label><span>Email</span><input type="email" name="email" required/></label><label><span>Temporary password</span><input type="password" name="password" minLength="10" required/><small>Share it securely and ask the user to use a unique password.</small></label><PropertyChecks properties={properties}/></div></ModalForm></form>

    {members.filter((member) => member.role !== "owner").map((member) => {
      const selected = String(member.property_ids || "").split(",").filter(Boolean).map(Number);
      return <form action={updateTeamMemberAction} key={`edit-${member.id}`}><ModalForm id={`team-edit-${member.id}`} title={`Edit ${member.name}`} description="Role and property scope changes apply to the account’s next request." submitLabel="Save access" pendingLabel="Saving…"><div className="modal-body"><input type="hidden" name="userId" value={member.id}/><div className="field-grid two"><label><span>Name</span><input name="name" defaultValue={member.name} required/></label><label><span>Role</span><select name="role" defaultValue={member.role}><option value="staff">Staff</option><option value="admin">Admin</option></select></label></div><label><span>Email</span><input type="email" name="email" defaultValue={member.email} required/></label><PropertyChecks properties={properties} selected={selected}/></div></ModalForm></form>;
    })}
  </>;
}
