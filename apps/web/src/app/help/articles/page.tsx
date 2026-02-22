'use client'
import { Button } from "@/components/ui/button";
import Image, { StaticImageData } from "next/image";
import Image1 from "./../../../../public/images/getting-started-on-airbnb-optimized.jpg";
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
        "Whether you want to book a dream stay away from home or Beauty Partner an Beautonomi Experience in your own backyard, here’s how Beautonomi works for you—as a Beauty Partner or a guest. Let’s start with the basics and go from there. Welcome to the community!",
    },
    {
      type: "section",
      title: "The Beautonomi community",
      paragraphs: [
        "Beautonomi is a community based on connection and belonging. We take the safety of our Hosts and guests very seriously—Hosts must meet and maintain quality standards, and all personal profiles and listings are verified. We work to keep everyone safe on our site and app with encrypted personal data and a trusted payment system. Plus, we have a 24/7 community support team ready to answer any of your questions.",
      ],
      subsections: [
        {
          title: "Host Reliability Standards",
          content:
            "Standards for Hosts of stays including more about listing accuracy, cleanliness, and communication.",
        },
        {
          title: "Guest Reliability Standards",
          content:
            "Standards for guests on stays including more about respect for the community, the space, and the house rules.",
        },
      ],
    },
    {
      type: "section",
      title: "Getting set up",
      paragraphs: [
        "Creating an account is free and easy! We’ll need to know a few basic details and then you’ll be asked to submit your government ID—which we don’t share with Hosts or anyone else. Now you’re ready to book!",
      ],
      subsections: [
        {
          title: "Creating an account",
          content: "Find easy-to-follow instructions to create an account.",
        },
        {
          title: "How to submit your ID",
          content:
            "Details what info you’ll need to share, plus troubleshooting when you’re uploading your government ID.",
        },
        {
          title: "Booking a trip: What to do if you’re new",
          content:
            "Learn about Beautonomi booking process, how to confirm your reservation, special offers, and more.",
        },
      ],
    },
    {
      type: "section",
      title: "Beauty partner basics",
      paragraphs: [
        "If you’re interested in beauty partner your space, we’ll guide you through the process step-by-step. To Beauty Partner Experiences, just review our quality standards, create a listing, and submit your compelling idea (through a form or a short video if you’re submitting an online experience) for review. ",
      ],
      subsections: [
        {
          title: "All the ways to Beauty Partner on Beautonomi",
          content:
            "Details and all the fine print about beauty partner a place to stay or an Beautonomi experience.",
        },
        {
          title: "Creating new Experiences",
          content:
            "Find the basic info you’ll need to have when submitting an Experience.",
        },
      ],
    },
  ];

  const relatedArticles = [
    {
      category: "Guest",
      title: "Create an account",
      description:
        "Signing up is free—use your email address, phone number, Facebook or Google account, or Apple ID.",
    },
    {
      category: "Guest",
      title: "Booking a trip: what to do if you’re new",
      description:
        "Learn about Beautonomi booking process, how to confirm your reservation, special offers direct from a Host, and more.",
    },
    {
      title: "Paying for your trip",
      description:
        "When are you charged for a reservation? What do you do if you can’t complete your transaction? Let’s break down the financials and get answe…",
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
            Get help with your reservations, account, and more.
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
