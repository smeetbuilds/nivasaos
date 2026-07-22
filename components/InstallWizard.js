"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { installWorkspaceAction } from "@/app/experience-actions";
import { DEFAULT_MODULE_ID, MODULE_CATALOG } from "@/lib/modules/catalog";
import { requestLabel, verticalContract } from "@/lib/verticals";
import ActionButton from "@/components/ActionButton";
import Icon from "@/components/Icon";
import StatefulForm, { ActionStateMessage } from "@/components/StatefulForm";

const steps = ["Operating models", "Workspace", "Operating rules", "Owner account", "Review"];
const BOOLEAN_FIELDS = new Set(["identity_required", "guardian_required", "leave_approval_required", "payroll_recovery_enabled", "fitout_approval_required"]);
const INTEGER_FIELDS = new Set(["notice_period_days", "renewal_lead_days", "lock_in_days", "minimum_age", "housekeeping_turnover_minutes", "eligibility_review_days", "termination_checkout_days", "cam_billing_day", "compliance_review_days", "escalation_notice_days"]);
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
  if (field.includes("email")) return "email";
  return "text";
}

function detectedTimezone() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return timezone === "Asia/Calcutta" ? "Asia/Kolkata" : timezone;
  } catch {
    return "UTC";
  }
}

function ConfigControl({ field, moduleId, value, onChange }) {
  const name = `moduleConfig_${moduleId}_${field}`;
  if (BOOLEAN_FIELDS.has(field)) return <select name={name} value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">Not configured</option>
    <option value="yes">Yes</option>
    <option value="no">No</option>
  </select>;
  const type = inputType(field);
  const numeric = type === "number";
  return <input
    type={type}
    step={numeric ? (INTEGER_FIELDS.has(field) ? "1" : "0.01") : undefined}
    min={numeric ? "0" : undefined}
    maxLength={["text", "email"].includes(type) ? 500 : undefined}
    inputMode={numeric ? (INTEGER_FIELDS.has(field) ? "numeric" : "decimal") : undefined}
    name={name}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder="Optional default"
  />;
}

