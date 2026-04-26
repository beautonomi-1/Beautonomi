type SocialAuthConfig = {
  google: boolean;
  apple: boolean;
};

let cachedSocialAuthConfig: SocialAuthConfig | null = null;

export async function getSocialAuthConfig(): Promise<SocialAuthConfig> {
  if (cachedSocialAuthConfig) return cachedSocialAuthConfig;
  try {
    const res = await fetch("/api/public/third-party-config?service=social_auth", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { social_auth?: Partial<SocialAuthConfig> } | Partial<SocialAuthConfig>;
    };
    const raw = (json?.data as { social_auth?: Partial<SocialAuthConfig> } | undefined)?.social_auth ??
      (json?.data as Partial<SocialAuthConfig> | undefined);
    cachedSocialAuthConfig = {
      google: raw?.google !== false,
      apple: raw?.apple !== false,
    };
    return cachedSocialAuthConfig;
  } catch {
    return { google: true, apple: true };
  }
}
