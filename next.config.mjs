/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
];

function hostnameFromUrl(value) {
  try {
    return new URL(String(value || "").trim()).host;
  } catch {
    return "";
  }
}

const codespacesForwardingDomain = String(process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "").trim();
const codespacesOrigins = process.env.CODESPACES === "true" && codespacesForwardingDomain
  ? [`*.${codespacesForwardingDomain}`]
  : [];
const managedPlatformOrigins = [
  String(process.env.RENDER_EXTERNAL_HOSTNAME || "").trim(),
  hostnameFromUrl(process.env.NIVASA_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL)
].filter(Boolean);
const serverActionOrigins = [...new Set([...codespacesOrigins, ...managedPlatformOrigins])];

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: codespacesOrigins,
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
      allowedOrigins: serverActionOrigins
    }
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default nextConfig;
