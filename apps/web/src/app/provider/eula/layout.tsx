import type { Metadata } from "next";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Beautonomi Partner EULA",
  description: "End User License Agreement for the Beautonomi Partner mobile app.",
  alternates: {
    canonical: "/provider/eula",
    languages: getHreflangAlternateUrls("/provider/eula"),
  },
};

export default function PartnerEulaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
