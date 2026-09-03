export const REMEMBER_ME_COOKIE = "beautonomi_remember_me";
export const REMEMBER_ME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function rememberMeCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: REMEMBER_ME_MAX_AGE_SECONDS,
  };
}
