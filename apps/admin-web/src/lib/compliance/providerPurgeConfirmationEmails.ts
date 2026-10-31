export type ComplianceLookupProviderPayload = {
  email?: string | null;
  billing_email?: string | null;
  owner?: { email?: string | null } | null;
};

/** Maps lookup-provider API payload into confirmation allow-list strings (non-empty). */
export function providerPurgeConfirmationEmails(payload: ComplianceLookupProviderPayload): {
  businessEmail: string;
  billingEmail: string;
  ownerEmail: string;
} {
  return {
    businessEmail: payload.email != null ? String(payload.email).trim() : "",
    billingEmail: payload.billing_email != null ? String(payload.billing_email).trim() : "",
    ownerEmail:
      payload.owner && payload.owner.email != null ? String(payload.owner.email).trim() : "",
  };
}
