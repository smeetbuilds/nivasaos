"use client";

import { useFormStatus } from "react-dom";

export default function ActionButton({ children, pendingLabel = "Working…", intent = "primary", className = "" }) {
  const { pending } = useFormStatus();
  const classes = className || `button ${intent}`;
  return <button className={classes} type="submit" disabled={pending} aria-disabled={pending}>
    {pending && <span className="button-spinner" aria-hidden="true"/>}
    {pending ? pendingLabel : children}
  </button>;
}
