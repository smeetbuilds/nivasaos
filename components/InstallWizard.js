"use client";

import { useMemo, useState } from "react";
import { installAction } from "@/app/actions";
import { DEFAULT_MODULE_ID, MODULE_CATALOG } from "@/lib/modules/catalog";
import { verticalContract, requestLabel } from "@/lib/verticals";
import Icon from "@/components/Icon";

const steps = ["Operating models", "Workspace", "Operating rules", "Owner account", "Review"];
const labels = {
  notice_period_days: "Notice period days", renewal_lead_days: "Renewal lead days", utility_recovery: "Utility recovery model", annual_escalation_percent: "Annual escalation %",
  lock_in_days: "Lock-in days", visitor_hours: "Visitor hours", meal_cutoff_time: "Meal cutoff time", electricity_billing_model: "Electricity billing model", housekeeping_frequency: "Housekeeping frequency",
  check_in_time: "Check-in time", check_out_time: "Check-out time", minimum_age: "Minimum guest age", identity_required: "Identity requirement", housekeeping_turnover_minutes: "Turnover target minutes", late_checkout_fee: "Late checkout fee",
  academic_year: "Academic year", term_start: "Term start", term_end: "Term end", curfew_time: "Curfew time", guardian_required: "Guardian required", leave_approval_required: "Leave approval required",
  employer_name: "Employer name", hr_contact: "HR contact", payroll_recovery_enabled: "Payroll recovery enabled", eligibility_review_days: "Eligibility review lead days", termination_checkout_days: "Termination checkout days",
  tax_model: "Tax model", cam_billing_day: "CAM billing day", escalation_notice_days: "Escalation notice days", fitout_approval_required: "Fit-out approval required", compliance_review_days: "Compliance review days"
};

function inputType(field) {
  if (field.includes("date") || ["term_start", "term_end"].includes(field)) return "date";
  if (field.includes("time")) return "time";
  if (field.includes("days") || field.includes("percent") || field.includes("fee") || ["minimum_age", "cam_billing_day"].includes(field)) return "number";
  return "text";
}

