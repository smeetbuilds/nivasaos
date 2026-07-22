"use client";

import { useEffect } from "react";
import SystemState from "@/components/SystemState";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("NivasaOS route rendering error", error);
  }, [error]);

  return <main className="system-state-page">
    <SystemState
      code="500"
      eyebrow="Unexpected application error"
      title="This workspace view could not be completed."
      description="Your saved data was not changed. Retry the view, or return to the dashboard and continue from a stable screen."
      reference={error?.digest || ""}
      primaryHref=""
      secondaryHref="/dashboard"
      secondaryLabel="Return to dashboard"
    >
      <button type="button" className="button primary" onClick={() => reset()}>Try again</button>
    </SystemState>
  </main>;
}
