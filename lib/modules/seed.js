import "server-only";
import { run } from "@/lib/db";
import { moduleById, supportsCapability } from "@/lib/modules/catalog";

export function seedPropertyTemplate({ propertyId, moduleId, actorId = null }) {
  const module = moduleById(moduleId);
  const unitIds = [];
  for (const unit of module.starter.units) {
    const inserted = run(
      `INSERT INTO units (property_id,name,unit_type,capacity,monthly_rate,deposit,status,notes)
       VALUES ($propertyId,$name,$unitType,$capacity,0,0,'available',$notes)`,
      {
        propertyId,
        name: unit.name,
        unitType: unit.unitType,
        capacity: unit.capacity,
        notes: `${module.shortLabel} starter structure. Configure rates and policies before use.`
      }
    );
    unitIds.push(Number(inserted.lastInsertRowid));
  }

  if (supportsCapability(module.id, "spaceInventory") && unitIds[0]) {
    module.starter.spaces.forEach((code) => run(
      `INSERT INTO rentable_spaces (property_id,unit_id,code,space_type,monthly_rate,deposit,gender_policy,status,notes)
       VALUES ($propertyId,$unitId,$code,'bed',0,0,'any','available',$notes)`,
      {
        propertyId,
        unitId: unitIds[0],
        code,
        notes: "Starter space. Configure pricing and allocation policy before occupancy."
      }
    ));
  }

  if (supportsCapability(module.id, "servicePlans")) {
    module.starter.services.forEach((service) => run(
      `INSERT INTO service_catalog (property_id,name,category,billing_frequency,amount,description,active,created_by)
       VALUES ($propertyId,$name,$category,$billingFrequency,0,$description,1,$actorId)`,
      {
        propertyId,
        name: service.name,
        category: service.category,
        billingFrequency: service.billingFrequency,
        description: `Starter ${service.name.toLowerCase()} service. Configure the charge before assigning it.`,
        actorId
      }
    ));
  }

  return {
    units: unitIds.length,
    spaces: module.starter.spaces.length,
    services: module.starter.services.length
  };
}