export default function InstallWizard() {
  const [step, setStep] = useState(0);
  const [modules, setModules] = useState([DEFAULT_MODULE_ID]);
  const [primaryModule, setPrimaryModule] = useState(DEFAULT_MODULE_ID);
  const [workspace, setWorkspace] = useState({ company: "", currency: "INR", timezone: "Asia/Kolkata", demo: false });
  const [owner, setOwner] = useState({ name: "", email: "", password: "" });
  const [moduleConfig, setModuleConfig] = useState({});
  const selectedModules = useMemo(() => MODULE_CATALOG.filter((module) => modules.includes(module.id)), [modules]);

  function toggleModule(id) {
    setModules((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      if (!next.length) return current;
      if (!next.includes(primaryModule)) setPrimaryModule(next[0]);
      return next;
    });
  }

  function updateConfig(moduleId, key, value) {
    setModuleConfig((current) => ({ ...current, [moduleId]: { ...(current[moduleId] || {}), [key]: value } }));
  }

  function canContinue() {
    if (step === 0) return modules.length > 0;
    if (step === 1) return workspace.company.trim().length > 1;
    if (step === 3) return owner.name.trim().length > 1 && /^\S+@\S+\.\S+$/.test(owner.email) && owner.password.length >= 10;
    return true;
  }

  return <form action={installAction} className="install-wizard">
    <div className="install-progress" aria-label="Installation progress">
      {steps.map((label, index) => <button type="button" key={label} className={index === step ? "is-active" : index < step ? "is-complete" : ""} onClick={() => index < step && setStep(index)} disabled={index > step}>
        <span>{index < step ? <Icon name="check" size={14}/> : index + 1}</span><strong>{label}</strong>
      </button>)}
    </div>

    <section className={`install-step${step === 0 ? " is-active" : ""}`} hidden={step !== 0}>
      <div className="install-step-head"><span className="eyebrow">Portfolio architecture</span><h2>What do you operate?</h2><p>Select every model this installation should support. Each property chooses one model, so a mixed portfolio stays operationally clean.</p></div>
      <div className="module-selector-grid">{MODULE_CATALOG.map((module) => { const selected = modules.includes(module.id); return <label className={`module-selector-card module-${module.id}${selected ? " is-selected" : ""}`} key={module.id}>
        <input type="checkbox" name="moduleIds" value={module.id} checked={selected} onChange={() => toggleModule(module.id)}/><span className="module-selector-icon"><Icon name={module.icon} size={24}/></span><span className="module-selector-copy"><small>{module.family}</small><strong>{module.label}</strong><p>{module.description}</p></span><span className="module-capability-list">{module.capabilities.filter((item) => !["billing","maintenance","handover","tenantPortal"].includes(item)).slice(0,3).map((capability) => <em key={capability}>{capability.replace(/([A-Z])/g," $1")}</em>)}</span><span className="module-selected-mark"><Icon name={selected ? "check" : "plus"} size={16}/></span>
      </label>; })}</div>
      <div className="primary-module-picker"><span><strong>Primary workspace experience</strong><small>Controls the starter template and default property model. Every selected module remains available.</small></span><select name="primaryModule" value={primaryModule} onChange={(event) => setPrimaryModule(event.target.value)}>{selectedModules.map((module) => <option value={module.id} key={module.id}>{module.label}</option>)}</select></div>
    </section>

    <section className={`install-step${step === 1 ? " is-active" : ""}`} hidden={step !== 1}>
      <div className="install-step-head"><span className="eyebrow">Workspace identity</span><h2>Configure the portfolio</h2><p>Shared financial and regional defaults apply across modules. Historical currency remains protected after financial activity begins.</p></div>
      <div className="install-form-card"><label><span>Company / portfolio name</span><input name="company" value={workspace.company} onChange={(event) => setWorkspace({ ...workspace, company: event.target.value })} required placeholder="Your Property Group"/></label><div className="field-grid two"><label><span>Default currency</span><select name="currency" value={workspace.currency} onChange={(event) => setWorkspace({ ...workspace, currency: event.target.value })}>{["INR","USD","GBP","EUR","AED","AUD","CAD","SGD"].map((currency) => <option key={currency}>{currency}</option>)}</select></label><label><span>Timezone</span><input name="timezone" value={workspace.timezone} onChange={(event) => setWorkspace({ ...workspace, timezone: event.target.value })} required/></label></div><label className="check-row install-demo"><input type="checkbox" name="demo" checked={workspace.demo} onChange={(event) => setWorkspace({ ...workspace, demo: event.target.checked })}/><span><strong>Create a safe starter property</strong><small>Seeds module-relevant rooms, spaces, services and the operating defaults from the next step. No people or finance records are fabricated.</small></span></label></div>
    </section>

    <section className={`install-step${step === 2 ? " is-active" : ""}`} hidden={step !== 2}>
      <div className="install-step-head"><span className="eyebrow">Conditional setup</span><h2>Define how each module operates</h2><p>These become workspace defaults for future properties. Every property can refine them later without forking the shared finance or security core.</p></div>
      <div className="module-config-stack">{selectedModules.map((module) => { const contract = verticalContract(module.id); return <article className={`install-module-config module-${module.id}`} key={module.id}><div className="install-module-config-head"><span className="module-selector-icon"><Icon name={module.icon} size={22}/></span><span><small>{module.family}</small><strong>{contract.label}</strong><p>{contract.requestTypes.slice(0,4).map(requestLabel).join(" · ")}</p></span></div><div className="field-grid two">{contract.config.map((field) => <label key={field}><span>{labels[field] || requestLabel(field)}</span><input type={inputType(field)} step={inputType(field)==="number"?"0.01":undefined} name={`moduleConfig_${module.id}_${field}`} value={moduleConfig[module.id]?.[field] || ""} onChange={(event) => updateConfig(module.id,field,event.target.value)} placeholder="Optional default"/></label>)}</div></article>; })}</div>
    </section>

    <section className={`install-step${step === 3 ? " is-active" : ""}`} hidden={step !== 3}>
      <div className="install-step-head"><span className="eyebrow">System owner</span><h2>Create the highest-trust account</h2><p>The owner controls modules, permissions, security, staff access and every property.</p></div>
      <div className="install-form-card"><label><span>Owner name</span><input name="name" value={owner.name} onChange={(event) => setOwner({ ...owner, name: event.target.value })} required autoComplete="name"/></label><label><span>Email address</span><input type="email" name="email" value={owner.email} onChange={(event) => setOwner({ ...owner, email: event.target.value })} required autoComplete="email"/></label><label><span>Password</span><input type="password" name="password" value={owner.password} onChange={(event) => setOwner({ ...owner, password: event.target.value })} required minLength="10" autoComplete="new-password"/><small>Use at least 10 characters and store it in a password manager.</small></label></div>
    </section>

    <section className={`install-step${step === 4 ? " is-active" : ""}`} hidden={step !== 4}>
      <div className="install-step-head"><span className="eyebrow">Review</span><h2>Ready to create the workspace</h2><p>Confirm the module architecture and operating defaults before the first owner and optional starter property are written.</p></div>
      <div className="install-review-grid"><article><span>Portfolio</span><strong>{workspace.company}</strong><small>{workspace.currency} · {workspace.timezone}</small></article><article><span>Owner</span><strong>{owner.name}</strong><small>{owner.email}</small></article><article className="install-review-modules"><span>Enabled modules</span><div>{selectedModules.map((module) => <strong key={module.id}><Icon name={module.icon} size={16}/>{module.shortLabel}</strong>)}</div><small>Primary: {MODULE_CATALOG.find((module) => module.id === primaryModule)?.label}</small></article><article><span>Operating defaults</span><strong>{selectedModules.reduce((sum,module)=>sum+Object.values(moduleConfig[module.id]||{}).filter(Boolean).length,0)} configured</strong><small>Across {selectedModules.length} selected modules</small></article><article><span>Starter data</span><strong>{workspace.demo ? "Module template enabled" : "No demo property"}</strong><small>No people or financial transactions are created.</small></article></div>
      <div className="install-security-note"><Icon name="audit" size={20}/><span><strong>Private, self-hosted installation</strong><small>SQLite and uploads remain on your server. Run the local release gate before production use.</small></span></div>
    </section>

    <div className="install-actions">{step > 0 ? <button type="button" className="button secondary" onClick={() => setStep(step - 1)}>Back</button> : <span/>}{step < steps.length - 1 ? <button type="button" className="button primary" disabled={!canContinue()} onClick={() => canContinue() && setStep(step + 1)}>Continue <Icon name="arrow" size={17}/></button> : <button className="button primary large" type="submit">Install operating system <Icon name="arrow" size={18}/></button>}</div>
  </form>;
}
