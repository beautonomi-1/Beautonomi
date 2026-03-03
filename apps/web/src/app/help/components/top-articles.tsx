import React from 'react';
import Link from 'next/link';

const articles = [
  {
    title: "Canceling your booking",
    description: "Your plans have changed and you need to cancel your booking. Here’s how to do it and what to expect.",
    link: "#"
  },
  {
    title: "Change the date or time of your appointment",
    description: "You booked a service, but the date or time no longer works? You can request to reschedule...",
    link: "#"
  },
  {
    title: "If your provider cancels your booking",
    description: "Sometimes a provider may need to cancel a booking. We’ll help you rebook or get a refund.",
    link: "#"
  },
  {
    title: "Payment methods accepted",
    description: "Beautonomi supports different payment methods, depending on your country and payment ...",
    link: "#"
  },
  {
    title: "Editing, removing, or adding a payment method",
    description: "If an existing payment method on your account is incorrect (e.g. an expired card)...",
    link: "#"
  },
  {
    title: "When you’ll pay for your booking",
    description: "You just made a booking—here’s what happens next and when your payment method is charged.",
    link: "#"
  }
];

export default function TopArticles() {
  return (
    <section className="max-w-6xl mx-auto px-4">
      <h2 className="text-[26px] font-normal  mb-6 text-secondary">Top articles</h2>
      <div className="grid gap-8 gap-y-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {articles.map((article, index) => (
          <div key={index} className='border-b pb-8 mb-8'>
            <h3 className="font-normal  text-lg mb-1">
              <Link href={article.link || `/help/articles/${article.title.toLowerCase().replace(/\s+/g, '-')}`} className="underline hover:text-[#FF0077]">
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
