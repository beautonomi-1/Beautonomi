import AccountProfileSections from "../components/account-profile-sections";
import { fetchPersonalInfoInitial } from "./fetch-personal-info-initial";
import { PersonalInfoClient } from "./PersonalInfoClient";

export const dynamic = "force-dynamic";

export default async function PersonalInfoPage() {
  const initial = await fetchPersonalInfoInitial();

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8 space-y-8 md:space-y-10">
      <AccountProfileSections />
      <PersonalInfoClient initial={initial} />
    </div>
  );
}
