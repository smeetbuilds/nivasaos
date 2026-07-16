"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({ children, pendingLabel = "Saving…", className = "button primary" }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending} aria-disabled={pending}>
    {pending && <span className="button-spinner" aria-hidden="true"/>}
    {pending ? pendingLabel : children}
  </button>;
}
