const DEFAULT_MOBILE_HREFS = Object.freeze([
  "/dashboard",
  "/properties",
  "/operations",
  "/invoices",
  "/maintenance"
]);

export function mobileNavigationItems(items, preferredHrefs = DEFAULT_MOBILE_HREFS, limit = 4) {
  const maximum = Math.max(0, Math.trunc(Number(limit) || 0));
  if (!maximum) return [];

  const byHref = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const href = Array.isArray(item) ? String(item[0] || "") : "";
    if (href && !byHref.has(href)) byHref.set(href, item);
  }

  const selected = [];
  const used = new Set();
  const add = (item) => {
    const href = item?.[0];
    if (!href || used.has(href) || selected.length >= maximum) return;
    used.add(href);
    selected.push(item);
  };

  for (const href of preferredHrefs) add(byHref.get(href));
  for (const item of byHref.values()) add(item);
  return selected;
}
