"use client"
import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import Link from 'next/link';
import Image from 'next/image'
import Image1 from "./../../../../public/images/33b80859-e87e-4c86-841c-645c786ba4c1.png";
import Image2 from "./../../../../public/images/059619e1-1751-42dd-84e4-50881483571a(1).png";
import RatingStars from "./../../../../public/images/16231558095-star-rating.svg";

// Type definitions
type Service = {
  title: string;
  duration: string;
  description: string;
  price: string;
  modalContent: {
    fullTitle: string;
    duration: string;
    gender: string;
    fullPrice: string;
    details: string[];
    additionalInfo: string;
  };
};

type ServiceCategory = {
  [key: string]: Service[];
};

const categories = [
  'Hair Services',
  'Beard Services',
  'Spa Treatments',
  'Packages',
  'Hair Services',
  'Beard Services',
  'Spa Treatments',
  'Packages',
  'Hair Services',
  'Beard Services',
  'Spa Treatments',
  'Packages',
  'Hair Services',
  'Beard Services',
  'Spa Treatments',
  'Packages'
];

const services: ServiceCategory = {
  'Hair Services': [
    {
      title: "Men's Haircut",
      duration: "45 mins",
      description: "Professional haircut tailored to your style preferences.",
      price: "AED 80",
      modalContent: {
        fullTitle: "Men's Signature Haircut",
        duration: "45 mins",
        gender: "Male only",
        fullPrice: "AED 80",
        details: [
          "Consultation with expert stylist",
          "Shampoo and conditioning",
          "Precision cut using advanced techniques",
          "Styling with premium products",
          "Hot towel refreshment"
        ],
        additionalInfo: "Upgrade to luxury hair products for AED 15"
      }
    },
    {
      title: "Hair Coloring",
      duration: "90 mins",
      description: "Full hair coloring service with premium dyes.",
      price: "AED 150",
      modalContent: {
        fullTitle: "Premium Hair Coloring Treatment",
        duration: "90 mins",
        gender: "All genders",
        fullPrice: "AED 150",
        details: [
          "Personalized color consultation",
          "Ammonia-free, high-quality dyes",
          "Deep conditioning treatment",
          "Color-preserving shampoo and styling",
          "Take-home care instructions"
        ],
        additionalInfo: "Add highlights or lowlights for AED 50"
      }
    }
  ],
  'Beard Services': [
    {
      title: "Beard Trim",
      duration: "30 mins",
      description: "Expert beard trimming and shaping.",
      price: "AED 50",
      modalContent: {
        fullTitle: "Precision Beard Trim and Style",
        duration: "30 mins",
        gender: "Male only",
        fullPrice: "AED 50",
        details: [
          "Beard wash with specialized cleanser",
          "Trim and shape with professional tools",
          "Hot towel treatment",
          "Beard oil application",
          "Styling with comb and brush"
        ],
        additionalInfo: "Add a mini facial for AED 30"
      }
    },
    {
      title: "Beard Dye",
      duration: "45 mins",
      description: "Beard coloring service for a fresh look.",
      price: "AED 70",
      modalContent: {
        fullTitle: "Custom Beard Dyeing Service",
        duration: "45 mins",
        gender: "Male only",
        fullPrice: "AED 70",
        details: [
          "Color consultation and patch test",
          "Gentle, beard-specific dyes",
          "Precision application",
          "Post-dye conditioning treatment",
          "Styling and grooming tips"
        ],
        additionalInfo: "Includes a complimentary beard balm"
      }
    }
  ],
  'Spa Treatments': [
    {
      title: "Relaxation Massage",
      duration: "60 mins",
      description: "Full-body massage to relieve stress and tension.",
      price: "AED 120",
      modalContent: {
        fullTitle: "Deep Relaxation Massage Therapy",
        duration: "60 mins",
        gender: "All genders",
        fullPrice: "AED 120",
        details: [
          "Customized pressure and techniques",
          "Aromatherapy options",
          "Hot stone add-on available",
          "Focus on stress relief and muscle relaxation",
          "Complimentary herbal tea post-treatment"
        ],
        additionalInfo: "Upgrade to 90 minutes for AED 40 more"
      }
    },
    {
      title: "Facial Treatment",
      duration: "45 mins",
      description: "Revitalizing facial for glowing skin.",
      price: "AED 90",
      modalContent: {
        fullTitle: "Advanced Skin Renewal Facial",
        duration: "45 mins",
        gender: "All genders",
        fullPrice: "AED 90",
        details: [
          "Skin analysis and consultation",
          "Deep cleansing and exfoliation",
          "Customized mask application",
          "Face, neck, and shoulder massage",
          "Hydrating serum and moisturizer"
        ],
        additionalInfo: "Add a collagen boost treatment for AED 25"
      }
    }
  ],
  'Packages': [
    {
      title: "Groom's Package",
      duration: "2 hrs",
      description: "Complete grooming package for special occasions.",
      price: "AED 200",
      modalContent: {
        fullTitle: "Luxury Groom's Preparation Package",
        duration: "2 hrs",
        gender: "Male only",
        fullPrice: "AED 200",
        details: [
          "Premium haircut and styling",
          "Beard trimming and grooming",
          "Relaxing facial treatment",
          "Hand and foot grooming",
          "Complimentary glass of champagne"
        ],
        additionalInfo: "Perfect for weddings and special events"
      }
    },
    {
      title: "Rejuvenation Package",
      duration: "3 hrs",
      description: "Full-body spa experience for ultimate relaxation.",
      price: "AED 300",
      modalContent: {
        fullTitle: "Total Body Rejuvenation Experience",
        duration: "3 hrs",
        gender: "All genders",
        fullPrice: "AED 300",
        details: [
          "Full-body massage (60 mins)",
          "Customized facial treatment",
          "Scalp massage and hair treatment",
          "Manicure and pedicure",
          "Aromatherapy session"
        ],
        additionalInfo: "Includes access to spa facilities for the day"
      }
    }
  ]
};

