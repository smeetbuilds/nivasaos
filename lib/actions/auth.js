import { redirect } from "next/navigation";
import { createSession, destroySession, hashPassword, isInstalled, verifyPassword } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { text } from "@/lib/actions/shared";

export async function installAction(formData) {
  if (isInstalled()) redirect("/login");
  const name = text(formData, "name", true);
  const email = text(formData, "email", true).toLowerCase();
  const password = text(formData, "password", true);
  const company = text(formData, "company", true);
  const currency = text(formData, "currency") || "INR";
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 10) throw new Error("Password must be at least 10 characters");

  const result = run(
    "INSERT INTO users (name,email,password_hash,role) VALUES ($name,$email,$hash,'owner')",
    { name, email, hash: hashPassword(password) }
  );
  run("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('company_name',$company,CURRENT_TIMESTAMP)", { company });
  run("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('default_currency',$currency,CURRENT_TIMESTAMP)", { currency });
  run("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('timezone','Asia/Kolkata',CURRENT_TIMESTAMP)");
  run("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('whatsapp_template','Hello {tenant}, rent invoice {invoice} has an outstanding balance of {balance} due on {due_date}. Please share payment details once paid.',CURRENT_TIMESTAMP)");

  if (formData.get("demo") === "on") {
    const property = run("INSERT INTO properties (name,type,address,city,currency) VALUES ('Palm Residency','boarding_house','21 Sample Avenue','Surat',$currency)", { currency });
    const propertyId = Number(property.lastInsertRowid);
    run("INSERT INTO units (property_id,name,unit_type,capacity,monthly_rate,deposit,status) VALUES ($propertyId,'Room 101','Private room',1,12000,12000,'available')", { propertyId });
    run("INSERT INTO units (property_id,name,unit_type,capacity,monthly_rate,deposit,status) VALUES ($propertyId,'Room 102','Shared room',2,8500,8500,'available')", { propertyId });
  }

  await createSession(Number(result.lastInsertRowid));
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
