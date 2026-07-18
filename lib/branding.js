import "server-only";
import { all } from "@/lib/db";

export const DEFAULT_BRANDING = Object.freeze({
  name: "NivasaOS",
  tagline: "Property operations",
  logoLight: "/brand/nivasaos/nivasaos-logo-horizontal-light.svg",
  logoDark: "/brand/nivasaos/nivasaos-logo-horizontal-dark.svg",
  symbolLight: "/brand/nivasaos/nivasaos-symbol-light.svg",
  symbolDark: "/brand/nivasaos/nivasaos-symbol-dark.svg",
  favicon: "/brand/nivasaos/nivasaos-favicon-light.svg",
  whiteLabel: false
});

export const BRAND_ASSET_DEFINITIONS = Object.freeze({
  "logo-light": { setting: "brand_logo_light", fallback: DEFAULT_BRANDING.logoLight },
  "logo-dark": { setting: "brand_logo_dark", fallback: DEFAULT_BRANDING.logoDark },
  "symbol-light": { setting: "brand_symbol_light", fallback: DEFAULT_BRANDING.symbolLight },
  "symbol-dark": { setting: "brand_symbol_dark", fallback: DEFAULT_BRANDING.symbolDark },
  favicon: { setting: "brand_favicon", fallback: DEFAULT_BRANDING.favicon }
});

export const BRAND_SETTING_KEYS = Object.freeze([
  "brand_name",
  "brand_tagline",
  "brand_logo_light",
  "brand_logo_dark",
  "brand_symbol_light",
  "brand_symbol_dark",
  "brand_favicon",
  "white_label_enabled"
]);

export function brandingFromSettings(settings = {}) {
  const customUrl = (setting, endpoint, fallback) => settings[setting] ? `/api/branding/${endpoint}` : fallback;
  return {
    name: String(settings.brand_name || DEFAULT_BRANDING.name).trim() || DEFAULT_BRANDING.name,
    tagline: String(settings.brand_tagline || DEFAULT_BRANDING.tagline).trim() || DEFAULT_BRANDING.tagline,
    logoLight: customUrl("brand_logo_light", "logo-light", DEFAULT_BRANDING.logoLight),
    logoDark: customUrl("brand_logo_dark", "logo-dark", DEFAULT_BRANDING.logoDark),
    symbolLight: customUrl("brand_symbol_light", "symbol-light", DEFAULT_BRANDING.symbolLight),
    symbolDark: customUrl("brand_symbol_dark", "symbol-dark", DEFAULT_BRANDING.symbolDark),
    favicon: customUrl("brand_favicon", "favicon", DEFAULT_BRANDING.favicon),
    whiteLabel: String(settings.white_label_enabled || "0") === "1",
    customAssets: {
      logoLight: Boolean(settings.brand_logo_light),
      logoDark: Boolean(settings.brand_logo_dark),
      symbolLight: Boolean(settings.brand_symbol_light),
      symbolDark: Boolean(settings.brand_symbol_dark),
      favicon: Boolean(settings.brand_favicon)
    }
  };
}

export function loadBranding() {
  try {
    const rows = all(`SELECT key,value FROM settings WHERE key IN (${BRAND_SETTING_KEYS.map(() => "?").join(",")})`, BRAND_SETTING_KEYS);
    return brandingFromSettings(Object.fromEntries(rows.map((row) => [row.key, row.value])));
  } catch {
    return brandingFromSettings();
  }
}
