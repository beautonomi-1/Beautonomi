import { Redirect } from "expo-router";

/**
 * Signup is unified with login — same OTP / OAuth welcome flow.
 * Deep links to `/(auth)/signup` land on the welcome screen.
 */
export default function SignupRedirectScreen() {
  return <Redirect href="/(auth)/login" />;
}
