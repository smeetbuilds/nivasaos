import WorkspacePage from "./workspace";
import { renderPermissionScopedPage } from "@/lib/permission-page";

export { metadata } from "./workspace";

export default function Page(props) {
  return renderPermissionScopedPage({ allOf: ["portal.manage", "payments.manage", "deposits.manage"] }, WorkspacePage, props);
}
