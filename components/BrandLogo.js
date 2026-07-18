export default function BrandLogo({ branding, variant = "light", symbol = false, className = "" }) {
  const darkBackground = variant === "dark";
  const src = symbol
    ? (darkBackground ? branding.symbolDark : branding.symbolLight)
    : (darkBackground ? branding.logoDark : branding.logoLight);
  const classes = ["brand-logo", symbol ? "brand-logo-symbol" : "brand-logo-horizontal", className].filter(Boolean).join(" ");
  return <span className={classes}><img src={src} alt={branding.name} decoding="async"/></span>;
}
