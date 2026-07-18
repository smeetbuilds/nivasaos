import Link from "next/link";
import { createHostelReservationAction, updateHostelReservationStatusAction } from "@/app/actions";
import { all } from "@/lib/db";
import { dateLabel, money, today } from "@/lib/format";
import { permissionScopeSql, requirePortfolioPermission } from "@/lib/permissions";
import PageHeader from "@/components/PageHeader";
import OpenModalButton from "@/components/OpenModalButton";
import ModalForm from "@/components/ModalForm";
import ConfirmAction from "@/components/ConfirmAction";
import ActionButton from "@/components/ActionButton";
import Flash from "@/components/Flash";
import Badge from "@/components/Badge";
import Empty from "@/components/Empty";
import Icon from "@/components/Icon";

export const metadata = { title: "Hostel reservations" };
const statuses = ["checked_in", "reserved", "checked_out", "cancelled", "no_show"];
const nights = (arrival, departure) => Math.max(1, Math.round((new Date(`${departure}T00:00:00Z`) - new Date(`${arrival}T00:00:00Z`)) / 86400000));

function TransitionConfirmation({ item, status, label, title, consequence, triggerClassName = "text-button danger" }) {
  return <ConfirmAction action={updateHostelReservationStatusAction} id={`reservation-${status}-${item.id}`} triggerLabel={label} triggerClassName={triggerClassName} title={title} description={`${item.reference} · ${item.guest_name} · ${item.property_name}`} submitLabel={label} pendingLabel="Updating…"><div className="modal-body"><input type="hidden" name="reservationId" value={item.id}/><input type="hidden" name="status" value={status}/><div className="confirm-consequence">{consequence}</div></div></ConfirmAction>;
}

