import React from "react";
import Image from "next/image";
import Twitter from "./../../../../public/images/twitter-icon.svg";
import Pinterest from "./../../../../public/images/pinterest-icon.svg";
import Instagram from "./../../../../public/images/instagram-icon.svg";
import Tiktok from "./../../../../public/images/tiktok-icon.svg";

const socialMedia = [
  { src: Twitter, alt: "Twitter", link: "https://twitter.com/airbnb" },
  {
    src: Pinterest,
    alt: "Pinterest",
    link: "https://www.pinterest.com/airbnb",
  },
  {
    src: Tiktok,
    alt: "Titktok",
    link: "https://www.tiktok.com/company/airbnb",
  },
  { src: Instagram, alt: "Link", link: " https://instagram.com/airbnb" },
];
const ContactInfo = () => {
  return (
    <div className="container">
      <h2 className="font-normal  text-[22px] text-secondary text-center mb-6">
        {" "}
        Follow Beautonomi for news and travel inspiration{" "}
      </h2>
      <div className="flex gap-4 mb-12 md:mb-16 justify-center">
              {socialMedia.map((social, index) => (
                <a
                  key={index}
                  href={social.link} 
                  target="_blank"
                  rel="noopener noreferrer"
                >
                    <div className="border rounded-full p-2 border-secondary">
                  <Image
                    src={social.src}
                    alt={social.alt}
                    width={20}
                    height={20}                    
                  />
            </div>
                </a>
              ))}
            </div>
    </div>
  );
};

export default ContactInfo;
