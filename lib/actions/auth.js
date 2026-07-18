import { redirect } from "next/navigation";
import { createSession, destroySession, hashPassword, isInstalled, verifyPassword } from "@/lib/auth";
import { get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { assertInstallationToken } from "@/lib/runtime-config";
import { text } from "@/lib/actions/shared";
import { MODULE_CATALOG, moduleById, normalizeModuleIds } from "@/lib/modules/catalog";
import { seedPropertyTemplate } from "@/lib/modules/seed";
import { verticalContract } from "@/lib/verticals";

const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED", "AUD", "CAD", "SGD"];

function moduleDefaults(formData, moduleId) {
  const settings = {};
  for (const key of verticalContract(moduleId).config) {
    const value = String(formData.get(`moduleConfig_${moduleId}_${key}`) || "").trim();
    if (value.length > 500) throw new Error(`${key} is too long`);
    settings[key] = value;
  }
  return settings;
}

export async function installAction(formData) {
  if (isInstalled()) redirect("/login");
  assertInstallationToken(formData.get("installToken"));
  const name = text(formData, "name", true);
  const email = text(formData, "email", true).toLowerCase();
  const password = text(formData, "password", true);
  const company = text(formData, "company", true);
  const currency = text(formData, "currency", true);
  const timezone = text(formData, "timezone", true);
  const moduleIds = normalizeModuleIds(formData.getAll("moduleIds"));
  const primaryModule = text(formData, "primaryModule") || moduleIds[0];
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 10) throw new Error("Password must be at least 10 characters");
  if (!CURRENCIES.includes(currency)) throw new Error("Select a supported currency");
  if (!moduleIds.length) throw new Error("Select at least one operating module");
  if (!moduleIds.includes(primaryModule)) throw new Error("Primary module must be selected");
  if (timezone.length > 100) throw new Error("Timezone is too long");
  const defaults = Object.fromEntries(moduleIds.map((moduleId) => [moduleId, moduleDefaults(formData, moduleId)]));

  const ownerId = transaction(() => {
    const result = run("INSERT INTO users (name,email,password_hash,role) VALUES ($name,$email,$hash,'owner')", { name, email, hash: hashPassword(password) });
    const id = Number(result.lastInsertRowid);
    const actor = { id, name, email, role: "owner" };
    const settings = {
      company_name: company,
      default_currency: currency,
      timezone,
      primary_module: primaryModule,
      whatsapp_template: "Hello {tenant}, invoice {invoice} has an outstanding balance of {balance} due on {due_date}. Please share payment details once paid."
    };
    Object.entries(settings).forEach(([key, value]) => run("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ($key,$value,CURRENT_TIMESTAMP)", { key, value }));
    MODULE_CATALOG.forEach((module, index) => run(
      `INSERT INTO workspace_modules (module_id,enabled,sort_order,settings_json)
       VALUES ($moduleId,$enabled,$sortOrder,$settingsJson)`,
      { moduleId: module.id, enabled: moduleIds.includes(module.id) ? 1 : 0, sortOrder: index * 10 + 10, settingsJson: JSON.stringify(defaults[module.id] || {}) }
    ));

    if (formData.get("demo") === "on") {
      const module = moduleById(primaryModule);
      const property = run(
        `INSERT INTO properties (name,type,module_id,address,city,currency)
         VALUES ($name,$type,$moduleId,'1 Demo Avenue','Demo City',$currency)`,
        { name: `${module.shortLabel} Demo`, type: module.propertyType, moduleId: module.id, currency }
      );
      const propertyId = Number(property.lastInsertRowid);
      run(
        `INSERT INTO property_operating_configs (property_id,module_id,settings_json,configured_by)
         VALUES ($propertyId,$moduleId,$settingsJson,$actorId)`,
        { propertyId, moduleId: module.id, settingsJson: JSON.stringify(defaults[module.id] || {}), actorId: id }
      );
      const seeded = seedPropertyTemplate({ propertyId, moduleId: module.id, actorId: id });
      recordAudit({ actor, action: "create", entityType: "property", entityId: propertyId, propertyId, summary: `Created ${module.shortLabel} installer demo`, metadata: { demo: true, moduleId: module.id, ...seeded } });
    }
    recordAudit({ actor, action: "create", entityType: "installation", summary: `Installed NivasaOS for ${company}`, metadata: { currency, timezone, moduleIds, primaryModule, configuredModules: Object.keys(defaults), demo: formData.get("demo") === "on" } });
    return id;
  });

  await createSession(ownerId);
  redirect("/dashboard?welcome=1");
}

export async function loginAction(formData) {
  if (!isInstalled()) redirect("/install");
  const email = text(formData, "email", true).toLowerCase();
  const password = text(formData, "password", true);
  const user = get("SELECT * FROM users WHERE email=$email AND status='active'", { email });
  if (!user || !verifyPassword(password, user.password_hash)) redirect("/login?error=Invalid%20email%20or%20password");
  run("DELETE FROM sessions WHERE expires_at <= $now", { now: new Date().toISOString() });
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
