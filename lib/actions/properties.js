import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { run } from "@/lib/db";
import { assertProperty, integer, number, safeRedirect, text } from "@/lib/actions/shared";

export async function createPropertyAction(formData) {
  const actor = await requireRole(["owner", "admin"]);
  const result = run(
    `INSERT INTO properties (name,type,address,city,country,currency)
     VALUES ($name,$type,$address,$city,$country,$currency)`,
    {
      name: text(formData, "name", true),
      type: text(formData, "type") || "apartment",
      address: text(formData, "address", true),
      city: text(formData, "city"),
      country: text(formData, "country") || "India",
      currency: text(formData, "currency") || "INR"
    }
  );
  if (actor.role === "admin") {
    run("INSERT OR IGNORE INTO user_properties (user_id,property_id) VALUES ($userId,$propertyId)", { userId: actor.id, propertyId: Number(result.lastInsertRowid) });
  }
  revalidatePath("/properties");
  revalidatePath("/dashboard");
  safeRedirect("/properties", "Property created");
}

export async function createUnitAction(formData) {
  const user = await requireRole(["owner", "admin"]);
  const propertyId = await assertProperty(formData, user);
  run(
    `INSERT INTO units (property_id,name,unit_type,floor,capacity,monthly_rate,deposit,status,notes)
     VALUES ($propertyId,$name,$unitType,$floor,$capacity,$monthlyRate,$deposit,$status,$notes)`,
    {
      propertyId,
      name: text(formData, "name", true),
      unitType: text(formData, "unitType") || "room",
      floor: text(formData, "floor"),
      capacity: Math.max(1, integer(formData, "capacity", 1)),
      monthlyRate: Math.max(0, number(formData, "monthlyRate")),
      deposit: Math.max(0, number(formData, "deposit")),
      status: text(formData, "status") || "available",
      notes: text(formData, "notes")
    }
  );
  revalidatePath("/units");
  revalidatePath("/dashboard");
  safeRedirect("/units", "Unit created");
}

export async function createTenantAction(formData) {
  const user = await requireUser();
  const propertyId = await assertProperty(formData, user);
  run(
    `INSERT INTO tenants (property_id,full_name,email,phone,identity_number,emergency_contact,address,status)
     VALUES ($propertyId,$fullName,$email,$phone,$identity,$emergency,$address,$status)`,
    {
      propertyId,
      fullName: text(formData, "fullName", true),
      email: text(formData, "email"),
      phone: text(formData, "phone", true),
      identity: text(formData, "identityNumber"),
      emergency: text(formData, "emergencyContact"),
      address: text(formData, "address"),
      status: text(formData, "status") || "active"
    }
  );
  revalidatePath("/tenants");
  safeRedirect("/tenants", "Tenant added");
}
