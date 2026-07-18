"use client";

import { useId, useMemo, useState } from "react";

export default function LeaseTenantFields({ leases, tenants }) {
  const [leaseId, setLeaseId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const helpId = useId();
  const filteredTenants = useMemo(
    () => tenants.filter((tenant) => String(tenant.lease_id) === leaseId),
    [leaseId, tenants]
  );

  const changeLease = (event) => {
    setLeaseId(event.target.value);
    setTenantId("");
  };

  return <>
    <label>
      <span>Lease</span>
      <select name="leaseId" required value={leaseId} onChange={changeLease}>
        <option value="">Select lease</option>
        {leases.map((lease) => <option value={lease.id} key={lease.id}>{lease.property_name} · {lease.unit_name} · {lease.reference}</option>)}
      </select>
    </label>
    <label>
      <span>Tenant attribution (optional)</span>
      <select
        name="tenantId"
        value={tenantId}
        onChange={(event) => setTenantId(event.target.value)}
        disabled={!leaseId || !filteredTenants.length}
        aria-describedby={helpId}
      >
        <option value="">Lease-level</option>
        {filteredTenants.map((tenant) => <option value={tenant.id} key={`${tenant.lease_id}-${tenant.id}`}>{tenant.full_name}</option>)}
      </select>
      <small id={helpId}>
        {!leaseId ? "Select a lease first." : filteredTenants.length ? "Only tenants linked to this lease are available." : "This lease has no linked tenants; the transaction will be lease-level."}
      </small>
    </label>
  </>;
}