const ServiceCard = ({ service }: { service: Service }) => {
 
  return (
    <div className=''>
    <Dialog>
      <DialogTrigger asChild>
        <div className="p-4 rounded-lg transition-all duration-300 border w-full xl:min-w-[650px] mx-auto hover:bg-[#f7f7f7] bg-white border-gray-200">
          <div className="flex md:flex-row flex-col justify-between md:items-center md:gap-0 gap-4">
            <div>
              <h2 className="text-lg font-normal">{service.title}</h2>
              <p className="text-gray-500 text-sm font-light">{service.duration}</p>
              <p className="text-gray-600 mt-1 pr-8 text-sm font-light">{service.description}</p>
              <p className="text-base font-light mt-2">{service.price}</p>
            </div>
            <Link href={"/partner-profile/appointment"}>
              <button 
                className="text-secondary rounded-full border px-4 py-2 text-sm font-normal bg-white hover:bg-transparent transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("Book Now clicked for", service.title);
                  // Add your booking logic here
                }}
              >
                Book Now
              </button>
            </Link>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className='max-w-xl mx-auto pt-16'>
        <DialogHeader>
          <DialogTitle className="text-3xl font-bold mb-2">{service.modalContent.fullTitle}</DialogTitle>
          <DialogDescription className="text-gray-600 mb-2 font-light">{service.modalContent.duration} • {service.modalContent.gender}</DialogDescription>
        </DialogHeader>
        <div className="">
          <p className="text-2xl font-semibold mb-4">{service.modalContent.fullPrice}</p>
          
          <ul className="list-disc pl-5 mb-4">
            {service.modalContent.details.map((detail, index) => (
              <li className='text-black font-light' key={index}>{detail}</li>
            ))}
          </ul>
          
          <p className="text-sm text-gray-600 mb-6">{service.modalContent.additionalInfo}</p>
          <Link href="/booking">
          <button className="w-full bg-gray-900 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors">
            Confirm Booking
          </button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
    </div>
  );
};

const ServiceCategorySelector = () => {
  const [activeCategory, setActiveCategory] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [_TestimonialPopup, setTestimonialPopup] = useState(false);

  const handleShowMoreClick = () => {
    setTestimonialPopup(true);
  };
  useEffect(() => {
    categoryRefs.current = categoryRefs.current.slice(0, categories.length);
  }, []);

  const scroll = (direction: string) => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleCategoryClick = (index: number) => {
    setActiveCategory(index);
    if (categoryRefs.current[index] && scrollRef.current) {
      const container = scrollRef.current;
      const category = categoryRefs.current[index];
      const containerLeft = container.getBoundingClientRect().left;
      const categoryLeft = category!.getBoundingClientRect().left;
      const scrollLeft = container.scrollLeft;
      const targetScroll = scrollLeft + (categoryLeft - containerLeft);

      container.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="border p-4 flex justify-between items-center rounded-xl mb-10 cursor-pointer">
          <div onClick={handleShowMoreClick} className="hidden lg:hidden">
              <p className="text-[22px] font-light  text-secondary">
                5.0
              </p>
              <Image src={RatingStars} alt="Rating stars" className="w-20" />
            </div>
            <div
              className="flex items-center justify-center mb-2"
              onClick={handleShowMoreClick}
            >
              <div className="w-10 h-10">
                <Image src={Image2} alt="Image 2" className="object-cover" />
              </div>
              <p className="text-base sm:text-lg font-light text-center  text-secondary">
                Partner favourite
              </p>
              <div className="w-10 h-10">
                <Image src={Image1} alt="Image 1" className="object-cover" />
              </div>
            </div>
            <p
              className="hidden lg:block text-base font-light  text-secondary max-w-60"
              onClick={handleShowMoreClick}
            >
              One of the most loved homes on Beautonomi, according to guests
            </p>
            <div onClick={handleShowMoreClick} className=" block">
              <p className="text-[22px] font-light  text-secondary">
                5.0
              </p>
              <Image src={RatingStars} alt="Rating stars" className="w-20" />
            </div>
            <div onClick={handleShowMoreClick}>
              <p className="text-[22px] font-light  text-secondary">
                25
              </p>
              <p className="text-xs font-light  text-secondary underline">
                reviews
              </p>
            </div>
          </div>
      <div className="relative">
        <div className="flex items-center">
          <div 
            ref={scrollRef}
            className="flex space-x-2 overflow-x-auto scrollbar-hide mr-16 lg:mr-16"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {categories.map((category, index) => (
              <button
                key={index}
                //@ts-ignore 
                ref={el => categoryRefs.current[index] = el}
                className={`py-2 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  index === activeCategory
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
                onClick={() => handleCategoryClick(index)}
              >
                {category}
              </button>
            ))}
          </div>
          <button
            onClick={() => scroll('left')}
            className="absolute right-8   bg-white p-1 rounded-full shadow-md"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </button> 
          <button
            onClick={() => scroll('right')}
            className="absolute right-0  bg-white p-1 rounded-full shadow-md"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
      <div className="mt-8 space-y-4">
        <h2 className="text-2xl font-semibold mb-4">{categories[activeCategory]}</h2>
        {services[categories[activeCategory]].map((service, index) => (
          <ServiceCard key={index} service={service} />
        ))}
      </div>
    </div>
  );
};

export default ServiceCategorySelector;