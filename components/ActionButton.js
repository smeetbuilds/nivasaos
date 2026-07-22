"use client";

import { useFormStatus } from "react-dom";

export default function ActionButton({ children, pendingLabel = "Working…", intent = "primary", className = "", disabled = false, ...props }) {
  const { pending } = useFormStatus();
  const classes = className || `button ${intent}`;
  const blocked = pending || disabled;
  return <button {...props} className={classes} type="submit" disabled={blocked} aria-disabled={blocked}>
    {pending && <span className="button-spinner" aria-hidden="true"/>}
    {pending ? pendingLabel : children}
  </button>;
}
