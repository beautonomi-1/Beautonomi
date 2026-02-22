import React from "react";
import Image from "next/image";
import Image1 from "./../../../../public/images/AIR_Q22024_NewsroomPost_08.05.webp";
import { Button } from "@/components/ui/button";
import Download from "./../../../../public/images/download-icon.svg";
import Facebook from "./../../../../public/images/facebook-icon.svg";
import Twitter from "./../../../../public/images/twitter-icon.svg";
import Pinterest from "./../../../../public/images/pinterest-icon.svg";
import Link from "./../../../../public/images/link-icon.svg";
import LinkedIn from "./../../../../public/images/LinkedIn-icon.svg";

const socialMedia = [
  { src: Facebook, alt: "Facebook", link: "https://www.facebook.com/Beautonomi" },
  { src: Twitter, alt: "Twitter", link: "https://twitter.com/Beautonomi" },
  {
    src: Pinterest,
    alt: "Pinterest",
    link: "https://www.pinterest.com/Beautonomi",
  },
  {
    src: LinkedIn,
    alt: "LinkedIn",
    link: "https://www.linkedin.com/company/Beautonomi",
  },
  { src: Link, alt: "Link", link: "https://www.Beautonomi.com" },
];
const financialResultsData = [
  {
    title: "Overview of Q2 results",
    overview: `Q2 marked another strong quarter for Beautonomi. Revenue increased 11 percent year-over-year to $2.75 billion. 
      Net income was $555 million, representing a net income margin of 20 percent. Adjusted EBITDA of $894 million increased 
      9 percent year-over-year and represented an Adjusted EBITDA Margin of 33 percent. We generated $1.0 billion of FCF during 
      Q2 and $4.3 billion of FCF over the trailing twelve months—our highest ever.`,
    priorities: [
      {
        title: "Making Beauty partner mainstream:",
        description: `Last year, we shared our commitment to making beauty partner just as popular as traveling on Beautonomi. We’ve been focused 
          on raising awareness around the benefits of beauty partner and providing better tools for hosts. In Q2 2024, we surpassed 8 million 
          active listings, driven by continued growth across all regions and market types. But we’re not just growing supply; we’re 
          committed to ensuring it’s high quality. As part of this commitment, since we launched our updated beauty partner quality system 
          in April 2023, we’ve removed over 200,000 listings that failed to meet our guests’ expectations to ensure we consistently deliver high-quality stays.`,
      },
      {
        title: "Perfecting the core service:",
        description: `We remain focused on making Beautonomi more reliable, affordable, and an overall better service for hosts and guests. 
          In recent years, we’ve rolled out hundreds of new features and upgrades to our platform. We’ve introduced major reliability 
          initiatives like Clients Favorites, which make it easier for guests to find great listings, and since its launch, we’ve seen 
          over 150 million nights booked at Clients Favorite listings. We’ve also made dozens of smaller changes that have led to 
          improved usability and booking conversion.`,
      },
      {
        title: "Expanding beyond the core:",
        description: `We continue to drive growth by investing in under-penetrated markets. In Q2, growth of gross nights booked on 
          an origin basis in our expansion markets significantly outperformed our core markets on average. We’re leveraging our global 
          expansion playbook, which includes a more localized product and marketing approach, and will continue investing in less 
          mature markets throughout 2024 and beyond. We’re also expanding Beautonomi brand positioning beyond travel accommodations 
          with the global roll out of Beautonomi Icons, a new category of extraordinary experiences that we launched in May. This will 
          be critical as we expand our offerings in the coming years.`,
      },
    ],
  },
  {
    title: "Q2 2024 financial results",
    overview: `Here’s a snapshot of our Q2 2024 results: `,
    priorities: [
      {
        title: "Q2 revenue was $2.75 billion, up 11% year-over-year.",
        description: `Revenue increased to $2.75 billion in Q2 2024 from $2.5 billion in Q2 2023, primarily driven by solid growth in Nights and Experiences Booked and a modest increase in Average Daily Rate (“ADR”). `,
      },
      {
        title:
          "Q2 net income was $555 million, representing a 20% net income margin. ",
        description: `Net income decreased to $555 million in Q2 2024 from $650 million in Q2 2023 primarily due to an increase in income taxes resulting from the release of a valuation allowance on certain of our deferred tax assets in 2023 and the utilization of some of those assets in 2024. In Q2 2024, we delivered a net income margin of 20%, down from 26% in Q2 2023.`,
      },
      {
        title: "Q2 Adjusted EBITDA was $894 million, up 9% year-over-year. ",
        description: `Adjusted EBITDA increased to $894 million in Q2 2024 from $819 million in Q2 2023, which demonstrates the continued strength of our business and discipline in managing our cost structure. Adjusted EBITDA Margin was 33% in Q2 2024, which was stable with Q2 20231. `,
      },
      {
        title: "Q2 Free Cash Flow was $1.0 billion, up 16% year-over-year.",
        description: `In Q2 2024, net cash provided by operating activities was $1.1 billion compared to $909 million in Q2 2023. The increase in year-over-year cash flow was driven by continued strong business performance. Our TTM FCF was $4.3 billion, representing a FCF Margin of 41%2.`,
      },
      {
        title: "Q2 share repurchases of $749 million.",
        description: `Our strong cash flow enabled us to repurchase $749 million of our Class A common stock in Q2 2024. Share repurchases for the trailing twelve months totaled $2.75 billion and helped us to reduce our fully diluted share count from 686 million at the end of Q2 2023 to 673 million at the end of Q2 2024. We have a remaining authorization to purchase up to $5.25 billion of our Class A common stock as of June 30, 2024. `,
      },
    ],
  },
  {
    title: "Business highlights",
    overview: `Our strong quarter was driven by a number of positive business highlights: `,
    priorities: [
      {
        title: "Guests are increasingly booking on the Beautonomi app.",
        description:
          "In Q2 2024, Nights and Experiences Booked increased 9% year-over-year, representing stable growth from Q1. With the growing reliance on smartphones for travel planning and booking, we optimized our mobile website to promote Beautonomi app downloads. We believe our approach is working. In Q2 2024, we saw a 25% year-over-year increase in app downloads globally, with even stronger growth in the US. In addition, nights booked on our app during Q2 2024 increased 19% year-over-year and now comprises 55% of total nights booked, up from 50% in the prior-year period. In addition to our success with mobile downloads and bookings, we’re seeing continued growth of first-time bookers on our platform, with the highest level of growth seen in the youngest age demographic.",
      },
      {
        title: "Guests are choosing Beautonomi for special events.",
        description:
          "The week of July 4th represented our single highest week of revenue ever in North America, and we’re continuing to see more guests choose Beautonomi for major holidays and events. In Europe, major sporting events are driving notable bookings growth. In anticipation of the Summer Olympic Games Paris 2024, nights booked in the Paris region for the dates of the event through Q2 were more than double what they were the same time a year ago. To help meet this increased demand, we focused on supply growth and saw active listings increase 37% year-over-year in the Paris region as of Q2 2024. Over the course of the Olympics, more than 400,000 guests are staying on Beautonomi in the Paris region. And during the recent Euro Cup in Germany, cities beauty partner matches saw on average a more than 20% year-over-year increase in nights booked compared to the prior-year period, with certain cities seeing more than 50% growth. ",
      },
      {
        title: "Supply quality is improving on Beautonomi.",
        description:
          "We’ve made huge strides with supply growth, but remain just as focused on supply quality. As we improve quality, we believe more people will try Beautonomi, unlocking even more growth. We have two major initiatives underway to help us do this. First, we’re removing low-quality supply, including the removal of over 200,000 listings since we launched our updated beauty partner quality system in April 2023, which takes a more targeted and holistic approach to better evaluate listings. Second, we’re making it easier for guests to find the best places to stay. We launched Clients Favorites as well as top listing highlights, which show percentile ranking for the top 1%, 5%, and 10% of eligible homes. These new features make it easy for guests to find the highest-quality homes on Beautonomi and over 150 million nights have already been booked at our Clients Favorite listings since launch. In Q2, we also saw active listings managed by Superhosts, some of our most high-quality hosts, increase 26% year-over-year. ",
      },
    ],
  },
];

