"use client";

import SubmitButton from "@/components/SubmitButton";

export default function ModalForm({ id, title, description, children, submitLabel = "Save", pendingLabel = "Saving…" }) {
  return <dialog id={id} className="modal">
    <div className="modal-head">
      <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
      <button type="button" className="icon-button" onClick={() => document.getElementById(id)?.close()} aria-label="Close">×</button>
    </div>
    {children}
    <div className="modal-actions">
      <button type="button" className="button secondary" onClick={() => document.getElementById(id)?.close()}>Cancel</button>
      <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
    </div>
  </dialog>;
}
