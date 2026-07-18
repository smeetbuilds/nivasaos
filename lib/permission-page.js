import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasPortfolioRequirements } from "@/lib/permission-core";
import { runWithPermissionScope } from "@/lib/permission-context";

export async function renderPermissionScopedPage(requirements, Page, props) {
  const user = await requireUser();
  if (!hasPortfolioRequirements(user, requirements)) redirect("/dashboard?error=forbidden");
  return runWithPermissionScope(requirements, () => Page(props));
}
