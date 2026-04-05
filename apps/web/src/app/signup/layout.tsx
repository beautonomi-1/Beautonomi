import type { Metadata } from "next";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your Beautonomi account as a customer or provider.",
  alternates: {
    canonical: "/signup",
    languages: getHreflangAlternateUrls("/signup"),
  },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
