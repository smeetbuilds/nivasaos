import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { csvCell } from "../lib/csv.js";
import { mobileNavigationItems } from "../lib/navigation.js";
import { migrateDatabase } from "../lib/schema/migrate.js";

const failures = [];
const read = (file) => fs.readFileSync(file, "utf8");
const requireText = (file, needle, message) => {
  if (!fs.existsSync(file) || !read(file).includes(needle)) failures.push(message);
};
const rejectText = (file, needle, message) => {
  if (fs.existsSync(file) && read(file).includes(needle)) failures.push(message);
};
const rejectsWith = (callback, pattern, message) => {
  try {
    callback();
    failures.push(message);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!pattern.test(detail)) failures.push(`${message}: unexpected error ${detail}`);
  }
};

requireText("lib/actions/leases.js", "const claimed = run(", "Non-space agreements do not atomically claim their unit");
requireText("lib/actions/leases.js", "Number(claimed.changes) !== 1", "Unit claim does not reject stale availability");
requireText("lib/schema/migrate.js", "060-flow-hardening-v1", "Flow-hardening migration is not registered");
requireText("lib/schema/flow-hardening-migrations.js", "trg_single_unit_active_lease_insert", "Database does not prevent multiple active unit agreements");
requireText("lib/schema/release-migrations.js", "trg_hostel_reservation_overlap_insert", "Database does not prevent overlapping hostel reservations");
requireText("lib/actions/team.js", 'passwordInput(formData, "password")', "Team account creation bypasses bounded password parsing");
rejectText("lib/actions/team.js", 'const password = text(formData, "password"', "Team account creation still accepts unbounded passwords");
requireText("app/api/reports/export/route.js", 'import { csvRow } from "@/lib/csv"', "Report export bypasses the formula-safe CSV encoder");
requireText("components/AppShell.js", "mobileNavigationItems(flatNav)", "Mobile navigation does not fill from the user's permitted routes");

if (csvCell("=2+2") !== "'=2+2") failures.push("CSV formula prefix was not neutralized");
if (csvCell(" \t@SUM(A1:A2)") !== "' \t@SUM(A1:A2)") failures.push("CSV formula prefix after whitespace was not neutralized");
if (csvCell(-42) !== "-42") failures.push("CSV encoder changed a genuine numeric value");
if (csvCell("safe,value") !== '"safe,value"') failures.push("CSV encoder no longer quotes delimiter-containing text");

const delegatedNavigation = [
  ["/tenants", "tenant", "People", "people.manage"],
  ["/services", "services", "Services", "services.manage"],
  ["/housekeeping", "maintenance", "Housekeeping", "housekeeping.manage"],
  ["/reports", "report", "Reports", "reports.view"],
  ["/audit", "audit", "Audit log", "audit.view"]
];
const delegatedPrimary = mobileNavigationItems(delegatedNavigation);
if (delegatedPrimary.length !== 4) failures.push("Delegated mobile navigation did not fill all four quick-action slots");
if (delegatedPrimary.map((item) => item[0]).join(",") !== "/tenants,/services,/housekeeping,/reports") failures.push("Delegated mobile navigation did not preserve the permitted fallback order");

