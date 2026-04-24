import LoginAndSecurityPageClient from "./LoginAndSecurityPageClient";
import { fetchLoginAndSecurityInitial } from "./fetch-login-and-security-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await fetchLoginAndSecurityInitial();
  return <LoginAndSecurityPageClient initial={initial} />;
}
