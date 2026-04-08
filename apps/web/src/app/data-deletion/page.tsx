import type { Metadata } from "next";
import Link from "next/link";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Data & Account Deletion | Beautonomi",
  description:
    "Learn how to request deletion of your Beautonomi account and personal data. Understand what is deleted, what is retained, and applicable retention periods.",
  alternates: {
    canonical: "/data-deletion",
    languages: getHreflangAlternateUrls("/data-deletion"),
  },
  robots: { index: true, follow: true },
};

const SUPPORT_EMAIL = "support@beautonomi.com";

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 w-full max-w-full">
      <BeautonomiHeader />

      <main className="w-full max-w-3xl mx-auto px-4 py-12 md:py-16">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-8" aria-label="Breadcrumb">
          <ol className="flex items-center gap-1">
            <li><Link href="/help" className="hover:underline">Help Centre</Link></li>
            <li aria-hidden>/</li>
            <li className="text-gray-900 font-medium">Account &amp; Data Deletion</li>
          </ol>
        </nav>

        <h1 className="text-4xl font-light text-gray-900 mb-3">
          Account &amp; Data Deletion
        </h1>
        <p className="text-base text-gray-500 mb-10">
          Applies to the <strong>Beautonomi</strong> and <strong>Beautonomi Partner</strong> apps
          published by <strong>Beautonomi</strong>.
        </p>

        {/* ── Section 1: in-app deletion ───────────────────────────── */}
        <section className="mb-10 border-b pb-10">
          <h2 className="text-2xl font-normal text-gray-900 mb-4">
            How to delete your account from within the app
          </h2>
          <p className="text-gray-600 mb-4">
            The quickest way to delete your account and data is directly inside the Beautonomi app.
            You will need your account password to confirm.
          </p>
          <ol className="list-decimal list-inside space-y-3 text-gray-700">
            <li>Open the <strong>Beautonomi</strong> app (or sign in at beautonomi.com or beautonomi.co.za).</li>
            <li>Sign in to your account.</li>
            <li>
              Tap your <strong>profile icon</strong> → <strong>Account Settings</strong> →{" "}
              <strong>Privacy &amp; Sharing</strong>.
            </li>
            <li>
              Scroll to <strong>Delete Account</strong> and tap{" "}
              <strong>Delete my account</strong>.
            </li>
            <li>Enter your password to confirm and follow the on-screen prompts.</li>
            <li>
              Your account will be permanently deleted immediately and you will be signed out.
            </li>
          </ol>
          <div className="mt-6">
            <Link
              href="/account-settings/privacy-and-sharing"
              className="inline-flex items-center gap-2 rounded-full bg-[#FF0077] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#e0006a] focus:outline-none focus:ring-2 focus:ring-[#FF0077] focus:ring-offset-2 transition-colors"
            >
              Go to Privacy &amp; Sharing settings →
            </Link>
          </div>
        </section>

        {/* ── Section 2: delete without account ───────────────────── */}
        <section className="mb-10 border-b pb-10">
          <h2 className="text-2xl font-normal text-gray-900 mb-4">
            Requesting deletion without signing in
          </h2>
          <p className="text-gray-600 mb-4">
            If you no longer have access to your account or prefer to contact us directly, email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Data%20Deletion%20Request`}
              className="text-[#FF0077] underline font-medium"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            with the subject line <strong>&ldquo;Data Deletion Request&rdquo;</strong> and include:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li>The email address or phone number linked to your Beautonomi account.</li>
            <li>Whether you want your entire account deleted or only specific data removed.</li>
          </ul>
          <p className="text-gray-600 mt-4">
            We will respond within <strong>5 business days</strong> and process the request within{" "}
            <strong>30 days</strong>, in line with applicable data protection law.
          </p>
        </section>

        {/* ── Section 3: what is deleted ───────────────────────────── */}
        <section className="mb-10 border-b pb-10">
          <h2 className="text-2xl font-normal text-gray-900 mb-4">
            What data is deleted
          </h2>
          <p className="text-gray-600 mb-4">
            When your account is deleted the following is permanently removed:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li>Your profile information (name, phone, email, avatar).</li>
            <li>Saved addresses and payment methods.</li>
            <li>In-app messages and associated media attachments.</li>
            <li>Push notification tokens and device registrations.</li>
            <li>Reviews and ratings you have submitted.</li>
            <li>Active sessions and authentication credentials.</li>
          </ul>
        </section>

        {/* ── Section 4: what is retained ─────────────────────────── */}
        <section className="mb-10 border-b pb-10">
          <h2 className="text-2xl font-normal text-gray-900 mb-4">
            Data that may be retained and why
          </h2>
          <p className="text-gray-600 mb-4">
            Some records must be kept for legal, financial, or safety reasons even after account
            deletion:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-4 py-2 font-medium text-gray-700">Data type</th>
                  <th className="border border-gray-200 px-4 py-2 font-medium text-gray-700">Retention period</th>
                  <th className="border border-gray-200 px-4 py-2 font-medium text-gray-700">Reason</th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                <tr>
                  <td className="border border-gray-200 px-4 py-2">Booking &amp; transaction records</td>
                  <td className="border border-gray-200 px-4 py-2">5 years</td>
                  <td className="border border-gray-200 px-4 py-2">Financial / tax compliance</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-200 px-4 py-2">Payment receipts &amp; invoices</td>
                  <td className="border border-gray-200 px-4 py-2">5 years</td>
                  <td className="border border-gray-200 px-4 py-2">Accounting and dispute resolution</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-4 py-2">Anonymised analytics events</td>
                  <td className="border border-gray-200 px-4 py-2">Indefinitely (no personal identifiers)</td>
                  <td className="border border-gray-200 px-4 py-2">Aggregate product improvement</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-200 px-4 py-2">Fraud or safety reports</td>
                  <td className="border border-gray-200 px-4 py-2">Up to 7 years</td>
                  <td className="border border-gray-200 px-4 py-2">Safety &amp; legal obligations</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-4 py-2">Support ticket content</td>
                  <td className="border border-gray-200 px-4 py-2">3 years</td>
                  <td className="border border-gray-200 px-4 py-2">Dispute resolution &amp; audit</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-gray-500 text-xs mt-3">
            All retained records are stored securely and are not used for marketing.
          </p>
        </section>

        {/* ── Section 5: partial deletion ─────────────────────────── */}
        <section className="mb-10 border-b pb-10">
          <h2 className="text-2xl font-normal text-gray-900 mb-4">
            Requesting deletion of specific data without deleting your account
          </h2>
          <p className="text-gray-600">
            You can request removal of specific personal data (e.g. a saved address, a review, or
            uploaded photos) without deleting your entire account. Email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Partial%20Data%20Deletion%20Request`}
              className="text-[#FF0077] underline font-medium"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            describing what you would like removed. We will assess and respond within{" "}
            <strong>5 business days</strong>.
          </p>
        </section>

        {/* ── Section 6: contact ───────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-2xl font-normal text-gray-900 mb-4">Contact us</h2>
          <p className="text-gray-600 mb-2">
            For any questions about your data or this policy, contact our privacy team:
          </p>
          <ul className="text-gray-700 space-y-1 text-sm">
            <li>
              Email:{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#FF0077] underline">
                {SUPPORT_EMAIL}
              </a>
            </li>
            <li>
              Help Centre:{" "}
              <Link href="/help" className="text-[#FF0077] underline">
                beautonomi.com/help
              </Link>
            </li>
          </ul>
          <p className="text-gray-500 text-xs mt-4">
            Last updated: April 2026 &middot; Beautonomi &middot; beautonomi.com / beautonomi.co.za
          </p>
        </section>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
