export function canDeliverLeaseDocument(document, authorize) {
  if (!document || typeof authorize !== "function") return false;
  const propertyId = Number(document.property_id);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return false;
  return authorize("handover.manage", propertyId) === true;
}
