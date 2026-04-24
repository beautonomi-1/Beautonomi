import WaitlistPageClient from "./WaitlistPageClient";
import { fetchWaitlistInitial } from "./fetch-waitlist-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialEntries = await fetchWaitlistInitial();
  return <WaitlistPageClient initialEntries={initialEntries} />;
}
