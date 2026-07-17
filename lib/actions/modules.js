import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { all, get, run, transaction } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { safeRedirect, text } from "@/lib/actions/shared";
import { MODULE_CATALOG, normalizeModuleIds } from "@/lib/modules/catalog";

function refreshModuleViews() {
  ["/modules", "/dashboard", "/properties", "/units", "/leases", "/spaces", "/services", "/visitors", "/commercial", "/settings", "/audit"].forEach(revalidatePath);
}

export async function updateWorkspaceModulesAction(formData) {
  const actor = await requireRole(["owner"]);
  const selected = normalizeModuleIds(formData.getAll("moduleIds"));
  if (!selected.length) throw new Error("Keep at least one operating module enabled");
  const primaryModule = text(formData, "primaryModule") || selected[0];
  if (!selected.includes(primaryModule)) throw new Error("Primary module must be enabled");

  const disabledInUse = all(
    `SELECT module_id,COUNT(*) property_count FROM properties
     WHERE module_id NOT IN (${selected.map(() => "?").join(",")})
     GROUP BY module_id`,
    selected
  );
  if (disabledInUse.length) {
    const names = disabledInUse.map((row) => `${row.module_id} (${row.property_count})`).join(", ");
    throw new Error(`Cannot disable modules used by properties: ${names}`);
  }

  const before = new Set(all("SELECT module_id FROM workspace_modules WHERE enabled=1").map((row) => row.module_id));
  const added = selected.filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !selected.includes(id));

  transaction(() => {
    MODULE_CATALOG.forEach((module, index) => run(
      `INSERT INTO workspace_modules (module_id,enabled,sort_order,updated_at)
       VALUES ($moduleId,$enabled,$sortOrder,CURRENT_TIMESTAMP)
       ON CONFLICT(module_id) DO UPDATE SET enabled=excluded.enabled,sort_order=excluded.sort_order,updated_at=CURRENT_TIMESTAMP`,
      { moduleId: module.id, enabled: selected.includes(module.id) ? 1 : 0, sortOrder: index * 10 + 10 }
    ));
    run(
      `INSERT INTO settings (key,value,updated_at) VALUES ('primary_module',$primaryModule,CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,
      { primaryModule }
    );
    recordAudit({ actor, action: "settings", entityType: "workspace_modules", summary: "Updated operating modules", metadata: { added, removed, primaryModule } });
  });

  refreshModuleViews();
  safeRedirect("/modules", "Workspace modules updated");
}
