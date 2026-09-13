import { getServerT } from "@/lib/i18n/server";
import { resolveRequestLanguage } from "@/lib/locale/resolve-request-language";

export default async function AccountSettingsLoading() {
  const ctx = await resolveRequestLanguage();
  const t = await getServerT(ctx.language);
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]" aria-busy="true">
      <p className="text-sm text-gray-500">{t("web.accountSettings.loading.loading") as string}</p>
    </div>
  );
}
