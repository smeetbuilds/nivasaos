"use client";

import ActionButton from "@/components/ActionButton";

export default function SubmitButton({ children, pendingLabel = "Working…", className = "", intent = "primary" }) {
  return <ActionButton pendingLabel={pendingLabel} className={className} intent={intent}>{children}</ActionButton>;
}
