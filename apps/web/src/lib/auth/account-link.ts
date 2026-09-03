export type AccountLinkMethod = "google" | "apple" | "email" | "phone" | "password";

export type AccountLinkIdentity = {
  provider?: string | null;
};

/**
 * Map GoTrue identities to the sign-in offers we surface on "already registered".
 * `email` identity = email OTP and/or password; we always offer email OTP,
 * and treat `email` as a password identity for set-password gating.
 */
export function detectAccountLinkMethods(
  identities: AccountLinkIdentity[] | null | undefined,
): AccountLinkMethod[] {
  const methods = new Set<AccountLinkMethod>();
  for (const identity of identities ?? []) {
    const provider = (identity.provider ?? "").toLowerCase();
    if (provider === "google") methods.add("google");
    else if (provider === "apple") methods.add("apple");
    else if (provider === "phone") methods.add("phone");
    else if (provider === "email") {
      methods.add("email");
      methods.add("password");
    }
  }
  return ["google", "apple", "email", "phone", "password"].filter((m) =>
    methods.has(m as AccountLinkMethod),
  ) as AccountLinkMethod[];
}

/** No email/password identity — offer to set a password after OAuth/OTP sign-in. */
export function shouldOfferSetPassword(
  identities: AccountLinkIdentity[] | null | undefined,
): boolean {
  return detectAccountLinkMethods(identities).includes("password") === false;
}

export function primaryAccountLinkOffer(
  methods: AccountLinkMethod[],
): "google" | "email" | "apple" | "phone" | null {
  if (methods.includes("google")) return "google";
  if (methods.includes("email")) return "email";
  if (methods.includes("apple")) return "apple";
  if (methods.includes("phone")) return "phone";
  return null;
}
