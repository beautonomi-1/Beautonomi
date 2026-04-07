import type { Metadata } from "next";
import AdminLayoutClient from "./AdminLayoutClient";

/**
 * All roles that use `/admin` (including superadmin) must not be indexed; belts-and-suspenders
 * with `robots.txt` disallow + `proxy.ts` X-Robots-Tag for SPA and API responses.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