export default function InstallWizard({ installationProtection = { required: false, configured: true } }) {
  const [step, setStep] = useState(0);
  const [modules, setModules] = useState([DEFAULT_MODULE_ID]);
  const [primaryModule, setPrimaryModule] = useState(DEFAULT_MODULE_ID);
  const [workspace, setWorkspace] = useState({ company: "", country: "", currency: "", timezone: "UTC", demo: false });
  const [owner, setOwner] = useState({ name: "", email: "", password: "" });
  const [installToken, setInstallToken] = useState("");
  const [moduleConfig, setModuleConfig] = useState({});
  const [announcement, setAnnouncement] = useState("");
  const headingRefs = useRef([]);
  const selectedModules = useMemo(() => MODULE_CATALOG.filter((module) => modules.includes(module.id)), [modules]);

  useEffect(() => {
    const timezone = detectedTimezone();
    setWorkspace((current) => current.timezone === "UTC" && timezone !== "UTC" ? { ...current, timezone } : current);
  }, []);

  useEffect(() => {
    if (!announcement) return;
    headingRefs.current[step]?.focus();
  }, [announcement, step]);

  function toggleModule(id) {
    setModules((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      if (!next.length) {
        setAnnouncement("At least one operating model must remain selected.");
        return current;
      }
      if (!next.includes(primaryModule)) setPrimaryModule(next[0]);
      return next;
    });
  }

  function updateConfig(moduleId, key, value) {
    setModuleConfig((current) => ({ ...current, [moduleId]: { ...(current[moduleId] || {}), [key]: value } }));
  }

  function stepIsValid(index) {
    if (index === 0) return modules.length > 0 && modules.includes(primaryModule);
    if (index === 1) return workspace.company.trim().length > 1 && workspace.company.trim().length <= 160 && workspace.country.trim().length > 1 && workspace.country.trim().length <= 100 && Boolean(workspace.currency) && workspace.timezone.trim().length > 1;
    if (index === 2) return selectedModules.every((module) => verticalContract(module.id).config.every((field) => String(moduleConfig[module.id]?.[field] || "").length <= 500));
    if (index === 3) return owner.name.trim().length > 1 && owner.name.trim().length <= 160 && /^\S+@\S+\.\S+$/.test(owner.email) && owner.email.length <= 254 && owner.password.length >= 10 && owner.password.length <= 256 && (!installationProtection.required || (installationProtection.configured && installToken.trim().length > 0));
    return [0, 1, 2, 3].every(stepIsValid);
  }

  function goToStep(next) {
    const target = Math.max(0, Math.min(steps.length - 1, next));
    setStep(target);
    setAnnouncement(`Step ${target + 1} of ${steps.length}: ${steps[target]}`);
  }

  function continueForward() {
    if (!stepIsValid(step)) {
      setAnnouncement(`Complete the required fields in ${steps[step]} before continuing.`);
      return;
    }
    goToStep(step + 1);
  }

  function handleSubmit(event) {
    if (step < steps.length - 1) {
      event.preventDefault();
      continueForward();
      return;
    }
    if (!stepIsValid(4) || !installationProtection.configured) {
      event.preventDefault();
      const firstInvalid = [0, 1, 2, 3].find((index) => !stepIsValid(index));
      goToStep(firstInvalid ?? 3);
    }
  }

  function handleServerError(state) {
    const fields = Object.keys(state.fieldErrors || {});
    let target = 4;
    if (fields.some((field) => field === "moduleIds" || field === "primaryModule")) target = 0;
    else if (fields.some((field) => ["company", "country", "currency", "timezone", "demo"].includes(field))) target = 1;
    else if (fields.some((field) => field.startsWith("moduleConfig_"))) target = 2;
    else if (fields.some((field) => ["installToken", "name", "email", "password"].includes(field))) target = 3;
    setStep(target);
    setAnnouncement(`Installation needs attention in ${steps[target]}. ${state.message}`);
  }

  const configuredDefaults = selectedModules.reduce((sum, module) => sum + Object.values(moduleConfig[module.id] || {}).filter((value) => String(value).trim()).length, 0);

  return <StatefulForm action={installWorkspaceAction} className="install-wizard" onError={handleServerError} onSubmit={handleSubmit} noValidate>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    <ActionStateMessage/>
    <div className="install-progress-summary">
      <span>Step {step + 1} of {steps.length}</span>
      <progress max={steps.length} value={step + 1} aria-label={`Installation progress: step ${step + 1} of ${steps.length}`}>{step + 1}/{steps.length}</progress>
    </div>
    <ol className="install-progress" aria-label="Installation steps">
      {steps.map((label, index) => <li key={label}><button type="button" className={index === step ? "is-active" : index < step ? "is-complete" : ""} onClick={() => index <= step && goToStep(index)} disabled={index > step} aria-current={index === step ? "step" : undefined} aria-label={`Step ${index + 1}: ${label}${index < step ? ", complete" : index === step ? ", current" : ", not available yet"}`}>
        <span>{index < step ? <Icon name="check" size={14}/> : index + 1}</span><strong>{label}</strong>
      </button></li>)}
    </ol>

    <section className={`install-step${step === 0 ? " is-active" : ""}`} hidden={step !== 0} aria-labelledby="install-step-models-title">
      <div className="install-step-head"><span className="eyebrow">Portfolio architecture</span><h2 id="install-step-models-title" ref={(node) => { headingRefs.current[0] = node; }} tabIndex={-1}>What do you operate?</h2><p>Select every model this installation should support. Each property chooses one model, so a mixed portfolio stays operationally clean.</p></div>
      <div className="install-selection-status" role="status" aria-live="polite"><strong>{selectedModules.length} operating model{selectedModules.length === 1 ? "" : "s"} selected</strong><span>Primary: {MODULE_CATALOG.find((module) => module.id === primaryModule)?.label}</span></div>
      <div className="module-selector-grid">{MODULE_CATALOG.map((module) => { const selected = modules.includes(module.id); return <label className={`module-selector-card module-${module.id}${selected ? " is-selected" : ""}`} key={module.id}>
        <input type="checkbox" name="moduleIds" value={module.id} checked={selected} onChange={() => toggleModule(module.id)}/><span className="module-selector-icon"><Icon name={module.icon} size={24}/></span><span className="module-selector-copy"><small>{module.family}</small><strong>{module.label}</strong><p>{module.description}</p></span><span className="module-capability-list">{module.capabilities.filter((item) => !["billing", "maintenance", "handover", "tenantPortal"].includes(item)).slice(0, 3).map((capability) => <em key={capability}>{capability.replace(/([A-Z])/g, " $1")}</em>)}</span><span className="module-selected-mark"><Icon name={selected ? "check" : "plus"} size={16}/></span>
      </label>; })}</div>
      <div className="primary-module-picker"><span><strong>Primary workspace experience</strong><small>Controls the starter template and default property model. Every selected module remains available.</small></span><select name="primaryModule" value={primaryModule} onChange={(event) => setPrimaryModule(event.target.value)}>{selectedModules.map((module) => <option value={module.id} key={module.id}>{module.label}</option>)}</select></div>
    </section>

    <section className={`install-step${step === 1 ? " is-active" : ""}`} hidden={step !== 1} aria-labelledby="install-step-workspace-title">
      <div className="install-step-head"><span className="eyebrow">Workspace identity</span><h2 id="install-step-workspace-title" ref={(node) => { headingRefs.current[1] = node; }} tabIndex={-1}>Configure the portfolio</h2><p>Shared financial and regional defaults apply across modules. Historical currency remains protected after financial activity begins.</p></div>
      <div className="install-form-card"><label><span>Company / portfolio name</span><input name="company" value={workspace.company} onChange={(event) => setWorkspace({ ...workspace, company: event.target.value })} required maxLength="160" autoComplete="organization" placeholder="Your Property Group"/></label><div className="field-grid three"><label><span>Default country</span><input name="country" value={workspace.country} onChange={(event) => setWorkspace({ ...workspace, country: event.target.value })} required maxLength="100" autoComplete="country-name" placeholder="Country or region"/></label><label><span>Default currency</span><select name="currency" value={workspace.currency} onChange={(event) => setWorkspace({ ...workspace, currency: event.target.value })} required><option value="" disabled>Select currency</option>{["USD", "EUR", "GBP", "INR", "AED", "AUD", "CAD", "SGD"].map((currency) => <option key={currency}>{currency}</option>)}</select></label><label><span>Timezone</span><input name="timezone" value={workspace.timezone} onChange={(event) => setWorkspace({ ...workspace, timezone: event.target.value })} required maxLength="100" autoComplete="off" aria-describedby="install-timezone-help"/><small id="install-timezone-help">Use an IANA timezone such as Asia/Kolkata or Europe/London.</small></label></div><label className="check-row install-demo"><input type="checkbox" name="demo" checked={workspace.demo} onChange={(event) => setWorkspace({ ...workspace, demo: event.target.checked })}/><span><strong>Create a safe starter property</strong><small>Seeds module-relevant rooms, spaces, services and the operating defaults from the next step. No people or finance records are fabricated.</small></span></label></div>
    </section>

    <section className={`install-step${step === 2 ? " is-active" : ""}`} hidden={step !== 2} aria-labelledby="install-step-rules-title">
      <div className="install-step-head"><span className="eyebrow">Conditional setup</span><h2 id="install-step-rules-title" ref={(node) => { headingRefs.current[2] = node; }} tabIndex={-1}>Define how each module operates</h2><p>These become workspace defaults for future properties. Every property can refine them later without forking the shared finance or security core.</p></div>
      <div className="module-config-stack">{selectedModules.map((module) => { const contract = verticalContract(module.id); return <article className={`install-module-config module-${module.id}`} key={module.id}><div className="install-module-config-head"><span className="module-selector-icon"><Icon name={module.icon} size={22}/></span><span><small>{module.family}</small><strong>{contract.label}</strong><p>{contract.requestTypes.slice(0, 4).map(requestLabel).join(" · ")}</p></span></div><div className="field-grid two">{contract.config.map((field) => <label key={field}><span>{labels[field] || requestLabel(field)}</span><ConfigControl field={field} moduleId={module.id} value={moduleConfig[module.id]?.[field] || ""} onChange={(value) => updateConfig(module.id, field, value)}/></label>)}</div></article>; })}</div>
    </section>

    <section className={`install-step${step === 3 ? " is-active" : ""}`} hidden={step !== 3} aria-labelledby="install-step-owner-title">
      <div className="install-step-head"><span className="eyebrow">System owner</span><h2 id="install-step-owner-title" ref={(node) => { headingRefs.current[3] = node; }} tabIndex={-1}>Create the highest-trust account</h2><p>The owner controls modules, permissions, security, staff access and every property.</p></div>
      <div className="install-form-card">
        {installationProtection.required && !installationProtection.configured && <div className="install-blocking-note" role="alert"><Icon name="audit" size={20}/><span><strong>Server installation protection is not configured</strong><small>Set a generated NIVASA_INSTALL_TOKEN of at least 24 characters before continuing in production.</small></span></div>}
        {installationProtection.required && <label><span>Installation token</span><input type="password" name="installToken" value={installToken} onChange={(event) => setInstallToken(event.target.value)} required disabled={!installationProtection.configured} maxLength="512" autoComplete="off"/><small>{installationProtection.configured ? "Use the one-time token configured by the server operator." : "The server operator must configure NIVASA_INSTALL_TOKEN before installation can continue."}</small></label>}
        <label><span>Owner name</span><input name="name" value={owner.name} onChange={(event) => setOwner({ ...owner, name: event.target.value })} required maxLength="160" autoComplete="name"/></label>
        <label><span>Email address</span><input type="email" name="email" value={owner.email} onChange={(event) => setOwner({ ...owner, email: event.target.value })} required maxLength="254" autoComplete="email" autoCapitalize="none" spellCheck="false"/></label>
        <label><span>Password</span><input type="password" name="password" value={owner.password} onChange={(event) => setOwner({ ...owner, password: event.target.value })} required minLength="10" maxLength="256" autoComplete="new-password" aria-describedby="install-password-help"/><small id="install-password-help">Use 10–256 characters and store it in a password manager.</small></label>
      </div>
    </section>

    <section className={`install-step${step === 4 ? " is-active" : ""}`} hidden={step !== 4} aria-labelledby="install-step-review-title">
      <div className="install-step-head"><span className="eyebrow">Review</span><h2 id="install-step-review-title" ref={(node) => { headingRefs.current[4] = node; }} tabIndex={-1}>Ready to create the workspace</h2><p>Confirm the module architecture and operating defaults before the first owner and optional starter property are written.</p></div>
      <div className="install-review-grid"><article><span>Portfolio</span><strong>{workspace.company || "Not completed"}</strong><small>{workspace.country || "Country pending"} · {workspace.currency || "Currency pending"} · {workspace.timezone}</small></article><article><span>Owner</span><strong>{owner.name || "Not completed"}</strong><small>{owner.email || "Email pending"}</small></article><article className="install-review-modules"><span>Enabled modules</span><div>{selectedModules.map((module) => <strong key={module.id}><Icon name={module.icon} size={16}/>{module.shortLabel}</strong>)}</div><small>Primary: {MODULE_CATALOG.find((module) => module.id === primaryModule)?.label}</small></article><article><span>Operating defaults</span><strong>{configuredDefaults} configured</strong><small>Across {selectedModules.length} selected modules</small></article><article><span>Starter data</span><strong>{workspace.demo ? "Module template enabled" : "No starter property"}</strong><small>No people or financial transactions are created.</small></article></div>
      <div className="install-security-note"><Icon name="audit" size={20}/><span><strong>Private, self-hosted installation</strong><small>SQLite and uploads remain on your server. Production installation is protected by a server-controlled one-time token.</small></span></div>
    </section>

    <div className="install-actions">{step > 0 ? <button type="button" className="button secondary" onClick={() => goToStep(step - 1)}>Back</button> : <span/>}{step < steps.length - 1 ? <button type="button" className="button primary" disabled={!stepIsValid(step)} onClick={continueForward}>Continue <Icon name="arrow" size={17}/></button> : <ActionButton className="button primary large" pendingLabel="Installing workspace…" disabled={!installationProtection.configured || !stepIsValid(4)}>Install operating system <Icon name="arrow" size={18}/></ActionButton>}</div>
  </StatefulForm>;
}
