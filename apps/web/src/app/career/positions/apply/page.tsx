import { redirect } from "next/navigation";
import { getResolvedCareersPortalUrl } from "@/lib/cms/careers-page-server";

export default async function CareerApplyRedirectPage() {
  redirect(await getResolvedCareersPortalUrl());
}
