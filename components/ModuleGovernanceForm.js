"use client";

import { useState } from "react";
import ActionButton from "@/components/ActionButton";
import Badge from "@/components/Badge";
import Icon from "@/components/Icon";

function selectionKey(values) {
  return [...values].sort().join("|");
}

export default function ModuleGovernanceForm({ modules, primary, action }) {
  const initialSelected = modules.filter((module) => module.enabled).map((module) => module.id);
  const initialPrimary = initialSelected.includes(primary) ? primary : initialSelected[0] || modules[0]?.id || "";
  const [selected, setSelected] = useState(initialSelected);
  const [primaryModule, setPrimaryModule] = useState(initialPrimary);
  const [notice, setNotice] = useState("");
  const selectedSet = new Set(selected);
  const selectedModules = modules.filter((module) => selectedSet.has(module.id));
  const propertyCount = modules.reduce((sum, module) => sum + Number(module.propertyCount || 0), 0);
  const dirty = selectionKey(selected) !== selectionKey(initialSelected) || primaryModule !== initialPrimary;

  const toggleModule = (moduleId) => {
    const checked = selectedSet.has(moduleId);
    if (checked && selected.length === 1) {
      setNotice("Keep at least one operating module enabled.");
      return;
    }
    const next = checked ? selected.filter((id) => id !== moduleId) : [...selected, moduleId];
    setSelected(next);
    if (!next.includes(primaryModule)) setPrimaryModule(next[0] || "");
    setNotice("");
  };

  return <form action={action} className="module-governance-form">
    <section className="module-governance-summary" aria-label="Operating module summary">
      <article><span>Enabled models</span><strong>{selected.length}</strong><small>of {modules.length} available operating models</small></article>
      <article><span>Primary model</span><strong>{modules.find((module) => module.id === primaryModule)?.label || "Not selected"}</strong><small>Default for newly created properties</small></article>
      <article><span>Assigned properties</span><strong>{propertyCount}</strong><small>Modules in use remain protected from deactivation</small></article>
    </section>

    <fieldset className="module-governance-fieldset">
      <legend className="sr-only">Operating module catalogue</legend>
      <section className="module-governance-grid">
        {modules.map((module) => {
          const checked = selectedSet.has(module.id);
          const locked = checked && Number(module.propertyCount || 0) > 0;
          return <label className={`module-governance-card module-${module.id}${checked ? " is-enabled" : ""}${locked ? " is-locked" : ""}`} key={module.id}>
            <span className="module-card-top">
              <span className="module-selector-icon"><Icon name={module.icon} size={23}/></span>
              <span className="module-card-state">
                <Badge tone={checked ? "active" : "inactive"}>{checked ? "Enabled" : "Disabled"}</Badge>
                <span className="module-toggle-control">
                  <input type="checkbox" name={locked ? undefined : "moduleIds"} value={module.id} checked={checked} disabled={locked} onChange={() => toggleModule(module.id)} aria-label={`${checked ? "Disable" : "Enable"} ${module.label}`}/>
                  {locked && <input type="hidden" name="moduleIds" value={module.id}/>} 
                </span>
              </span>
            </span>
            <span className="eyebrow">{module.family}</span>
            <h2>{module.label}</h2>
            <p>{module.description}</p>
            <span className="module-live-state">{checked ? "Included in this workspace" : "Available to enable"}</span>
            <span className="module-capabilities">{module.capabilities.map((capability) => <span key={capability}>{capability.replace(/([A-Z])/g, " $1")}</span>)}</span>
            <span className="module-card-foot"><span><small>Properties using module</small><strong>{module.propertyCount}</strong></span><span><small>Portal language</small><strong>{module.terminology.portal}</strong></span></span>
            {locked && <span className="module-lock-note"><Icon name="key" size={14}/>In use by active property records</span>}
          </label>;
        })}
      </section>
    </fieldset>

    {notice && <div className="module-selection-notice" role="status" aria-live="polite">{notice}</div>}

    <section className="panel module-primary-panel">
      <div><span className="eyebrow">Workspace default</span><h2>Primary operating model</h2><p>Only enabled models are available here. Changing the card selection updates this list immediately.</p></div>
      <label><span>Primary module</span><select name="primaryModule" value={primaryModule} onChange={(event) => setPrimaryModule(event.target.value)}>{selectedModules.map((module) => <option value={module.id} key={module.id}>{module.label}</option>)}</select></label>
      <div className="module-save-state"><Badge tone={dirty ? "draft" : "active"}>{dirty ? "Unsaved changes" : "Saved architecture"}</Badge><ActionButton pendingLabel="Saving…">Save module architecture</ActionButton></div>
    </section>
  </form>;
}
