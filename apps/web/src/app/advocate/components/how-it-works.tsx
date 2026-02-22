import React from 'react';

const steps = [
  {
    step: 'STEP ONE',
    title: 'Get approved',
    description: 'Join our Superhost Ambassadors. Apply today.',
  },
  {
    step: 'STEP TWO',
    title: 'Get connected',
    description: "We'll match you with new Hosts as they get started with Beautonomi Setup. You'll have access to tools and resources that can help you answer their questions.",
  },
  {
    step: 'STEP THREE',
    title: 'Get paid',
    description: 'When a new Beauty Partner you are connected with completes their first reservation, you’ll earn a cash reward.',
  },
];

const HowItWorks = () => {
  return (
    <div className='container mx-auto'>
        <div className='border-none lg:border-b pb-0 lg:pb-24 mb-14 lg:mb-24'>
      <div className='grid grid-cols-1 lg:grid-cols-4 gap-8 max-w-xl md:max-w-md lg:max-w-full mx-auto'>
        <div className='-mb-3 lg:mb-8 '>
          <h2 className='text-[32px] font-bold text-secondary'>
            How the program works
          </h2>
        </div>
        {steps.map(({ step, title, description }, index) => (
          <div key={index} className='flex flex-col  mb-8'>
            <span className='text-sm font-bold text-secondary mb-4'>{step}</span>
            <h3 className='text-[32px] font-bold text-secondary mb-3'>{title}</h3>
            <p className='text-lg font-normal  text-secondary'>{description}</p>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
};

export default HowItWorks;
