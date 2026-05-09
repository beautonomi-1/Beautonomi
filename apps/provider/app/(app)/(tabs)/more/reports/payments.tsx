import { Redirect } from "expo-router";

/** @deprecated Open Payment Summary via reports → Payment Summary (detail) */
export default function PaymentsReportLegacyRedirect() {
  return <Redirect href="/(app)/(tabs)/more/reports/detail/payment-summary" />;
}
