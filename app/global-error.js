"use client";

import { useEffect } from "react";
import "./globals.css";
import SystemState from "@/components/SystemState";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("NivasaOS root rendering error", error);
  }, [error]);

  return <html lang="en">
    <body>
      <title>NivasaOS · Recovery</title>
      <main className="system-state-page">
        <SystemState
          code="500"
          eyebrow="Workspace recovery"
          title="NivasaOS could not load its application shell."
          description="Retry the application. If the same reference returns, inspect the deployment logs and confirm the health endpoint before recording new activity."
          reference={error?.digest || ""}
          primaryHref=""
          secondaryHref="/"
          secondaryLabel="Return to start"
        >
          <button type="button" className="button primary" onClick={() => reset()}>Retry application</button>
        </SystemState>
      </main>
    </body>
  </html>;
}
