import LearnHomeClient from "./learn-home-client";
import { getPublicLearnHome } from "@/lib/learn/public-queries";

export const revalidate = 300;

export default async function LearnHomePage() {
  const data = await getPublicLearnHome();
  return <LearnHomeClient initialData={data} />;
}
