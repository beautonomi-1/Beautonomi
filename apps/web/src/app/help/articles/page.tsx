'use client'
import { Button } from "@/components/ui/button";
import Image, { StaticImageData } from "next/image";
import Image1 from "./../../../../public/images/getting-started-optimized.jpg";
import LoginModal from "@/components/global/login-modal";
import { useState } from "react";

type HeaderSection = {
  type: "header";
  title: string;
  subtitle: string;
  imageSrc: StaticImageData;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
};

type ParagraphSection = {
  type: "paragraph";
  content: string;
};

type ContentSection = {
  type: "section";
  title: string;
  paragraphs: string[];
  subsections?: {
    title: string;
    content: string;
  }[];
};

type _Section = HeaderSection | ParagraphSection | ContentSection;

export default function ArticlePage() {
  const contentSections = [
    {
      type: "header",
      title: "Guide",
      subtitle: "Getting started on Beautonomi",
      imageSrc: Image1,
      imageAlt: "Getting started on Beautonomi",
      imageWidth: 800,
      imageHeight: 500,
    },
    {
      type: "paragraph",
      content:
        "Whether you want to book beauty and wellness services or offer your skills as a provider, here’s how Beautonomi works for you. Let’s start with the basics. Welcome to the community!",
    },
    {
      type: "section",
      title: "The Beautonomi community",
      paragraphs: [
        "Beautonomi is a community built on trust and connection. We take the safety of our providers and customers seriously—providers meet quality standards, and profiles are verified. We use encrypted personal data and a trusted payment system, and our support team is here to help.",
      ],
      subsections: [
        {
          title: "Provider standards",
          content:
            "Standards for providers including listing accuracy, service quality, and communication.",
        },
        {
          title: "Customer standards",
          content:
            "Guidelines for customers including respect for providers, cancellation policies, and reviews.",
        },
      ],
    },
    {
      type: "section",
      title: "Getting set up",
      paragraphs: [
        "Creating an account is free and easy. We’ll need a few basic details and may ask for ID verification—which we don’t share with providers or anyone else. Then you’re ready to book or offer services!",
      ],
      subsections: [
        {
          title: "Creating an account",
          content: "Step-by-step instructions to create your account.",
        },
        {
          title: "How to submit your ID",
          content:
            "What info you’ll need to share and troubleshooting for uploading your government ID.",
        },
        {
          title: "Booking a service: what to do if you’re new",
          content:
            "How booking works on Beautonomi, how to confirm your appointment, and special offers.",
        },
      ],
    },
    {
      type: "section",
      title: "Provider basics",
      paragraphs: [
        "If you want to offer beauty or wellness services on Beautonomi, we’ll guide you step-by-step. Review our quality standards, create your profile and service listings, and submit for review.",
      ],
      subsections: [
        {
          title: "All the ways to provide on Beautonomi",
          content:
            "Details on offering in-person services, at-home or in-salon, and how payments work.",
        },
        {
          title: "Creating and managing your services",
          content:
            "What you need to set up your services, pricing, availability, and policies.",
        },
      ],
    },
  ];

  const relatedArticles = [
    {
      category: "Customer",
      title: "Create an account",
      description:
        "Signing up is free—use your email, phone number, or sign in with Google or Apple.",
    },
    {
      category: "Customer",
      title: "Booking a service: what to do if you’re new",
      description:
        "How booking works on Beautonomi, how to confirm your appointment, and offers from providers.",
    },
    {
      category: "Customer",
      title: "Paying for your booking",
      description:
        "When you’re charged, what happens if payment fails, and how refunds work.",
    },
  ];
  const [isModalOpen, setIsModalOpen] = useState(false); 

  const handleLoginClick = () => {
    setIsModalOpen(true); 
  };

  return (
    <div className="container">
      <nav className="mb-4 text-sm text-muted-foreground pt-10 px-10">
        <a href="#" className="hover:underline">
          Home
        </a>{" "}
        &gt;{" "}
        <a href="#" className="hover:underline">
          Guide
        </a>{" "}
        &gt; Getting started on Beautonomi
      </nav>
      <div className="flex md:flex-row flex-col w-full min-h-screen pt-4 pb-10 px-10">
        <div className="w-full max-w-4xl">
          <article>
            {contentSections.map((section, index) => {
              if (section.type === "header") {
                return (
                  <header key={index} className="mb-4">
                    <h2 className="text-sm font-normal  text-[#6A6a6a]">
                      {section.title}
                    </h2>
                    <p className="mb-3 text-[32px] font-light  text-secondary">
                      {section.subtitle}
                    </p>
                    {section.imageSrc && (
                      <Image
                        src={section.imageSrc}
                        alt=""
                        className="w-full h-auto"
                        width={section.imageWidth}
                        height={section.imageHeight}
                        style={{
                          aspectRatio: `${section.imageWidth}/${section.imageHeight}`,
                          objectFit: "cover",
                        }}
                      />
                    )}
                  </header>
                );
              }
              if (section.type === "paragraph") {
                return (
                  <section key={index} className="mb-6">
                    <p className="text-base font-light  text-secondary mb-11">
                      {section.content}
                    </p>
                  </section>
                );
              }
              if (section.type === "section") {
                return (
                  <section key={index} className="mb-6">
                    <h2 className="text-[22px] text-secondary font-normal  mb-3">
                      {section.title}
                    </h2>
                    {section?.paragraphs?.map((paragraph, idx) => (
                      <p
                        key={idx}
                        className="text-base font-light  text-secondary border-b-2 mb-6 pb-6"
                      >
                        {paragraph}
                      </p>
                    ))}
                    {section.subsections &&
                      section.subsections.map((subsection, idx) => (
                        <div key={idx} className="border-b mb-6 pb-6">
                          <h3 className="text-base font-normal  text-secondary underline">
                            {subsection.title}
                          </h3>
                          <p className="text-base font-light  text-secondary">
                            {subsection.content}
                          </p>
                        </div>
                      ))}
                  </section>
                );
              }
              return null;
            })}
            <section className="flex gap-5 items-center mb-10 border-b pb-12 pt-3">
              <h2 className="text-lg font-normal  text-secondary">
                Did this article help?
              </h2>
              <a
                href="#"
                className="text-secondary text-sm font-light  underline"
              >
                Yes
              </a>
              <a
                href="#"
                className="text-secondary text-sm font-light  underline"
              >
                No
              </a>
            </section>
            <section>
              <h2 className="text-secondary text-[22px] mb-5  font-normal">
                Related articles
              </h2>
              <ul className="space-y-4 ">
                {relatedArticles.map((article, index) => (
                  <li key={index} className="border-b pb-6 mb-6">
                    <h3 className="font-normal text-[#6a6a6a] text-sm mb-1 ">
                      {article.category}
                    </h3>
                    <a
                      href="#"
                      className="text-secondary font-light  text-base underline"
                    >
                      {article.title}
                    </a>
                    <p className="text-sm font-light  text-[#6a6a6a]">
                      {article.description}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </article>
        </div>
        <div className="w-full h-full max-w-72 p-4 mt-10 border rounded-md md:mt-10 md:ml-10">
          <h2 className="mb-3 text-base font-normal ">
            Get help with your bookings, account, and more.
          </h2>
          <Button className="w-full" variant="secondary" size="sm" onClick={handleLoginClick}>
            Log in or sign up
          </Button>
        </div>
      </div>
      <LoginModal open={isModalOpen} setOpen={setIsModalOpen} />

    </div>
  );
}
