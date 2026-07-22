import SystemState from "@/components/SystemState";

export const metadata = { title: "Access restricted", robots: { index: false, follow: false } };

export default function ForbiddenPage() {
  return <div className="workspace-system-state">
    <SystemState
      compact
      code="403"
      eyebrow="Permission boundary"
      title="Your account cannot open this workspace area."
      description="Access is restricted by role, property scope, or module capability. No record was disclosed or changed."
      icon="audit"
      primaryHref="/dashboard"
      primaryLabel="Return to dashboard"
    />
  </div>;
}
