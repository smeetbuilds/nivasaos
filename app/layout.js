import { headers } from "next/headers";
import "@/app/globals.css";
import { loadBranding } from "@/lib/branding";

export async function generateMetadata() {
  const branding = loadBranding();
  return {
    title: { default: branding.name, template: `%s · ${branding.name}` },
    description: "Self-hosted property operations for residential rentals, co-living, hostels, student housing, staff accommodation, and commercial properties.",
    icons: {
      icon: [{ url: branding.favicon }],
      shortcut: [{ url: branding.favicon }]
    }
  };
}

export default async function RootLayout({ children }) {
  await headers();
  return <html lang="en"><body>{children}</body></html>;
}
