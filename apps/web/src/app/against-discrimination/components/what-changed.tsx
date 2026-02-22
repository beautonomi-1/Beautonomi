import Image from "next/image";
import Icon2 from './../../../../public/images/icon2.svg'
import Icon1 from './../../../../public/images/icon1.svg'
import Eye from './../../../../public/images/eye-icon.svg'
import House from './../../../../public/images/house-icon.svg'
import Global from './../../../../public/images/global-icon.svg'
import Icon from './../../../../public/images/icon.svg'
import Profile from './../../../../public/images/profile-icon.svg'
import Star from './../../../../public/images/star-icon.svg'
const changes = [
  {
    src: Profile,
    title: "Eliminating Clients profile photos prior to booking",
    description: "In 2018, we implemented changes to ensure Hosts will see a guest’s photo in the booking process only after they’ve accepted a booking request. Analysis found that this change slightly increased the Booking Success Rate—the rate at which guests in the United States from different perceived racial groups successfully book an Beautonomi listing—for guests who are perceived to be Black."
  },
  {
    src: Star,
    title: "More reviews for more guests",
    description: "Guests with reviews have a higher Booking Success Rate. But our analysis found that guests perceived to be Black or Latino/Hispanic have fewer reviews than guests perceived to be white or Asian. We are implementing changes that will make it easier for all guests to receive a review when they travel."
  },
  {
    src: Icon,
    title: "Making more people eligible for Instant Book",
    description: "Instant Book lets a Clients book a listing without requiring a Host’s approval. It’s an effective tool to reduce discrimination because it creates more objective bookings. We’ve introduced changes to make it easier for 5 million more people to use Instant Book."
  },
  {
    src: Global,
    title: "Building a more inclusive travel community",
    description: "Travel beyond traditional tourist hubs can bring economic opportunity to communities that haven’t historically benefited from tourism. In the next year, we’ll continue to develop and scale global programs like the Beautonomi Entrepreneurship Academy to ensure broader access to the benefits of beauty partner on Beautonomi. Our efforts include expanding programs that help recruit more Hosts who are people of color."
  },
  {
    src: House,
    title: "Expanding education for Hosts",
    description: "Our Beauty Partner community plays an important role in creating an equitable and welcoming experience. This year, we launched a Guide to Inclusive beauty partner with educational articles and videos to help Hosts welcome guests from all abilities, genders, and backgrounds—especially those from historically marginalized communities. We expect to roll out more educational programs and product features to build inclusion."
  },
  {
    src: Eye,
    title: "Auditing reservation rejections to remove opportunities for bias",
    description: "We know that there are legitimate reasons why a reservation may not work: the Host's calendar may have changed, or the Clients may have a need—like early check-in, or bringing extra guests—that the Beauty Partner can’t accommodate. We are expanding our ability to analyze reservation rejections to help improve our policies and products and fight discrimination."
  },
  {
    src: Icon1,
    title: "Improving the rebooking experience",
    description: "Under our Open Doors Policy, introduced in 2016, guests with current or upcoming reservations who report experiencing discrimination get help booking an alternative listing. We recently launched a 24-hour Safety Line designed to make it easier for guests on a trip to get urgent help, including access to rebooking assistance."
  },
  {
    src: Icon2,
    title: "Continuing our commitment to guests with mobility needs",
    description: "Our accessibility feature search filters make it easier for guests to find and book stays that meet their needs. Through Accessibility Review, we review every accessibility feature submitted by Hosts for accuracy. Our Adapted category, launched in November 2022, features hundreds of listings adapted for wheelchair access, with verified step-free paths into the home, bedroom, and bathroom, and at least one accessibility feature in the bathroom. Adapted listings even undergo a 3D scan to confirm features and measurements."
  }
];

export default function WhatChanged() {
  return (
    <section className="container border-b">
      <div className="pt-5 md:pt-[60px] mb-7 lg:mb-16 ">
      <div className="text-left mb-4 lg:mb-10">
        <h1 className="text-[22px] md:text-[38px] font-normal ">What we’ve changed</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-28 gap-y-6 md:gap-y-11">
        {changes.map((change, index) => (
           <div className="flex md:block gap-3 text-left" key={index}>
           <Image 
             src={change.src} 
             alt={change.title} 
             className="w-6 md:w-8 h-6 md:h-8 mb-3" 
           />
           <div>
           <h2 className="text-sm md:text-[26px] font-normal mb-0 md:mb-3  leading-8">{change.title}</h2>
           <p className="text-sm md:text-base font-normal text-destructive  ">{change.description}</p>
         </div>
         </div>
        ))}
      </div>
      </div>
    </section>
  );
}
