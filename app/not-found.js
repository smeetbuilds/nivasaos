import SystemState from "@/components/SystemState";

export const metadata = { title: "Page not found", robots: { index: false, follow: false } };

export default function NotFound() {
  return <main className="system-state-page">
    <SystemState
      code="404"
      eyebrow="Page not found"
      title="This address does not match a NivasaOS workspace view."
      description="The link may be outdated, incomplete, or outside the modules enabled for this installation."
      icon="document"
      primaryHref="/"
      primaryLabel="Return to start"
      secondaryHref="/dashboard"
      secondaryLabel="Open dashboard"
    />
  </main>;
}
