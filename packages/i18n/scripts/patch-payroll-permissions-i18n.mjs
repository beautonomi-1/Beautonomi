#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeWriteJson } from "./_safe-write-json.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");
const OVERLAYS = new Set(["en-GB", "en-US", "en-AU", "pt-BR", "es-MX"]);

function flatten(obj, prefix = "") {
  const out = new Map();
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of flatten(value, full)) out.set(k, v);
    } else {
      out.set(full, value);
    }
  }
  return out;
}

function unflatten(flat) {
  const root = {};
  for (const [pathKey, value] of flat) {
    const parts = pathKey.split(".");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return root;
}

const enPath = path.join(localesDir, "en.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
const enFlat = flatten(en);

const NEW_KEYS = {
  "web.provider.settings.pages.team/commissions.statutoryMode":
    "Statutory deductions (PAYE / UIF)",
  "web.provider.settings.pages.team/commissions.statutoryAuto":
    "Auto (calculate on pay run)",
  "web.provider.settings.pages.team/commissions.statutoryManual":
    "Manual (enter on pay run)",
  "web.provider.settings.pages.team/commissions.statutoryNone":
    "None (skip statutory)",
  "web.provider.settings.pages.team/commissions.statutoryModeHint":
    "Controls whether PAYE and UIF are calculated automatically, entered manually, or skipped for this team member.",
  "web.provider.settings.pages.team/commissions.legacyCompensationReadOnly":
    "Commission, hourly, and salary tabs are read-only without Manage payroll.",
  "provider.mobile.screens.moreTab.engagementSubtitleNoMarketing":
    "Reviews & messaging",
  "provider.mobile.screens.engagementHub.subtitleNoMarketing":
    "Reviews & messaging",
  "provider.mobile.screens.myEarnings.clawback": "Commission clawback",
  "provider.mobile.screens.myEarnings.carryForwardIn": "Carry-forward (in)",
  "provider.mobile.screens.myEarnings.carryForwardOut": "Carry-forward (out)",
  "web.provider.pages.team/my-earnings.clawback": "Commission clawback",
  "web.provider.pages.team/my-earnings.carryForwardIn": "Carry-forward (in)",
  "web.provider.pages.team/my-earnings.carryForwardOut": "Carry-forward (out)",
  "provider.mobile.screens.teamCommissions.payPlanReadOnly":
    "Only users with Manage payroll can change pay plans.",
  "provider.mobile.screens.teamCommissions.payPlanSection": "Pay plan (payroll)",
  "provider.mobile.screens.teamCommissions.payModel": "Pay model",
  "provider.mobile.screens.teamCommissions.employmentType": "Employment type",
  "provider.mobile.screens.teamCommissions.effectiveFrom": "Effective from",
  "provider.mobile.screens.teamCommissions.statutoryMode": "Statutory deductions",
  "provider.mobile.screens.teamCommissions.savePaySettings": "Save pay settings",
  "provider.mobile.screens.teamMember.payPlanSummary": "Pay plan",
  "provider.mobile.screens.teamMember.payPlanEditHint":
    "Open team commissions to edit pay model and rates.",
  "web.provider.pages.team/payroll/[id].clawback": "Commission clawback",
  "web.provider.pages.team/payroll/[id].carryForwardIn": "Carry-forward (in)",
  "web.provider.pages.team/payroll/[id].carryForwardOut": "Carry-forward (out)",
  "web.provider.pages.team/payroll/[id].complianceWarningsTitle": "Compliance warnings",
  "web.provider.pages.team/payroll/[id].suggestedTopUp": "Suggested top-up {{amount}}",
  "web.provider.settings.pages.team/permissions.fullAccessMemberHint":
    "Owners and staff with admin access always have full permissions. Their toggles are read-only here.",
  "provider.mobile.screens.payRunDetail.clawback": "Clawback {{amount}}",
  "provider.mobile.screens.payRunDetail.carryForwardIn": "Carry in {{amount}}",
  "provider.mobile.screens.payRunDetail.carryForwardOut": "Carry out {{amount}}",
  "provider.mobile.screens.payRunDetail.complianceWarningsTitle": "Compliance warnings",
  "provider.mobile.screens.payroll.biweekly": "Biweekly",
  "provider.mobile.screens.payroll.semiMonthly": "Semi-monthly",
  "provider.mobile.screens.payroll.custom": "Custom",
  "provider.mobile.screens.payroll.periodRangeLabel": "Pay period range",
  "provider.mobile.screens.payroll.periodStart": "Period start",
  "provider.mobile.screens.payroll.periodEnd": "Period end",
  "provider.mobile.screens.staffPermissionsEdit.detachRoleTitle": "Detach from role?",
  "provider.mobile.screens.staffPermissionsEdit.detachRoleBody":
    "This person is on the shared role \"{{role}}\". Saving applies permissions only to them and removes them from that role. Continue?",
  "provider.mobile.screens.staffPermissionsEdit.continueSave": "Continue",
  "provider.mobile.screens.staffPermissionsEdit.cancel": "Cancel",
  "provider.mobile.screens.staffPermissionsEdit.calendarScopeLabel": "Calendar visibility",
  "provider.mobile.screens.staffPermissionsEdit.calendarScopeOwn": "Own appointments only",
  "provider.mobile.screens.staffPermissionsEdit.calendarScopeAll": "All team calendars",
  "provider.mobile.screens.staffPermissionsEdit.fullAccessMemberHint":
    "Owners and staff with admin access always have full permissions. Their toggles are read-only here.",
  "web.provider.pages.team/payroll/[id].csvClawback": "Commission clawback",
  "web.provider.pages.team/payroll/[id].csvCarryForwardIn": "Carry-forward (in)",
  "web.provider.pages.team/payroll/[id].csvCarryForwardOut": "Carry-forward (out)",
  "provider.mobile.screens.teamCommissions.baseAmount": "Base / salary",
  "provider.mobile.screens.teamCommissions.hourlyRate": "Hourly rate",
  "provider.mobile.screens.teamCommissions.serviceRate": "Service rate %",
  "provider.mobile.screens.teamCommissions.productRate": "Product rate %",
  "provider.mobile.screens.teamCommissions.thresholdAmount": "Threshold",
  "provider.mobile.screens.teamCommissions.tierMode": "Tier mode",
  "provider.mobile.screens.teamCommissions.tierModeRetroactive": "Retroactive",
  "provider.mobile.screens.teamCommissions.tierModeMarginal": "Marginal",
  "provider.mobile.screens.teamCommissions.tierModeRetroactiveHint":
    "When revenue crosses a tier, the higher rate applies to all revenue in the period.",
  "provider.mobile.screens.teamCommissions.tierModeMarginalHint":
    "Each tier rate applies only to revenue within that band.",
  "provider.mobile.screens.teamCommissions.statutory_auto": "Auto",
  "provider.mobile.screens.teamCommissions.statutory_manual": "Manual",
  "provider.mobile.screens.teamCommissions.statutory_none": "None",
  "provider.mobile.screens.teamCommissions.employment_employee": "Employee",
  "provider.mobile.screens.teamCommissions.employment_contractor": "Contractor",
  "provider.mobile.screens.teamCommissions.employment_apprentice": "Apprentice",
  "provider.mobile.screens.teamCommissions.payModel_commission_only": "Commission only",
  "provider.mobile.screens.teamCommissions.payModel_base_plus_commission": "Base salary plus commission",
  "provider.mobile.screens.teamCommissions.payModel_base_or_commission_higher": "Higher of base or commission",
  "provider.mobile.screens.teamCommissions.payModel_commission_above_threshold": "Commission above threshold",
  "provider.mobile.screens.teamCommissions.payModel_hourly": "Hourly",
  "provider.mobile.screens.teamCommissions.payModel_hourly_plus_commission": "Hourly plus commission",
  "provider.mobile.screens.teamCommissions.payModel_salary": "Salary",
  "provider.mobile.screens.teamCommissions.payModel_booth_renter": "Booth renter",
  "provider.mobile.screens.staffPermissionsEdit.manageMarketing": "Manage marketing",
};

for (const [k, v] of Object.entries(NEW_KEYS)) {
  enFlat.set(k, v);
}

safeWriteJson(enPath, unflatten(enFlat));

for (const file of fs.readdirSync(localesDir).filter((f) => f.endsWith(".json"))) {
  const code = file.replace(/\.json$/, "");
  if (code === "en" || OVERLAYS.has(code)) continue;
  const targetPath = path.join(localesDir, file);
  const target = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  const targetFlat = flatten(target);
  for (const [k, v] of enFlat) {
    if (!targetFlat.has(k)) targetFlat.set(k, v);
  }
  safeWriteJson(targetPath, unflatten(targetFlat));
  console.log("merged", code);
}

console.log("patch-payroll-permissions-i18n done");
