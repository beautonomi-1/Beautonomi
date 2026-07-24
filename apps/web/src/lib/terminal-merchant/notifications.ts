import { dispatchTemplateNotification, withTenantVariable } from "@/lib/notifications/dispatch-template-notification";
import { terminalMerchantApplicationSetupUrl } from "@/lib/terminal-merchant/types";

type NotifyInput = {
  userId: string;
  tenantId?: string | null;
  businessName: string;
  applicationNo: string;
  applicationId: string;
};

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

export async function notifyTerminalMerchantApplicationSubmitted(input: NotifyInput) {
  await dispatchTemplateNotification(
    "terminal_merchant_application_submitted",
    [input.userId],
    withTenantVariable(input.tenantId, {
      business_name: input.businessName,
      application_no: input.applicationNo,
      application_id: input.applicationId,
      app_url: terminalMerchantApplicationSetupUrl(input.applicationId),
    }),
    ["push", "email"],
    { appType: "provider" },
  );
}

export async function notifyTerminalMerchantApplicationInfoRequired(
  input: NotifyInput & { infoReason: string },
) {
  await dispatchTemplateNotification(
    "terminal_merchant_application_info_required",
    [input.userId],
    withTenantVariable(input.tenantId, {
      business_name: input.businessName,
      application_no: input.applicationNo,
      application_id: input.applicationId,
      info_reason: input.infoReason,
      app_url: terminalMerchantApplicationSetupUrl(input.applicationId),
    }),
    ["push", "email"],
    { appType: "provider" },
  );
}

export async function notifyTerminalMerchantApplicationTermSheetSent(
  input: NotifyInput & { otpPhone: string },
) {
  await dispatchTemplateNotification(
    "terminal_merchant_application_term_sheet_sent",
    [input.userId],
    withTenantVariable(input.tenantId, {
      business_name: input.businessName,
      application_no: input.applicationNo,
      application_id: input.applicationId,
      otp_phone: input.otpPhone,
      app_url: terminalMerchantApplicationSetupUrl(input.applicationId),
    }),
    ["push", "email"],
    { appType: "provider" },
  );
}

export async function notifyTerminalMerchantApplicationApproved(input: NotifyInput) {
  await dispatchTemplateNotification(
    "terminal_merchant_application_approved",
    [input.userId],
    withTenantVariable(input.tenantId, {
      business_name: input.businessName,
      application_no: input.applicationNo,
      application_id: input.applicationId,
      app_url: terminalMerchantApplicationSetupUrl(input.applicationId),
    }),
    ["push", "email"],
    { appType: "provider" },
  );
}

export async function notifyTerminalMerchantApplicationDeclined(
  input: NotifyInput & { declineReason: string },
) {
  await dispatchTemplateNotification(
    "terminal_merchant_application_declined",
    [input.userId],
    withTenantVariable(input.tenantId, {
      business_name: input.businessName,
      application_no: input.applicationNo,
      application_id: input.applicationId,
      decline_reason: input.declineReason,
      app_url: terminalMerchantApplicationSetupUrl(input.applicationId),
    }),
    ["push", "email"],
    { appType: "provider" },
  );
}
