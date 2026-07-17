export const PERMISSIONS = Object.freeze([
  "portfolio.view","people.manage","agreements.manage","billing.manage","payments.manage","services.manage",
  "visitors.manage","maintenance.manage","handover.manage","verticals.manage","requests.review","reservations.manage",
  "housekeeping.manage","reports.view","team.manage","settings.manage","audit.view"
]);

export const ROLE_PERMISSION_DEFAULTS = Object.freeze({
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((permission) => !["team.manage","audit.view"].includes(permission)),
  staff: ["portfolio.view","people.manage","payments.manage","visitors.manage","maintenance.manage","handover.manage","verticals.manage","requests.review","reservations.manage","housekeeping.manage","reports.view"]
});

export const VERTICAL_CONTRACTS = Object.freeze({
  residential: {
    label: "Residential operations",
    profileTitle: "Household and tenancy profile",
    profileFields: ["sponsor_name","sponsor_reference"],
    requestTypes: ["notice_to_vacate","renewal_request","utility_query","room_transfer"],
    config: ["notice_period_days","renewal_lead_days","utility_recovery","annual_escalation_percent"],
    portalActions: ["notice_to_vacate","renewal_request","utility_query"]
  },
  pg_coliving: {
    label: "PG and co-living operations",
    profileTitle: "Resident and sponsor profile",
    profileFields: ["external_id","organisation","sponsor_name","sponsor_reference"],
    requestTypes: ["meal_pause","room_transfer","move_out_notice","visitor_exception","complaint"],
    config: ["lock_in_days","notice_period_days","visitor_hours","meal_cutoff_time","electricity_billing_model","housekeeping_frequency"],
    portalActions: ["meal_pause","room_transfer","move_out_notice","complaint"]
  },
  hostel: {
    label: "Hostel front-desk operations",
    profileTitle: "Guest and identity profile",
    profileFields: ["external_id","organisation","sponsor_name","sponsor_reference"],
    requestTypes: ["stay_extension","bed_change","late_checkout","locker_request","complaint"],
    config: ["check_in_time","check_out_time","minimum_age","identity_required","housekeeping_turnover_minutes","late_checkout_fee"],
    portalActions: ["stay_extension","bed_change","late_checkout","locker_request"]
  },
  student_housing: {
    label: "Student residence operations",
    profileTitle: "Academic and guardian profile",
    profileFields: ["external_id","organisation","programme","level_or_designation","guardian_name","guardian_phone","guardian_email","sponsor_name","sponsor_reference","curfew_time"],
    requestTypes: ["leave_request","overnight_absence","room_transfer","guardian_update","disciplinary_appeal"],
    config: ["academic_year","term_start","term_end","curfew_time","guardian_required","leave_approval_required"],
    portalActions: ["leave_request","overnight_absence","room_transfer","guardian_update"]
  },
  staff_housing: {
    label: "Workforce accommodation operations",
    profileTitle: "Employment and eligibility profile",
    profileFields: ["external_id","organisation","department","level_or_designation","payroll_recovery","employer_paid_amount","eligibility_end_date","sponsor_name","sponsor_reference"],
    requestTypes: ["site_transfer","room_transfer","payroll_query","move_out_request","eligibility_review"],
    config: ["employer_name","hr_contact","payroll_recovery_enabled","eligibility_review_days","termination_checkout_days"],
    portalActions: ["site_transfer","room_transfer","payroll_query","move_out_request"]
  },
  commercial: {
    label: "Commercial lease operations",
    profileTitle: "Business contact and compliance profile",
    profileFields: ["external_id","organisation","department","level_or_designation","sponsor_name","sponsor_reference"],
    requestTypes: ["fitout_approval","signage_approval","access_request","renewal_request","break_notice","compliance_update"],
    config: ["tax_model","cam_billing_day","escalation_notice_days","fitout_approval_required","compliance_review_days"],
    portalActions: ["fitout_approval","signage_approval","access_request","renewal_request","compliance_update"]
  }
});

export function verticalContract(moduleId) {
  return VERTICAL_CONTRACTS[moduleId] || VERTICAL_CONTRACTS.residential;
}

export function requestLabel(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
