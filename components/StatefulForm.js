"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useActionState } from "react";
import { INITIAL_ACTION_STATE } from "@/lib/action-state";

const ActionStateContext = createContext(INITIAL_ACTION_STATE);

function controlsFor(form, name) {
  const item = form.elements.namedItem(name);
  if (!item) return [];
  if (typeof RadioNodeList !== "undefined" && item instanceof RadioNodeList) return [...item];
  return [item];
}

function restoreControl(control, submitted) {
  if (!control || control.type === "file") return;
  const values = Array.isArray(submitted) ? submitted.map(String) : [String(submitted ?? "")];
  if (control.type === "checkbox" || control.type === "radio") control.checked = values.includes(String(control.value || "on"));
  else if (control instanceof HTMLSelectElement && control.multiple) [...control.options].forEach((option) => { option.selected = values.includes(option.value); });
  else control.value = values.at(-1) || "";
}

function appendFieldError(control, name, message, attempt) {
  const owner = control.closest("label") || control.parentElement;
  if (!owner) return;
  const id = `action-error-${attempt}-${String(name).replace(/[^a-z0-9_-]/gi, "-")}`;
  const note = document.createElement("small");
  note.id = id;
  note.className = "field-error";
  note.dataset.actionFieldError = "true";
  note.textContent = message;
  owner.append(note);
  control.setAttribute("aria-invalid", "true");
  const describedBy = new Set(String(control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
  describedBy.add(id);
  control.setAttribute("aria-describedby", [...describedBy].join(" "));
}

function clearGeneratedErrors(form) {
  form.querySelectorAll("[data-action-field-error]").forEach((node) => node.remove());
  form.querySelectorAll('[aria-invalid="true"]').forEach((control) => {
    control.removeAttribute("aria-invalid");
    const ids = String(control.getAttribute("aria-describedby") || "").split(/\s+/).filter((id) => id && !id.startsWith("action-error-"));
    if (ids.length) control.setAttribute("aria-describedby", ids.join(" "));
    else control.removeAttribute("aria-describedby");
  });
}

export function useStructuredActionState() {
  return useContext(ActionStateContext);
}

export function ActionStateMessage() {
  const state = useStructuredActionState();
  if (state.status !== "error") return null;
  return <div className="action-state-message" role="alert" aria-live="assertive" tabIndex={-1} data-action-error-summary>
    <strong>Review this form</strong>
    <span>{state.message}</span>
    {Object.keys(state.fieldErrors || {}).length === 0 && <small>No saved data was changed.</small>}
  </div>;
}

export default function StatefulForm({ action, children, className = "", onError, ...props }) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const formRef = useRef(null);
  const onErrorRef = useRef(onError);
  const contextValue = useMemo(() => state || INITIAL_ACTION_STATE, [state]);

  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (state?.status !== "error" || !state.attempt || !formRef.current) return;
    const form = formRef.current;
    clearGeneratedErrors(form);
    for (const [name, value] of Object.entries(state.values || {})) controlsFor(form, name).forEach((control) => restoreControl(control, value));

    let firstInvalid = null;
    for (const [name, message] of Object.entries(state.fieldErrors || {})) {
      const controls = controlsFor(form, name);
      for (const control of controls) appendFieldError(control, name, message, state.attempt);
      firstInvalid ||= controls.find((control) => !control.disabled && control.type !== "hidden") || null;
    }

    onErrorRef.current?.(state);
    const dialog = form.closest("dialog");
    if (dialog && !dialog.open) dialog.showModal();
    const summary = form.querySelector("[data-action-error-summary]");
    requestAnimationFrame(() => requestAnimationFrame(() => (firstInvalid || summary)?.focus()));
  }, [state?.attempt]);

  return <ActionStateContext.Provider value={contextValue}>
    <form ref={formRef} action={formAction} className={className} data-stateful-form="true" {...props}>{children}</form>
  </ActionStateContext.Provider>;
}
