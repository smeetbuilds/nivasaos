"use client";

import Icon from "@/components/Icon";
import SubmitButton from "@/components/SubmitButton";
import { ActionStateMessage } from "@/components/StatefulForm";

const pendingVerbs = Object.freeze({
  Save: "Saving…", Create: "Creating…", Issue: "Issuing…", Record: "Recording…", Generate: "Generating…",
  Update: "Updating…", Apply: "Applying…", Review: "Reviewing…", Confirm: "Confirming…", Void: "Voiding…"
});

function resolvedPendingLabel(submitLabel, pendingLabel) {
  if (pendingLabel) return pendingLabel;
  return pendingVerbs[String(submitLabel || "").split(" ")[0]] || "Working…";
}

export default function ModalForm({ id, title, description, children, submitLabel = "Save", pendingLabel, intent = "primary" }) {
  const dialog = () => document.getElementById(id);
  const close = () => dialog()?.close();
  const restoreFocus = (event) => {
    const target = event.currentTarget?.nivasaReturnFocus;
    event.currentTarget.nivasaReturnFocus = null;
    requestAnimationFrame(() => target?.isConnected && target.focus({ preventScroll: true }));
  };
  const descriptionId = description ? `${id}-description` : undefined;
  return <dialog
    id={id}
    className="modal modal-sheet"
    data-intent={intent}
    aria-labelledby={`${id}-title`}
    aria-describedby={descriptionId}
    onClose={restoreFocus}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}
  >
    <div className="sheet-grabber" aria-hidden="true"><span/></div>
    <div className="modal-head">
      <div><h2 id={`${id}-title`}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div>
      <button type="button" className="icon-button modal-close" onClick={close} aria-label="Close"><Icon name="close" size={20}/></button>
    </div>
    <ActionStateMessage/>
    {children}
    <div className="modal-actions">
      <button type="button" className="button secondary" onClick={close}>Cancel</button>
      <SubmitButton intent={intent === "danger" ? "danger" : "primary"} pendingLabel={resolvedPendingLabel(submitLabel, pendingLabel)}>{submitLabel}</SubmitButton>
    </div>
  </dialog>;
}
