import type { Metadata } from "next";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Beautonomi Customer EULA",
  description: "End User License Agreement for the Beautonomi customer mobile app.",
  alternates: {
    canonical: "/customer/eula",
    languages: getHreflangAlternateUrls("/customer/eula"),
  },
};

export default function CustomerEulaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
