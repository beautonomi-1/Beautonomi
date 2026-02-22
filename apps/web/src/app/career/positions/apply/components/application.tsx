import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import Link from "next/link";
import React from "react";

const inputFields = [
  { id: "firstName", label: "First Name *", type: "text" },
  { id: "lastName", label: "Last Name *", type: "text" },
  { id: "email", label: "Email *", type: "email" },
  { id: "phone", label: "Phone *", type: "tel" },
  { id: "address", label: "Location (City) *", type: "text" },
];

const checkboxOptions = [
  { id: "decline", label: "I decline to self-identify" },
];
const raceDefinitions = [
  {
    title: "Hispanic or Latino",
    description:
      "A person of Cuban, Mexican, Puerto Rican, South or Central American, or other Spanish culture or origin regardless of race.",
  },
  {
    title: "White (Not Hispanic or Latino)",
    description:
      "A person having origins in any of the original peoples of Europe, the Middle East, or North Africa.",
  },
  {
    title: "Black or African American (Not Hispanic or Latino)",
    description:
      "A person having origins in any of the black racial groups of Africa.",
  },
  {
    title: "Asian (Not Hispanic or Latino)",
    description:
      "A person having origins in any of the original peoples of the Far East, Southeast Asia, or the Indian Subcontinent including, for example, Cambodia, China, India, Japan, Korea, Malaysia, Pakistan, the Philippine Islands, Thailand, and Vietnam.",
  },
  {
    title: "Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)",
    description:
      "A person having origins in any of the peoples of Hawaii, Guam, Samoa, or other Pacific Islands.",
  },
  {
    title: "American Indian or Alaska Native (Not Hispanic or Latino)",
    description:
      "A person having origins in any of the original peoples of North and South America (including Central America) and who maintain tribal affiliation or community attachment.",
  },
  {
    title: "Two or More Races (Not Hispanic or Latino)",
    description:
      "Persons who identify with two or more race categories named above.",
  },
];
const Application = () => {
  return (
    <div className="flex flex-col p-4">
      {inputFields.map((field, index) => (
        <div
          key={field.id}
          className={`mb-${index === inputFields.length - 1 ? "3" : "9"}`}
        >
          <div className="mb-3">
            <Label
              className="text-[19px] font-normal  text-card"
              htmlFor={field.id}
            >
              {field.label}
            </Label>
          </div>
          <div className="border py-1">
            <Input id={field.id} type={field.type} />
          </div>
        </div>
      ))}
      <Link href="/" className="text-[#008489] hover:underline">
        Locate me
      </Link>

      <div className="border-b mb-6 pb-6">
        <div className="flex gap-4 items-center mb-9">
          <p className="text-[19px] font-normal  text-card">
            Resume/CV *
          </p>
          <p className="text-[19px] font-normal  text-card">
            (File types:pdf, doc, docx, txt, rtf)
          </p>
        </div>
        <div className="flex gap-4 items-center">
          <p className="text-[19px] font-normal  text-card">
            Cover Letter *
          </p>
          <p className="text-[19px] font-normal  text-card">
            (File types:pdf, doc, docx, txt, rtf)
          </p>
        </div>
      </div>

      <div className="mb-6">
        <Label
          className="text-[19px] font-normal  text-card mb-3"
          htmlFor="additionalInfo"
        >
          LinkedIn Profile *
        </Label>
        <div className="border py-1">
          <Input id="additionalInfo" type="text" />
        </div>
      </div>
      <div className="mb-9">
        <div className="mb-2">
          <Label
            className="text-[19px] font-normal  text-card mb-3"
            htmlFor="position"
          >
            How did you hear about this job *
          </Label>
        </div>
        <Select>
          <SelectTrigger className="w-full border py-1 text-[19px] text-card font-normal  max-w-60 outline-none">
            <SelectValue placeholder="Please select" />
          </SelectTrigger>
          <SelectContent className="outline-none py-1 bg-primary text-[19px] text-card">
            <SelectItem value="company">
              Company Website (Beautonomi Careers)
            </SelectItem>
            <SelectItem value="third-party">
              Third-party website or search engine
            </SelectItem>
            <SelectItem value="social media">
              Social Media (Facebook, Instagram, LinkedIn, Twitter)
            </SelectItem>
            <SelectItem value="tech">Beautonomi Tech blog post</SelectItem>
            <SelectItem value="airbnb">Beautonomi.io</SelectItem>
            <SelectItem value="open source">Beautonomi Open Source</SelectItem>
            <SelectItem value="event">
              Event (Tech Talk, Meetup, conference)
            </SelectItem>
            <SelectItem value="employee">Beautonomi Employee</SelectItem>
            <SelectItem value="family">Friend, family, colleague</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mb-6">
        <div className="mb-2">
          <Label
            className="text-[19px] font-normal  text-card mb-3"
            htmlFor="experience"
          >
            Will you know or in the future require visa sponsorship *
          </Label>
        </div>
        <Select>
          <SelectTrigger className="w-full border py-1 text-[19px] text-card font-normal  max-w-60 outline-none">
            <SelectValue placeholder="Please select" />
          </SelectTrigger>
          <SelectContent className="outline-none py-1 bg-primary text-[19px] text-card">
            <SelectItem value="yes">
              Yes - I will require visa sponsorship.
            </SelectItem>
            <SelectItem value="no">
              No - I do not require visa sponsorship.
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <h2 className="text-[19px] font-normal  text-card mb-5">
          U.S. Equal Opportunity Employment Information (Completion is
          voluntary)
        </h2>
        <p className="text-[15px] font-normal  text-card mb-7">
       {`   Beautonomi values diversity, inclusion & belonging for all, and is proud
          to be an Equal Employment Opportunity employer. It's important to us
          that our workplace empowers people of all backgrounds, identities, and
          experiences to feel respected, valued, and able to contribute at the
          highest level.`}
        </p>
        <p className="text-[15px] font-normal  text-card mb-5">
          Self-identification is an important tool that provides an avenue for
          candidates to share their demographic information so that Beautonomi can
          evaluate and implement strategies to build a culture that supports our
          community. As part of these efforts, we invite candidates to
          self-identify as to the categories below. Submitting this information
          is entirely voluntary and any information provided will be maintained
          confidentially and will not be used in making hiring decisions.
        </p>
        {checkboxOptions.map((option) => (
          <div key={option.id} className="flex items-center mb-8 gap-4">
            <Checkbox
              id={option.id}
              className="bg-blue-500 border-card h-5 w-5 border-2"
            />
            <Label
              htmlFor={option.id}
              className=" text-[19px] font-normal  text-card"
            >
              {option.label}
            </Label>
          </div>
        ))}
      </div>
      <div className="mb-6">
        <div className="mb-2">
          <Label
            className="text-[19px] font-normal  text-card mb-3"
            htmlFor="experience"
          >
            Gender *
          </Label>
        </div>
        <p className="text-[15px] text-card font-normal  mb-4">
          Please identify your gender
        </p>
        <Select>
          <SelectTrigger className="w-full border py-1 text-[19px] text-card font-normal  max-w-60 outline-none">
            <SelectValue placeholder="Please select" />
          </SelectTrigger>
          <SelectContent className="outline-none py-1 bg-primary text-[19px] text-card">
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
            <SelectItem value="other">Other</SelectItem>
            <SelectItem value="decline">Decline To Self Identify</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <p className="text-[19px] font-normal  text-card mb-3">
          Race:
        </p>
        <p className="text-[15px] text-card font-normal  mb-4">
          Please identify your race <br />
          <br />
          <strong>Race & Ethnicity Definitions:</strong>
        </p>
        {raceDefinitions.map(({ title, description }) => (
          <p
            key={title}
            className="text-[15px] text-card font-normal  mb-4"
          >
            <strong>{title}:</strong> {description}
          </p>
        ))}
      </div>
      <div className="mb-6">
        <Select>
          <SelectTrigger className="w-full border py-1 text-[19px] text-card font-normal  max-w-60 outline-none">
            <SelectValue placeholder="Please select" />
          </SelectTrigger>
          <SelectContent className="outline-none py-1 bg-primary text-[19px] text-card">
            <SelectItem value="american">
              American Indian or Alaskan Native
            </SelectItem>
            <SelectItem value="asian">Asian</SelectItem>
            <SelectItem value="african">Black or African American</SelectItem>
            <SelectItem value="hispanic or latino">
              Hispanic or Latino
            </SelectItem>
            <SelectItem value="white">White</SelectItem>
            <SelectItem value="native">
              Native Hawaiian or Other Pacific Islander
            </SelectItem>
            <SelectItem value="two or more">Two or More Races</SelectItem>
            <SelectItem value="decline">Decline To Self Identify</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mb-6">
        <div className="mb-4">
          <Label
            className="text-[19px] font-normal  text-card "
            htmlFor="experience"
          >
            Veteran Status:
          </Label>
        </div>
        <p className="text-[15px] text-card font-normal  mb-4">
          Please identify your veteran status.
        </p>
        <Select>
          <SelectTrigger className="w-full border py-1 text-[19px] text-card font-normal  max-w-60 outline-none">
            <SelectValue placeholder="Please select" />
          </SelectTrigger>
          <SelectContent className="outline-none py-1 bg-primary text-[19px] text-card">
            <SelectItem value="protected veteran">
              I am a protected veteran
            </SelectItem>
            <SelectItem value="not protected veteran">
              I am not a protected veteran
            </SelectItem>
            <SelectItem value="decline">Decline To Self Identify</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default Application;
