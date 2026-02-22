import React from 'react';
import Link from 'next/link';

const articles = [
  {
    title: "Canceling your reservation for a stay",
    description: "Your plans have changed and now you need to cancel your reservation. No problem.",
    link: "#"
  },
  {
    title: "Change the date or time of your Experience reservation",
    description: "You booked an Experience, but the date or time no longer works for you? Don’t worry, you...",
    link: "#"
  },
  {
    title: "If your Beauty Partner cancels your reservation",
    description: "While it’s rare, sometimes a Beauty Partner may need to cancel a reservation. We understand this can ...",
    link: "#"
  },
  {
    title: "Payment methods accepted",
    description: "Beautonomi supports different payment methods, depending on the country your payment ...",
    link: "#"
  },
  {
    title: "Editing, removing, or adding a payment method",
    description: "If an existing payment method on your account is incorrect (ex: an expired credit...",
    link: "#"
  },
  {
    title: "When you’ll pay for your reservation",
    description: "You just made a reservation—congrats! So, what happens next? Your payment method ...",
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
