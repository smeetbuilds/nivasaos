export const DEFAULT_MODULE_ID = "residential";

export const MODULE_CATALOG = Object.freeze([
  {
    id: "residential",
    label: "Residential rentals",
    shortLabel: "Residential",
    icon: "home",
    family: "Long-term leasing",
    description: "Apartments, houses, villas, and conventional residential portfolios with deposits, meter handover, maintenance, and household leases.",
    terminology: { property: "Property", unit: "Unit", occupant: "Tenant", agreement: "Lease", portal: "Resident portal" },
    capabilities: ["billing", "maintenance", "handover", "tenantPortal", "meterHandover"],
    propertyType: "apartment",
    starter: {
      units: [{ name: "Apartment 101", unitType: "Apartment", capacity: 1 }],
      spaces: [],
      services: []
    }
  },
  {
    id: "pg_coliving",
    label: "PG & co-living",
    shortLabel: "PG / Co-living",
    icon: "coliving",
    family: "Managed shared living",
    description: "Paying-guest and co-living operations with room/bed allocation, resident services, visitor controls, deposits, and recurring billing.",
    terminology: { property: "Residence", unit: "Room", occupant: "Resident", agreement: "Stay agreement", portal: "Resident portal" },
    capabilities: ["billing", "maintenance", "handover", "tenantPortal", "spaceInventory", "servicePlans", "visitorRegister"],
    propertyType: "boarding_house",
    starter: {
      units: [{ name: "Room 101", unitType: "Shared room", capacity: 3 }],
      spaces: ["Bed A", "Bed B", "Bed C"],
      services: [
        { name: "Meal plan", category: "meals", billingFrequency: "monthly" },
        { name: "Laundry", category: "laundry", billingFrequency: "monthly" },
        { name: "Wi-Fi", category: "utilities", billingFrequency: "monthly" }
      ]
    }
  },
  {
    id: "hostel",
    label: "Hostel & dormitory",
    shortLabel: "Hostel",
    icon: "hostel",
    family: "High-density accommodation",
    description: "Hostels and dormitories with bed-level occupancy, access tracking, meal or locker services, visitor records, and fast check-in/check-out operations.",
    terminology: { property: "Hostel", unit: "Dorm / Room", occupant: "Resident", agreement: "Stay record", portal: "Resident portal" },
    capabilities: ["billing", "maintenance", "handover", "tenantPortal", "spaceInventory", "servicePlans", "visitorRegister"],
    propertyType: "boarding_house",
    starter: {
      units: [{ name: "Dorm 01", unitType: "Dormitory", capacity: 4 }],
      spaces: ["Bed 01", "Bed 02", "Bed 03", "Bed 04"],
      services: [
        { name: "Meal plan", category: "meals", billingFrequency: "monthly" },
        { name: "Locker", category: "storage", billingFrequency: "monthly" }
      ]
    }
  },
  {
    id: "student_housing",
    label: "Student housing",
    shortLabel: "Student housing",
    icon: "student",
    family: "Academic accommodation",
    description: "Purpose-built student residences with bed allocation, guardian-ready resident records, services, visitor oversight, and term-based occupancy.",
    terminology: { property: "Residence", unit: "Room", occupant: "Student", agreement: "Housing agreement", portal: "Student portal" },
    capabilities: ["billing", "maintenance", "handover", "tenantPortal", "spaceInventory", "servicePlans", "visitorRegister"],
    propertyType: "boarding_house",
    starter: {
      units: [{ name: "Room A-101", unitType: "Twin sharing", capacity: 2 }],
      spaces: ["Bed A", "Bed B"],
      services: [
        { name: "Wi-Fi", category: "utilities", billingFrequency: "monthly" },
        { name: "Laundry", category: "laundry", billingFrequency: "monthly" },
        { name: "Study locker", category: "storage", billingFrequency: "monthly" }
      ]
    }
  },
  {
    id: "staff_housing",
    label: "Staff accommodation",
    shortLabel: "Staff housing",
    icon: "staffHousing",
    family: "Employer-managed housing",
    description: "Company or institutional staff housing with room/bed assignment, employee occupancy, included services, visitors, and auditable handovers.",
    terminology: { property: "Accommodation", unit: "Room / Quarter", occupant: "Employee resident", agreement: "Occupancy agreement", portal: "Resident portal" },
    capabilities: ["billing", "maintenance", "handover", "tenantPortal", "spaceInventory", "servicePlans", "visitorRegister"],
    propertyType: "boarding_house",
    starter: {
      units: [{ name: "Quarter 01", unitType: "Staff room", capacity: 2 }],
      spaces: ["Space A", "Space B"],
      services: [
        { name: "Utilities package", category: "utilities", billingFrequency: "monthly" },
        { name: "Housekeeping", category: "housekeeping", billingFrequency: "monthly" }
      ]
    }
  },
  {
    id: "commercial",
    label: "Commercial rentals",
    shortLabel: "Commercial",
    icon: "commercial",
    family: "Business premises",
    description: "Shops, offices, warehouses, and business premises with business profiles, common-area charges, escalation tracking, fit-out dates, and commercial handover.",
    terminology: { property: "Commercial property", unit: "Premises", occupant: "Business tenant", agreement: "Commercial lease", portal: "Tenant portal" },
    capabilities: ["billing", "maintenance", "handover", "tenantPortal", "servicePlans", "commercialProfiles", "meterHandover"],
    propertyType: "rental",
    starter: {
      units: [{ name: "Suite 101", unitType: "Office / Shop", capacity: 1 }],
      spaces: [],
      services: [
        { name: "Common area maintenance", category: "cam", billingFrequency: "monthly" },
        { name: "Reserved parking", category: "parking", billingFrequency: "monthly" }
      ]
    }
  }
]);

const moduleMap = new Map(MODULE_CATALOG.map((module) => [module.id, module]));

export const MODULE_IDS = Object.freeze(MODULE_CATALOG.map((module) => module.id));

export function moduleById(id) {
  return moduleMap.get(String(id || "")) || moduleMap.get(DEFAULT_MODULE_ID);
}

export function normalizeModuleIds(values) {
  const requested = new Set((Array.isArray(values) ? values : [values]).map(String));
  return MODULE_IDS.filter((id) => requested.has(id));
}

export function supportsCapability(moduleId, capability) {
  return moduleById(moduleId).capabilities.includes(capability);
}

export function modulesForCapability(capability) {
  return MODULE_CATALOG.filter((module) => module.capabilities.includes(capability));
}

export function legacyPropertyTypeForModule(moduleId) {
  return moduleById(moduleId).propertyType;
}
