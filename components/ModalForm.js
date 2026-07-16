"use client";

import Icon from "@/components/Icon";
import SubmitButton from "@/components/SubmitButton";

export default function ModalForm({ id, title, description, children, submitLabel = "Save", pendingLabel = "Saving…" }) {
  const close = () => document.getElementById(id)?.close();
  return <dialog
    id={id}
    className="modal modal-sheet"
    aria-labelledby={`${id}-title`}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}
  >
    <div className="sheet-grabber" aria-hidden="true"><span/></div>
    <div className="modal-head">
      <div><h2 id={`${id}-title`}>{title}</h2>{description && <p>{description}</p>}</div>
      <button type="button" className="icon-button modal-close" onClick={close} aria-label="Close"><Icon name="close" size={20}/></button>
    </div>
    {children}
    <div className="modal-actions">
      <button type="button" className="button secondary" onClick={close}>Cancel</button>
      <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
    </div>
  </dialog>;
}
