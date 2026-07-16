"use client";
import { useTransition } from "react";
import { logReminderAction } from "@/app/actions";

export default function WhatsAppButton({ invoiceId, url, message }) {
  const [pending, startTransition] = useTransition();
  function handleClick() {
    window.open(url, "_blank", "noopener,noreferrer");
    const data = new FormData();
    data.set("invoiceId", String(invoiceId));
    data.set("message", message);
    startTransition(() => logReminderAction(data));
  }
  return <button type="button" className="text-button whatsapp" onClick={handleClick} disabled={pending}>{pending ? "Opening…" : "WhatsApp reminder"}</button>;
}
