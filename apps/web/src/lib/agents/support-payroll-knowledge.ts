/** Accurate provider payroll / staff onboarding facts for support agent prompts. */
export const SUPPORT_PAYROLL_KNOWLEDGE = `
Provider payroll (salon accounts only — not freelancers):
- Pay runs use staff earnings lines + pay plans; enable payroll v2 in settings for statutory estimates (UIF/SDL/PAYE for ZA).
- Staff invites: open /provider/join?token=…, set password on the join page (invite valid 14 days), then sign in and accept.
- Multi-salon staff: use the salon switcher in the provider sidebar; active salon is stored in a cookie/header.
- Payslips: available after pay run approval via pay run item payslip download (HTML print-to-PDF).
- Statutory lines in manual mode when jurisdiction rules are missing or unverified — owner can edit PAYE on draft runs.
`.trim();
