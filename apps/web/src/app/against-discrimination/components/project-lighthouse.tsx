import Image from "next/image";
import Person from './../../../../public/images/people-icon.svg';
import Chart from './../../../../public/images/chart-icon.svg';
import SkipBack from './../../../../public/images/skip-back-icon.svg';

const changes = [
  {
    src: Person,
    title: "Using real data",
    description: "We examine how guests and Hosts use our platform. Statistical analyses help us find opportunities to build more equitable experiences in our community."
  },
  {
    src: Chart,
    title: "Protecting privacy",
    description: "We analyze trends in bulk and don’t associate perceived race information with specific people or accounts."
  },
  {
    src: SkipBack,
    title: "Constantly improving",
    description: "Our team is continuing to identify new ways to make Beautonomi fairer, more equitable, and more inclusive."
  }
];

export default function ProjectLighthouse() {
  return (
    <section className="container border-b ">
      <div className="mt-5 md:mt-14">
        <div className="text-left mb-4 md:mb-12">
          <h1 className="text-[22px] md:text-[38px] text-secondary font-normal mb-3 md:mb-6 ">Project Lighthouse</h1>
          <p className="text-sm md:text-[22px] text-secondary font-normal leading-[26px] mb-2 md:mb-[55px] ">
            Launched in 2020, Project Lighthouse helps uncover and address disparities in how people of color experience Beautonomi. We developed the initiative in partnership with Color Of Change—and with guidance from a number of civil rights and privacy organizations. 
            <a href="" className="font-normal text-black">Learn More</a>
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8 mb-6 md:mb-16">
          {changes.map((change, index) => (
            <div className="flex md:block gap-3 text-left" key={index}>
              <Image 
                src={change.src} 
                alt={change.title} 
                className="w-6 md:w-8 h-6 md:h-8 mb-5" 
              />
              <div>
              <h2 className="text-sm md:text-[26px] font-normal mb-0 md:mb-4 ">{change.title}</h2>
              <p className="text-sm md:text-base font-normal text-destructive leading-5 ">{change.description}</p>
            </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
