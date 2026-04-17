import React from 'react';
import Link from 'next/link';

const articles = [
  {
    title: "Using the Beautonomi customer app (iOS & Android)",
    description:
      "How Home, Search, Bookings, Chats, and Wishlists work on your phone, plus Help, payments in the browser, and notifications.",
    link: "/learn/article/customer-mobile-app",
  },
  {
    title: "Canceling your booking",
    description: "Your plans have changed and you need to cancel your booking. Here’s how to do it and what to expect.",
    link: "/learn/article/canceling-your-booking",
  },
  {
    title: "Change the date or time of your appointment",
    description: "You booked a service, but the date or time no longer works? You can request to reschedule...",
    link: "/learn/article/reschedule-booking",
  },
  {
    title: "If your provider cancels your booking",
    description: "Sometimes a provider may need to cancel a booking. We’ll help you rebook or get a refund.",
    link: "/learn/article/if-provider-cancels",
  },
  {
    title: "Payment methods accepted",
    description: "Beautonomi supports different payment methods, depending on your country and payment ...",
    link: "/learn/article/payment-methods-accepted",
  },
  {
    title: "Editing, removing, or adding a payment method",
    description: "If an existing payment method on your account is incorrect (e.g. an expired card)...",
    link: "/learn/article/edit-payment-method",
  },
  {
    title: "When you’ll pay for your booking",
    description: "You just made a booking—here’s what happens next and when your payment method is charged.",
    link: "/learn/article/when-you-pay-booking",
  },
];

export default function TopArticles() {
  return (
    <section className="max-w-6xl mx-auto px-4">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="text-[26px] font-normal text-secondary">Top articles</h2>
        <Link href="/learn" className="text-sm font-medium text-primary hover:underline">More in Learning Center</Link>
      </div>
      <div className="grid gap-8 gap-y-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {articles.map((article, index) => (
          <div key={index} className='border-b pb-8 mb-8'>
            <h3 className="font-normal  text-lg mb-1">
              <Link href={article.link} className="underline hover:text-primary">
                {article.title}
              </Link>
            </h3>
            <p className="text-base font-light  text-destructive">
              {article.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
