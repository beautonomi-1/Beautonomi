import Link from "next/link";

/**
 * Generic Paystack callback landing page.
 * (Booking / membership / gift-card purchases all redirect here.)
 */
export default function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg border rounded-lg p-6">
        <h1 className="text-2xl font-semibold mb-2">Payment received</h1>
        <p className="text-sm text-gray-600 mb-6">
          Thanks—your payment is being confirmed. If this was a booking, you can check it in your account. If this was a
          gift card or membership, it will be available shortly.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/account-settings/bookings"
            className="inline-flex items-center justify-center bg-gray-900 text-white px-4 py-2 rounded-md"
          >
            View bookings
          </Link>
          <Link
            href="/account-settings/payments"
            className="inline-flex items-center justify-center border border-gray-200 px-4 py-2 rounded-md"
          >
            View payments & gift cards
          </Link>
        </div>
      </div>
    </div>
  );
}

