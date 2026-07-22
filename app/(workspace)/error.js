"use client";

import { useEffect } from "react";
import SystemState from "@/components/SystemState";

export default function WorkspaceError({ error, reset }) {
  useEffect(() => {
    console.error("NivasaOS workspace segment error", error);
  }, [error]);

  return <div className="workspace-system-state">
    <SystemState
      compact
      code="500"
      eyebrow="Workspace view interrupted"
      title="This operational view could not be loaded."
      description="No saved record was changed. Retry this view or return to the portfolio overview."
      reference={error?.digest || ""}
      primaryHref=""
      secondaryHref="/dashboard"
      secondaryLabel="Portfolio overview"
    >
      <button type="button" className="button primary" onClick={() => reset()}>Retry view</button>
    </SystemState>
  </div>;
}
