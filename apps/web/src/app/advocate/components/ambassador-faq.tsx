"use client";
import React, { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
}

const faqItems: FAQItem[] = [
  {
    question: "What are the benefits of becoming a Superhost Ambassador?",
    answer:
      "As a Superhost Ambassador, you'll receive exclusive tools, custom links, and be part of a community of experienced Hosts.",
  },
  {
    question: "How much can I earn?",
    answer:
      "Earnings vary depending on your activity and engagement in the program. The more you participate, the more you can earn.",
  },
  {
    question:
      "I’m interested in sharing my beauty partner best practices. Are you able to match me with new Hosts?",
    answer:
      "Yes, we can match you with new Hosts who can benefit from your experience.",
  },
  {
    question: "How will Beautonomi decide which new Hosts to match me with?",
    answer:
      "Beautonomi matches new Hosts based on their needs and your expertise to ensure a good fit.",
  },
  {
    question:
      "Are there any eligibility requirements to become a Superhost Ambassador?",
    answer:
      "Yes, you need to meet certain criteria including being a Superhost and having a strong beauty partner history.",
  },
  {
    question: "Where can I read the full terms?",
    answer:
      "The full terms can be found on the Beautonomi website under the Superhost Ambassador Program section.",
  },
  {
    question:
      "What's the difference between the Referral Program and the Superhost Ambassador Program?",
    answer:
      "The Referral Program rewards you for referring new Hosts, while the Superhost Ambassador Program offers additional support and tools to help you assist new Hosts.",
  },
];

const AmbassadorFaq: React.FC = () => {
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null);

  const handleClick = (index: number) => {
    setSelectedQuestion(index === selectedQuestion ? null : index);
  };

  return (
    <div className="container">
      <div className="mb-24 max-w-xl md:max-w-md lg:max-w-full mx-auto">
        <h2 className="text-[32px] font-bold text-secondary mb-5">
          Frequently asked questions
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 ">
          {faqItems.map((item, index) => (
            <p
              key={index}
              className="text-base font-normal  text-secondary underline cursor-pointer"
              onClick={() => handleClick(index)}
            >
              {item.question}
            </p>
          ))}
        </div>
        {selectedQuestion !== null && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white text-secondary p-6 rounded-lg w-1/3 relative">
              <div className="flex items-center gap-4 border-b mb-5 pb-5">
                <button
                  className="text-2xl font-bold text-secondary"
                  onClick={() => setSelectedQuestion(null)}
                >
                  ×
                </button>
                <h3 className="text-base text-center font-bold text-secondary">
                  {faqItems[selectedQuestion].question}
                </h3>
              </div>
              <p className="text-base font-normal  text-secondary">
                {faqItems[selectedQuestion].answer}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AmbassadorFaq;
