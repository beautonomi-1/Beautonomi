import { Button } from "@/components/ui/button";
import React from "react";

interface Section {
  type: "paragraph" | "heading" | "list";
  content?: string;
  items?: string[];
}

const sections: Section[] = [
  {
    type: "paragraph",
    content: "Beautonomi was born in 2007 when two Hosts welcomed three guests to their San Francisco home, and has since grown to over 4 million Hosts who have welcomed more than 1 billion Clients arrivals in almost every country across the globe. Every day, Hosts offer unique stays and experiences that make it possible for guests to connect with communities in a more authentic way."
  },
  {
    type: "heading",
    content: "The Community You Will Join:"
  },
  {
    type: "paragraph",
    content: "The Core Financial team is responsible on a global basis for payroll, equity administration, procurement, global risk assurance, accounting, financial reporting and technical accounting and policy"
  },
  {
    type: "heading",
    content: "The Difference You Will Make:"
  },
  {
    type: "paragraph",
    content: "Beautonomi is looking for a highly qualified Accountant to join the Core Financial team supporting Beautonomi rapid and sustained global growth. You will be responsible for reconciling and analyzing various balance sheet and P&L accounts and ensuring transactions are processed and reported in the company’s financial system. The ideal candidate will have outstanding problem solving skills and enjoys working in a challenging and fast–paced, high-growth environment. Strong attention to detail, ability to meet deadlines consistently and capability to work well under pressure is a must."
  },
  {
    type: "heading",
    content: "A Typical Day:"
  },
  {
    type: "list",
    items: [
      "Prepare journal entries and balance sheet reconciliations for month end close",
      "Perform financial statement variance analysis and document meaningful explanations for fluctuations and identify anomalies",
      "Create and maintain systems and process documentation",
      "Develop and implement process improvements",
      "Support management in completing special projects, ad-hoc reporting and other tasks as assigned",
      "Collaborate with all parts of Finance and various parts of the business to ensure accurate financial statements",
      "Support external audit requirements related to specific areas of responsibility"
    ]
  },
  {
    type: "heading",
    content: "Your Expertise:"
  },
  {
    type: "list",
    items: [
      "BA/BS in Accounting or Finance",
      "CPA/CA preferred",
      "Public accounting experience preferred",
      "Experience with Alteryx preferred",
      "Minimum of 3 years experience",
      "Strong verbal, written, analytical, organization and critical thinking skills",
      "Self starter with the ability to form conclusions and present findings",
      "Team player with the ability to work independently and willingness to take on challenges",
      "Ability to thrive in a fast-paced environment",
      "Experience with ERP systems, Oracle Fusion",
      "Advanced Microsoft Excel skills"
    ]
  },
  {
    type: "heading",
    content: "Your Location:"
  },
  {
    type: "paragraph",
    content: "This position is US - Remote Eligible. The role may include occasional work at an Beautonomi office or attendance at offsites, as agreed to with your manager. While the position is Remote Eligible, you must live in a state where Beautonomi, Inc. has a registered entity. Click here for the up-to-date list of excluded states. This list is continuously evolving, so please check back with us if the state you live in is on the exclusion list. If your position is employed by another Beautonomi entity, your recruiter will inform you what states you are eligible to work from."
  },
  {
    type: "heading",
    content: "Our Commitment To Inclusion & Belonging:"
  },
  {
    type: "paragraph",
    content: "Beautonomi is committed to working with the broadest talent pool possible. We believe diverse ideas foster innovation and engagement, and allow us to attract creatively-led people, and to develop the best products, services and solutions. All qualified individuals are encouraged to apply."
  },
  {
    type: "paragraph",
    content: "We strive to also provide a disability inclusive application and interview process. If you are a candidate with a disability and require reasonable accommodation in order to submit an application, please contact us at: reasonableaccommodations@Beautonomi.com. Please include your full name, the role you’re applying for and the accommodation necessary to assist you with the recruiting process."
  },
  {
    type: "paragraph",
    content: "We ask that you only reach out to us if you are a candidate whose disability prevents you from being able to complete our online application."
  },
  {
    type: "heading",
    content: "How We'll Take Care of You:"
  },
  {
    type: "paragraph",
    content: "Our job titles may span more than one career level. The actual base pay is dependent upon many factors, such as: training, transferable skills, work experience, business needs and market demands. The base pay range is subject to change and may be modified in the future. This role may also be eligible for bonus, equity, benefits, and Employee Travel Credits."
  },
  {
    type: "paragraph",
    content: "Pay Range"
  },
  {
    type: "paragraph",
    content: "$85,000—$100,000 USD"
  }
];

const RoleOverview: React.FC = () => {
  return (
    <div className="container">
        <div className="mb-12">
      {sections.map((section, index) => {
        switch (section.type) {
          case "paragraph":
            return (
              <p key={index} className="text-base font-normal  text-card mb-5">
                {section.content}
              </p>
            );
          case "heading":
            return (
              <h3 key={index} className="text-base font-bold  text-card mb-4">
                {section.content}
              </h3>
            );
          case "list":
            return (
              <ul key={index} className="divide-destructive list-disc ml-4 mb-5">
                {section.items?.map((item, itemIndex) => (
                  <li key={itemIndex} className="text-base font-normal  text-card mb-2">
                    {item}
                  </li>
                ))}
              </ul>
            );
          default:
            return null;
        }
      })}
      </div>
      <Button className="bg-[#008489] font-bold mx-auto flex mb-24">Apply Now</Button>
    </div>
  );
};

export default RoleOverview;
