import { redirect } from "next/navigation";
import { currentUser, isInstalled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isInstalled()) redirect("/install");
  const user = await currentUser();
  redirect(user ? "/dashboard" : "/login");
}