export default async function ReservationsPage({ searchParams }) {
  const user = await requirePortfolioPermission("reservations.manage");
  const scope = permissionScopeSql(user, "reservations.manage", "p");
  const query = await searchParams;
  const properties = all(`SELECT p.* FROM properties p WHERE ${scope.clause} AND p.module_id='hostel' AND p.status='active' ORDER BY p.name`, scope.params);
  const propertyIds = properties.map((property) => Number(property.id));
  const reservations = propertyIds.length ? all(`SELECT hr.*,p.name property_name,p.currency,u.name unit_name,rs.code space_code,creator.name creator_name FROM hostel_reservations hr JOIN properties p ON p.id=hr.property_id LEFT JOIN units u ON u.id=hr.unit_id LEFT JOIN rentable_spaces rs ON rs.id=hr.space_id LEFT JOIN users creator ON creator.id=hr.created_by WHERE hr.property_id IN (${propertyIds.map(() => "?").join(",")}) ORDER BY CASE hr.status WHEN 'checked_in' THEN 0 WHEN 'reserved' THEN 1 ELSE 2 END,hr.arrival_date,hr.id DESC LIMIT 500`, propertyIds) : [];
  const units = propertyIds.length ? all(`SELECT u.id,u.name,u.property_id,p.name property_name FROM units u JOIN properties p ON p.id=u.property_id WHERE u.property_id IN (${propertyIds.map(() => "?").join(",")}) AND u.status NOT IN ('maintenance','inactive') ORDER BY p.name,u.name`, propertyIds) : [];
  const spaces = propertyIds.length ? all(`SELECT rs.id,rs.code,rs.property_id,rs.unit_id,rs.monthly_rate,p.name property_name,u.name unit_name FROM rentable_spaces rs JOIN properties p ON p.id=rs.property_id JOIN units u ON u.id=rs.unit_id WHERE rs.property_id IN (${propertyIds.map(() => "?").join(",")}) AND rs.status!='inactive' AND u.status NOT IN ('maintenance','inactive') ORDER BY p.name,u.name,rs.code`, propertyIds) : [];
  const filters = {
    q: String(query?.q || "").trim().toLowerCase(),
    property: String(query?.property || ""),
    status: statuses.includes(String(query?.status || "")) ? String(query.status) : "",
    window: ["today", "upcoming", "history"].includes(String(query?.window || "")) ? String(query.window) : ""
  };
  const filteredReservations = reservations.filter((item) => {
    const haystack = `${item.reference} ${item.guest_name} ${item.guest_email || ""} ${item.guest_phone || ""} ${item.property_name} ${item.unit_name || ""} ${item.space_code || ""} ${item.source || ""}`.toLowerCase();
    const windowMatches = !filters.window || (filters.window === "today"
      ? item.arrival_date === today() || item.departure_date === today() || item.status === "checked_in"
      : filters.window === "upcoming"
        ? item.status === "reserved" && item.arrival_date > today()
        : ["checked_out", "cancelled", "no_show"].includes(item.status));
    return (!filters.q || haystack.includes(filters.q)) && (!filters.property || String(item.property_id) === filters.property) && (!filters.status || item.status === filters.status) && windowMatches;
  });
  const arrivals = reservations.filter((item) => item.status === "reserved" && item.arrival_date === today()).length;
  const departures = reservations.filter((item) => item.status === "checked_in" && item.departure_date === today()).length;
  const inHouse = reservations.filter((item) => item.status === "checked_in").length;
  const future = reservations.filter((item) => item.status === "reserved" && item.arrival_date > today()).length;
  const activeValue = reservations.filter((item) => ["reserved", "checked_in"].includes(item.status)).reduce((map, item) => {
    const total = Number(item.nightly_rate) * nights(item.arrival_date, item.departure_date) + Number(item.tax_amount);
    map.set(item.currency, (map.get(item.currency) || 0) + total);
    return map;
  }, new Map());
  const valueRows = [...activeValue.entries()];
  const activeValueLabel = valueRows.length === 0 ? money(0) : valueRows.length === 1 ? money(valueRows[0][1], valueRows[0][0]) : `${valueRows.length} currencies`;
  const activeValueDetail = valueRows.length ? valueRows.map(([currency, total]) => money(total, currency)).join(" · ") : "No active reservation value";
  const emptyText = properties.length ? "Create the first direct, walk-in, phone, group, or channel reservation." : "No permitted active Hostel property is available.";

  return <>
    <Flash searchParams={query}/>
    <PageHeader eyebrow="Front-desk control" title="Reservations, arrivals & departures" description="Coordinate today’s guest movement, future inventory, check-in transitions, no-shows, and housekeeping-triggering checkout from one operational board." actions={properties.length > 0 ? <OpenModalButton target="reservation-create" icon="plus">New reservation</OpenModalButton> : null}/>

    <section className="metric-grid operations-summary-grid" aria-label="Reservation operations summary">
      <article className={`metric-card compact-metric${arrivals ? " risk" : ""}`}><div className="metric-icon"><Icon name="hostel"/></div><span>Arriving today</span><strong>{arrivals}</strong><small>Reserved and awaiting check-in</small></article>
      <article className={`metric-card compact-metric${departures ? " risk" : ""}`}><div className="metric-icon"><Icon name="logout"/></div><span>Departing today</span><strong>{departures}</strong><small>Checked-in stays due out</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="tenant"/></div><span>Currently in house</span><strong>{inHouse}</strong><small>{future} confirmed future arrivals</small></article>
      <article className="metric-card compact-metric"><div className="metric-icon"><Icon name="payment"/></div><span>Active stay value</span><strong>{activeValueLabel}</strong><small>{activeValueDetail}</small></article>
    </section>

    {reservations.length > 0 && <form className="panel operations-toolbar" method="get" aria-label="Filter reservations">
      <div className="operations-toolbar-copy"><span className="eyebrow">Front-desk register</span><strong>Reservation board</strong><small>{filteredReservations.length} of {reservations.length} reservations shown</small></div>
      <div className="operations-filter-grid reservation-filter-grid">
        <label className="operations-search-field"><span>Search</span><input type="search" name="q" defaultValue={query?.q || ""} placeholder="Guest, reference, room, bed, or source"/></label>
        <label><span>Hostel</span><select name="property" defaultValue={filters.property}><option value="">All hostels</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
        <label><span>Status</span><select name="status" defaultValue={filters.status}><option value="">All statuses</option>{statuses.map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
        <label><span>Working window</span><select name="window" defaultValue={filters.window}><option value="">All reservations</option><option value="today">Today and in-house</option><option value="upcoming">Upcoming arrivals</option><option value="history">Completed history</option></select></label>
        <div className="operations-filter-actions"><button className="button secondary" type="submit">Apply</button><Link href="/reservations" className="text-link">Reset</Link></div>
      </div>
    </form>}

    {filteredReservations.length ? <section className="reservation-board enterprise-reservation-board" aria-label="Reservation status board">{statuses.map((status) => {
      const statusItems = filteredReservations.filter((item) => item.status === status);
      return <div className={`reservation-column reservation-column-${status}`} key={status}>
        <div className="reservation-column-head"><div><span className="eyebrow">Stay status</span><strong>{status.replaceAll("_", " ")}</strong></div><span>{statusItems.length}</span></div>
        <div className="reservation-list">{statusItems.length ? statusItems.map((item) => {
          const stayNights = nights(item.arrival_date, item.departure_date);
          const total = Number(item.nightly_rate) * stayNights + Number(item.tax_amount);
          const arrivalTone = item.status === "reserved" && item.arrival_date === today() ? "Arrival today" : item.status === "checked_in" && item.departure_date === today() ? "Departure today" : null;
          return <article className="reservation-card enterprise-reservation-card" key={item.id}>
            <div className="reservation-card-top"><Badge tone={item.status}>{item.status.replaceAll("_", " ")}</Badge><small>{item.reference}</small></div>
            {arrivalTone && <span className="reservation-attention">{arrivalTone}</span>}
            <h2>{item.guest_name}</h2><p>{item.property_name} · {item.unit_name || "Unassigned room"}{item.space_code ? ` · ${item.space_code}` : ""}</p>
            <div className="reservation-dates"><span><small>Arrival</small><strong>{dateLabel(item.arrival_date)}</strong></span><Icon name="arrow" size={15}/><span><small>Departure</small><strong>{dateLabel(item.departure_date)}</strong></span></div>
            <div className="reservation-facts"><span><small>Duration</small><strong>{stayNights} night{stayNights === 1 ? "" : "s"}</strong></span><span><small>Stay value</small><strong>{money(total, item.currency)}</strong></span><span><small>Source</small><strong>{String(item.source || "direct").replaceAll("_", " ")}</strong></span></div>
            <div className="reservation-actions">{item.status === "reserved" && <><form action={updateHostelReservationStatusAction}><input type="hidden" name="reservationId" value={item.id}/><input type="hidden" name="status" value="checked_in"/><ActionButton className="button primary small" pendingLabel="Checking in…">Check in</ActionButton></form><TransitionConfirmation item={item} status="no_show" label="Mark no-show" title="Mark this guest as a no-show?" consequence="This releases the reservation from the active arrival queue and records the no-show transition in the audit history."/><TransitionConfirmation item={item} status="cancelled" label="Cancel reservation" title="Cancel this reservation?" consequence="This removes the reservation from active inventory. The original reservation record remains in history."/></>}{item.status === "checked_in" && <TransitionConfirmation item={item} status="checked_out" label="Check out" title="Check out this guest?" triggerClassName="button primary small" consequence="Checkout ends the active stay and automatically creates the associated housekeeping turnover task."/>}</div>
          </article>;
        }) : <div className="kanban-empty">No matching reservations</div>}</div>
      </div>;
    })}</section> : reservations.length ? <Empty icon="hostel" title="No reservations match these filters" text="Adjust the guest search, hostel, status, or working-window filters to view more stays."/> : <Empty icon="hostel" title="No hostel reservations" text={emptyText}/>} 

    {properties.length > 0 && <form action={createHostelReservationAction}><ModalForm id="reservation-create" title="Create hostel reservation" description="The selected bed is checked for every overlapping active reservation before insertion." submitLabel="Reserve stay" pendingLabel="Reserving…"><div className="modal-body"><label><span>Hostel</span><select name="propertyId" required>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label><div className="field-grid two"><label><span>Room / dorm</span><select name="unitId"><option value="">Assign later</option>{units.map((unit) => <option value={unit.id} key={unit.id}>{unit.property_name} · {unit.name}</option>)}</select></label><label><span>Bed</span><select name="spaceId"><option value="">Assign later</option>{spaces.map((space) => <option value={space.id} key={space.id}>{space.property_name} · {space.unit_name} · {space.code}</option>)}</select></label></div><div className="field-grid two"><label><span>Guest name</span><input name="guestName" required/></label><label><span>Adults</span><input type="number" min="1" name="adults" defaultValue="1"/></label></div><div className="field-grid two"><label><span>Email</span><input type="email" name="guestEmail"/></label><label><span>Phone</span><input name="guestPhone" inputMode="tel"/></label></div><div className="field-grid two"><label><span>Arrival</span><input type="date" name="arrivalDate" defaultValue={today()} required/></label><label><span>Departure</span><input type="date" name="departureDate" required/></label></div><div className="field-grid three"><label><span>Nightly rate</span><input type="number" min="0" step="0.01" name="nightlyRate" defaultValue="0"/></label><label><span>Tax amount</span><input type="number" min="0" step="0.01" name="taxAmount" defaultValue="0"/></label><label><span>Source</span><select name="source"><option value="direct">Direct</option><option value="walk_in">Walk-in</option><option value="phone">Phone</option><option value="group">Group</option><option value="channel">External channel</option></select></label></div><label><span>Identity / passport reference</span><input name="identityReference"/></label><label><span>Notes</span><textarea name="notes" rows="3"/></label></div></ModalForm></form>}
  </>;
}
