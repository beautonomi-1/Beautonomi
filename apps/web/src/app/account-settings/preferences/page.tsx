import PreferencesPageClient from "./PreferencesPageClient";
import { fetchPreferencesInitial } from "./fetch-preferences-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await fetchPreferencesInitial();
  return <PreferencesPageClient initial={initial} />;
}
