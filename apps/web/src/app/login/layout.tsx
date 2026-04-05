import type { Metadata } from "next";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to your Beautonomi account.",
  alternates: {
    canonical: "/login",
    languages: getHreflangAlternateUrls("/login"),
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
