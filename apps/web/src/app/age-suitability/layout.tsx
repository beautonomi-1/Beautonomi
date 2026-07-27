import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Age Suitability",
  description: "Age suitability, content types, and safety controls for Beautonomi.",
  robots: {
    index: false,
    follow: true,
    nocache: true,
    googleBot: {
      index: false,
      follow: true,
      noimageindex: true,
    },
  },
};

export default function AgeSuitabilityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
