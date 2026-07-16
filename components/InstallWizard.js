"use client";

import { useMemo, useState } from "react";
import { installAction } from "@/app/actions";
import { DEFAULT_MODULE_ID, MODULE_CATALOG } from "@/lib/modules/catalog";
import Icon from "@/components/Icon";

const steps = ["Operating models", "Workspace", "Owner account", "Review"];

export default function InstallWizard() {
  const [step, setStep] = useState(0);
  const [modules, setModules] = useState([DEFAULT_MODULE_ID]);
  const [primaryModule, setPrimaryModule] = useState(DEFAULT_MODULE_ID);
  const [workspace, setWorkspace] = useState({ company: "", currency: "INR", timezone: "Asia/Kolkata", demo: false });
  const [owner, setOwner] = useState({ name: "", email: "", password: "" });
  const selectedModules = useMemo(() => MODULE_CATALOG.filter((module) => modules.includes(module.id)), [modules]);

  function toggleModule(id) {
    setModules((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      if (!next.length) return current;
      if (!next.includes(primaryModule)) setPrimaryModule(next[0]);
      return next;
    });
  }

  function canContinue() {
    if (step === 0) return modules.length > 0;
    if (step === 1) return workspace.company.trim().length > 1;
    if (step === 2) return owner.name.trim().length > 1 && /^\S+@\S+\.\S+$/.test(owner.email) && owner.password.length >= 10;
    return true;
  }

  return <form action={installAction} className="install-wizard">
    <div className="install-progress" aria-label="Installation progress">
      {steps.map((label, index) => <button type="button" key={label} className={index === step ? "is-active" : index < step ? "is-complete" : ""} onClick={() => index < step && setStep(index)} disabled={index > step}>
        <span>{index < step ? <Icon name="check" size={14}/> : index + 1}</span><strong>{label}</strong>
      </button>)}
    </div>

    <section className={`install-step${step === 0 ? " is-active" : ""}`} hidden={step !== 0}>
      <div className="install-step-head"><span className="eyebrow">Portfolio architecture</span><h2>What do you operate?</h2><p>Select every model this installation should support. Each property will choose one model, so mixed portfolios remain cleanly separated.</p></div>
      <div className="module-selector-grid">
        {MODULE_CATALOG.map((module) => {
          const selected = modules.includes(module.id);
          return <label className={`module-selector-card module-${module.id}${selected ? " is-selected" : ""}`} key={module.id}>
            <input type="checkbox" name="moduleIds" value={module.id} checked={selected} onChange={() => toggleModule(module.id)}/>
            <span className="module-selector-icon"><Icon name={module.icon} size={24}/></span>
            <span className="module-selector-copy"><small>{module.family}</small><strong>{module.label}</strong><p>{module.description}</p></span>
            <span className="module-capability-list">{module.capabilities.filter((item) => !["billing", "maintenance", "handover", "tenantPortal"].includes(item)).slice(0, 3).map((capability) => <em key={capability}>{capability.replace(/([A-Z])/g, " $1")}</em>)}</span>
            <span className="module-selected-mark"><Icon name={selected ? "check" : "plus"} size={16}/></span>
          </label>;
        })}
      </div>
      <div className="primary-module-picker"><span><strong>Primary workspace experience</strong><small>This controls the first demo/template and default property model. Other selected modules remain fully available.</small></span><select name="primaryModule" value={primaryModule} onChange={(event) => setPrimaryModule(event.target.value)}>{selectedModules.map((module) => <option value={module.id} key={module.id}>{module.label}</option>)}</select></div>
    </section>

    <section className={`install-step${step === 1 ? " is-active" : ""}`} hidden={step !== 1}>
      <div className="install-step-head"><span className="eyebrow">Workspace identity</span><h2>Configure the portfolio</h2><p>These defaults apply across modules but can be refined later without changing historical financial records.</p></div>
      <div className="install-form-card">
        <label><span>Company / portfolio name</span><input name="company" value={workspace.company} onChange={(event) => setWorkspace({ ...workspace, company: event.target.value })} required placeholder="Your Property Group" autoFocus/></label>
        <div className="field-grid two"><label><span>Default currency</span><select name="currency" value={workspace.currency} onChange={(event) => setWorkspace({ ...workspace, currency: event.target.value })}>{["INR","USD","GBP","EUR","AED","AUD","CAD","SGD"].map((currency) => <option key={currency}>{currency}</option>)}</select></label><label><span>Timezone</span><input name="timezone" value={workspace.timezone} onChange={(event) => setWorkspace({ ...workspace, timezone: event.target.value })} required/></label></div>
        <label className="check-row install-demo"><input type="checkbox" name="demo" checked={workspace.demo} onChange={(event) => setWorkspace({ ...workspace, demo: event.target.checked })}/><span><strong>Create a safe starter property</strong><small>Seeds module-relevant rooms/spaces/services with zero pricing. No tenant, lease, invoice, or payment is fabricated.</small></span></label>
      </div>
    </section>

    <section className={`install-step${step === 2 ? " is-active" : ""}`} hidden={step !== 2}>
      <div className="install-step-head"><span className="eyebrow">System owner</span><h2>Create the highest-trust account</h2><p>The owner can manage modules, security, staff access, and every property. Use a unique password stored in your password manager.</p></div>
      <div className="install-form-card">
        <label><span>Owner name</span><input name="name" value={owner.name} onChange={(event) => setOwner({ ...owner, name: event.target.value })} required autoComplete="name" placeholder="Full name"/></label>
        <label><span>Email address</span><input type="email" name="email" value={owner.email} onChange={(event) => setOwner({ ...owner, email: event.target.value })} required autoComplete="email" placeholder="owner@example.com"/></label>
        <label><span>Password</span><input type="password" name="password" value={owner.password} onChange={(event) => setOwner({ ...owner, password: event.target.value })} required minLength="10" autoComplete="new-password" placeholder="At least 10 characters"/><small>Installation is rejected server-side if the password is shorter than 10 characters.</small></label>
      </div>
    </section>

    <section className={`install-step${step === 3 ? " is-active" : ""}`} hidden={step !== 3}>
      <div className="install-step-head"><span className="eyebrow">Review</span><h2>Ready to create the workspace</h2><p>Confirm the operating model before NivasaOS writes the owner account and module configuration.</p></div>
      <div className="install-review-grid">
        <article><span>Portfolio</span><strong>{workspace.company}</strong><small>{workspace.currency} · {workspace.timezone}</small></article>
        <article><span>Owner</span><strong>{owner.name}</strong><small>{owner.email}</small></article>
        <article className="install-review-modules"><span>Enabled modules</span><div>{selectedModules.map((module) => <strong key={module.id}><Icon name={module.icon} size={16}/>{module.shortLabel}</strong>)}</div><small>Primary: {MODULE_CATALOG.find((module) => module.id === primaryModule)?.label}</small></article>
        <article><span>Starter data</span><strong>{workspace.demo ? "Module template enabled" : "No demo property"}</strong><small>No people or financial transactions are created.</small></article>
      </div>
      <div className="install-security-note"><Icon name="audit" size={20}/><span><strong>Private, self-hosted installation</strong><small>SQLite and uploads remain on your server. Run the local release gate before production use.</small></span></div>
    </section>

    <div className="install-actions">
      {step > 0 ? <button type="button" className="button secondary" onClick={() => setStep(step - 1)}>Back</button> : <span/>}
      {step < steps.length - 1 ? <button type="button" className="button primary" disabled={!canContinue()} onClick={() => canContinue() && setStep(step + 1)}>Continue <Icon name="arrow" size={17}/></button> : <button className="button primary large" type="submit">Install modular workspace <Icon name="arrow" size={18}/></button>}
    </div>
  </form>;
}
