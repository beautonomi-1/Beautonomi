export const USER_REPORT_TYPE_CUSTOMER_PROVIDER = "customer_reported_provider" as const;
export const USER_REPORT_TYPE_PROVIDER_CUSTOMER = "provider_reported_customer" as const;
export const USER_REPORT_TYPE_SAFETY_HUB = "safety_report_user" as const;

export const USER_REPORT_TYPES = [
  USER_REPORT_TYPE_CUSTOMER_PROVIDER,
  USER_REPORT_TYPE_PROVIDER_CUSTOMER,
  USER_REPORT_TYPE_SAFETY_HUB,
] as const;

export type UserReportType = (typeof USER_REPORT_TYPES)[number];

export function labelForUserReportType(type: string): string {
  switch (type) {
    case USER_REPORT_TYPE_CUSTOMER_PROVIDER:
      return "Customer reported provider";
    case USER_REPORT_TYPE_PROVIDER_CUSTOMER:
      return "Provider reported customer";
    case USER_REPORT_TYPE_SAFETY_HUB:
      return "Safety hub user report";
    default:
      return type.replace(/_/g, " ");
  }
}