const databaseRoot = fs.mkdtempSync(path.join(tmpdir(), "nivasaos-flow-hardening-"));
const databasePath = path.join(databaseRoot, "flow.sqlite");
const primary = new Database(databasePath, { create: true, strict: true });
let secondary = null;
try {
  migrateDatabase(primary, { applicationVersion: "test" });
  secondary = new Database(databasePath, { create: false, strict: true });
  secondary.exec("PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON;");

  const residentialProperty = Number(primary.query(
    "INSERT INTO properties (name,type,module_id,address,country,currency) VALUES ('Residential','apartment','residential','1 Test Road','Test','USD')"
  ).run().lastInsertRowid);
  const residentialUnit = Number(primary.query(
    "INSERT INTO units (property_id,name,capacity,monthly_rate,deposit,status) VALUES ($propertyId,'Unit 1',1,100,0,'available')"
  ).run({ propertyId: residentialProperty }).lastInsertRowid);

  const firstPrecheck = Number(primary.query("SELECT COUNT(*) count FROM leases WHERE unit_id=$unitId AND status='active'").get({ unitId: residentialUnit }).count);
  const staleSecondPrecheck = Number(secondary.query("SELECT COUNT(*) count FROM leases WHERE unit_id=$unitId AND status='active'").get({ unitId: residentialUnit }).count);
  if (firstPrecheck !== 0 || staleSecondPrecheck !== 0) failures.push("Agreement concurrency fixture did not begin from shared available state");

  primary.transaction(() => {
    const claimed = primary.query("UPDATE units SET status='occupied' WHERE id=$unitId AND status='available'").run({ unitId: residentialUnit });
    if (Number(claimed.changes) !== 1) throw new Error("Primary agreement fixture could not claim its unit");
    primary.query(
      "INSERT INTO leases (property_id,unit_id,reference,start_date,monthly_rent,deposit,billing_day,status) VALUES ($propertyId,$unitId,'LEASE-A','2026-07-01',100,0,1,'active')"
    ).run({ propertyId: residentialProperty, unitId: residentialUnit });
  })();

  const staleClaim = secondary.query("UPDATE units SET status='occupied' WHERE id=$unitId AND status='available'").run({ unitId: residentialUnit });
  if (Number(staleClaim.changes) !== 0) failures.push("Stale agreement request was able to claim already occupied inventory");
  rejectsWith(
    () => secondary.query(
      "INSERT INTO leases (property_id,unit_id,reference,start_date,monthly_rent,deposit,billing_day,status) VALUES ($propertyId,$unitId,'LEASE-B','2026-07-02',100,0,1,'active')"
    ).run({ propertyId: residentialProperty, unitId: residentialUnit }),
    /unit already has an active agreement/,
    "Database accepted a second active agreement for one non-space unit"
  );

  const hostelProperty = Number(primary.query(
    "INSERT INTO properties (name,type,module_id,address,country,currency) VALUES ('Hostel','boarding_house','hostel','2 Test Road','Test','USD')"
  ).run().lastInsertRowid);
  const hostelUnit = Number(primary.query(
    "INSERT INTO units (property_id,name,capacity,monthly_rate,deposit,status) VALUES ($propertyId,'Dorm 1',2,100,0,'available')"
  ).run({ propertyId: hostelProperty }).lastInsertRowid);
  const hostelSpace = Number(primary.query(
    "INSERT INTO rentable_spaces (property_id,unit_id,code,space_type,status) VALUES ($propertyId,$unitId,'Bed A','bed','available')"
  ).run({ propertyId: hostelProperty, unitId: hostelUnit }).lastInsertRowid);

  const primaryOverlapPrecheck = Number(primary.query(
    "SELECT COUNT(*) count FROM hostel_reservations WHERE space_id=$spaceId AND status IN ('reserved','checked_in') AND arrival_date<$departure AND departure_date>$arrival"
  ).get({ spaceId: hostelSpace, arrival: "2026-08-01", departure: "2026-08-05" }).count);
  const staleOverlapPrecheck = Number(secondary.query(
    "SELECT COUNT(*) count FROM hostel_reservations WHERE space_id=$spaceId AND status IN ('reserved','checked_in') AND arrival_date<$departure AND departure_date>$arrival"
  ).get({ spaceId: hostelSpace, arrival: "2026-08-02", departure: "2026-08-04" }).count);
  if (primaryOverlapPrecheck !== 0 || staleOverlapPrecheck !== 0) failures.push("Reservation concurrency fixture did not begin from shared available state");

  primary.query(
    `INSERT INTO hostel_reservations
     (property_id,unit_id,space_id,reference,guest_name,arrival_date,departure_date,status)
     VALUES ($propertyId,$unitId,$spaceId,'BOOK-A','Guest A','2026-08-01','2026-08-05','reserved')`
  ).run({ propertyId: hostelProperty, unitId: hostelUnit, spaceId: hostelSpace });
  rejectsWith(
    () => secondary.query(
      `INSERT INTO hostel_reservations
       (property_id,unit_id,space_id,reference,guest_name,arrival_date,departure_date,status)
       VALUES ($propertyId,$unitId,$spaceId,'BOOK-B','Guest B','2026-08-02','2026-08-04','reserved')`
    ).run({ propertyId: hostelProperty, unitId: hostelUnit, spaceId: hostelSpace }),
    /hostel reservation overlaps active reservation/,
    "Database accepted overlapping reservations after stale availability checks"
  );
  secondary.query(
    `INSERT INTO hostel_reservations
     (property_id,unit_id,space_id,reference,guest_name,arrival_date,departure_date,status)
     VALUES ($propertyId,$unitId,$spaceId,'BOOK-C','Guest C','2026-08-05','2026-08-07','reserved')`
  ).run({ propertyId: hostelProperty, unitId: hostelUnit, spaceId: hostelSpace });
} finally {
  try { secondary?.close(false); } catch {}
  try { primary.close(false); } catch {}
  fs.rmSync(databaseRoot, { recursive: true, force: true });
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Atomic agreement claims, database occupancy invariants, stale-read reservation protection, bounded team passwords, formula-safe report exports, and delegated mobile navigation are verified.");
