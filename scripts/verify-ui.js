import fs from "node:fs";
import path from "node:path";

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

function assertContains(source, value, message) {
  if (!source.includes(value)) throw new Error(message);
}

const shell = read("components/AppShell.js");
const modal = read("components/ModalForm.js");
const css = `${read("app/styles/part-5.css")}
${read("app/styles/part-6.css")}`;
const globals = read("app/globals.css");

assertContains(shell, "mobile-drawer", "Responsive shell is missing the mobile navigation drawer.");
assertContains(shell, "mobile-bottom-nav", "Responsive shell is missing the mobile bottom navigation.");
assertContains(shell, 'aria-current={active ? "page" : undefined}', "Navigation does not expose active route semantics.");
assertContains(shell, "inert={!drawerOpen}", "Closed mobile navigation must be removed from keyboard focus.");
assertContains(shell, 'cell.dataset.label = labels[index]', "Responsive table labels are not being generated.");
assertContains(modal, "sheet-grabber", "Modal forms are missing the mobile bottom-sheet affordance.");
assertContains(modal, "event.target === event.currentTarget", "Modal backdrop dismissal is not implemented.");
assertContains(css, "env(safe-area-inset-bottom)", "Mobile controls do not account for device safe areas.");
assertContains(css, '@media (max-width: 720px)', "Mobile layout breakpoint is missing.");
assertContains(css, 'table[data-mobile-ready="true"]', "Dense tables are not transformed for small screens.");
assertContains(css, "prefers-reduced-motion", "Reduced-motion accessibility support is missing.");
assertContains(css, ".modal[open]", "Bottom-sheet opening state is not styled.");
assertContains(globals, '@import "./styles/part-5.css";', "Responsive UI stylesheet is not loaded.");

console.log("Responsive shell, drawer, bottom sheets, mobile tables, safe areas, and motion accessibility verified.");
