import LoginAndSecurityPageClient from "@/app/account-settings/login-and-security/LoginAndSecurityPageClient";
import { fetchLoginAndSecurityInitial } from "@/app/account-settings/login-and-security/fetch-login-and-security-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await fetchLoginAndSecurityInitial();
  return (
    <LoginAndSecurityPageClient
      initial={initial}
      accountHomeHref="/provider/settings"
      accountHomeLabel="Provider settings"
    />
  );
}