const FinancialResults = () => {
  return (
    <div className="pb-20 md:pb-32">
      <div className="container">
        <div>
          <div className="max-w-[720px] mx-auto">
            <h2 className="text-[32px] lg:text-[46px] font-normal  text-secondary  mb-3">
            Beautonomi Q2 2024 financial results
            </h2>
            <h3 className="text-sx font-normal text-secondary  mb-5">
              By{" "}
              <a
                className="underline font-normal  text-black"
                href="https://news.Beautonomi.com/author/Beautonomipress/"
              >
                Beautonomi
              </a>
              . August 6, 2024 ·{" "}
              <a
                className="underline font-normal  text-black"
                href="https://news.Beautonomi.com/category/company-information/"
              >
                Company
              </a>
            </h3>
            <div className="flex gap-4 mb-16">
              {socialMedia.map((social, index) => (
                <a
                  key={index}
                  href={social.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Image
                    src={social.src}
                    alt={social.alt}
                    width={24}
                    height={24}
                  />
                </a>
              ))}
            </div>
          </div>
          <div className="mb-16">
            <Image src={Image1} alt="" className="rounded-xl" />
          </div>
          <div className="flex justify-between">
            <div>
              <div className="">
                {socialMedia.map((social, index) => (
                  <a
                    key={index}
                    href={social.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Image
                      className="mb-5"
                      src={social.src}
                      alt={social.alt}
                      width={24}
                      height={24}
                    />
                  </a>
                ))}
              </div>
            </div>
            <div className="max-w-[720px] mx-auto">
              <div className="mb-10">
                <p className="text-base md:text-lg font-normal  text-secondary">
                  We issued our second quarter 2024 financial results. You can
                  read the details{" "}
                  <a
                    className="hover:text-black font-normal  underline"
                    href="https://investors.Beautonomi.com/financials/default.aspx#quarterly"
                  >
                    here.
                  </a>
                </p>
                <p className="text-base md:text-lg font-normal  text-secondary mb-6">
                Beautonomi Co-Founder and CEO Brian Chesky said:
                </p>
                <p className="text-base md:text-lg font-normal  text-secondary italic">
                  “We had another strong quarter at Beautonomi, closing out Q2 with
                  more than one billion dollars in free cash flow and over 8
                  million listings globally. I’m proud of our results and the
                  quality that our platform continues to deliver for hosts and
                  guests around the world.”
                </p>
              </div>
              {financialResultsData.map((section, index) => (
                <div key={index} className="mb-10">
                  <h3 className="text-[26px] lg:text-[32px] font-normal  text-secondary mb-5">
                    {section.title}
                  </h3>
                  <p className="text-base md:text-lg font-normal  text-secondary mb-6">
                    {section.overview}
                  </p>
                  <p className="text-base md:text-lg font-normal  text-secondary mb-12">
                    During the quarter, we made significant progress across each
                    of our 2024 strategic priorities:
                  </p>
                  <ul className="list-disc pl-5 text-base md:text-lg">
                    {section.priorities.map((priority, index) => (
                      <li key={index} className="mb-4">
                        <strong className="font-bold">
                          {priority.title}{" "}
                        </strong>
                        {priority.description}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="max-w-[720px] mx-auto">
            <div className="border-b pb-16 mb-12">
              <p className="text-sm font-normal  text-secondary mb-6">
                1A reconciliation of non-GAAP financial measures to the most
                comparable GAAP measures is provided at the end of the{" "}
                <a
                  className="underline text-black font-normal "
                  href="https://investors.Beautonomi.com/home/default.aspx"
                >
                  letter.
                </a>
              </p>
              <p className="text-sm font-normal  text-secondary">
                {" "}
                2A reconciliation of non-GAAP financial measures to the most
                comparable GAAP measures is provided at the end of the
                <a
                  className="underline text-black font-normal "
                  href="https://investors.Beautonomi.com/home/default.aspx"
                >
                  letter.
                </a>
              </p>
            </div>
            <h4 className="text-base md:text-lg font-normal  mb-4">
              {" "}
              About Beautonomi{" "}
            </h4>
            <p className="text-sm font-normal  text-secondary mb-20 md:mb-32">
            Beautonomi was born in 2007 when two hosts welcomed three guests to
              their San Francisco home, and has since grown to over 5 million
              hosts who have welcomed over 1.5 billion Clients arrivals in almost
              every country across the globe. Every day, hosts offer unique
              stays and experiences that make it possible for guests to connect
              with communities in a more authentic way.
            </p>
            <Button variant="destructive" className="mx-auto flex gap-3">
              Download logo assests
              <Image src={Download} alt="" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialResults;
