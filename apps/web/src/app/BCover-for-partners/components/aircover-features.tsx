const features = [
  {
    title: "Guest identity verification",
    description: "Our comprehensive verification system checks details such as name, address, government ID, and more to confirm the identity of guests who book on Beautonomi."
  },
  {
    title: "Reservation screening",
    description: "Our proprietary technology analyzes hundreds of factors in each reservation and blocks certain bookings that show a high risk for disruptive parties and property damage."
  },
  {
    title: "$3M damage protection",
    description: "If guests do not pay for the damage caused to your home and belongings, Beauty Partner damage protection is in place to help reimburse costs up to $3M USD, including these specialized protections:",
    subFeatures: [
      { title: "Art & valuables", description: "Get reimbursed for damaged art or valuables." },
      { title: "Auto & boat", description: "Get reimbursed for damage to cars, boats, and other watercraft that you park or store at your home." },
      { title: "Pet damage", description: "Get reimbursed for damage caused by a guest’s pet." },
      { title: "Income loss", description: "If you have to cancel Beautonomi bookings due to Clients damage, you'll be compensated for the lost income." },
      { title: "Deep cleaning", description: "Get reimbursed for extra cleaning services required to remove stains and smoke odors." }
    ]
  },
  {
    title: "Deep cleaning",
    description: "Get reimbursed for extra cleaning services required to remove stains and smoke odors."
  },
  {
    title: "$1M liability insurance",
    description: "Protection in the rare event that a Clients gets hurt or their belongings are damaged or stolen."
  },
  {
    title: "24-hour safety line",
    description: "If you ever feel unsafe, our app provides one-tap access to specially-trained safety agents, day or night."
  }
];

export default function AirCoverFeatures() {
  return (
    <div className="bg-primary mb-10">
      <div className="max-w-4xl mx-auto p-6 space-y-8 border-[#dddddd] border-t-2">
        {features.map((feature, index) => (
          <div key={index} className="mb-3 border-[#dddddd] border-b-2 pb-8">
            <h2 className="text-[22px] lg:text-[26px] font-normal  text-secondary">{feature.title}</h2>
            <p className="text-base sm:text-lg font-light  text-destructive">{feature.description}</p>
            {feature.subFeatures && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mt-11">
                {feature.subFeatures.map((subFeature, subIndex) => (
                  <div 
                    key={subIndex} 
                    className={`mb-3 ${subIndex !== feature.subFeatures.length - 1 ? 'border-b pb-8' : ''}`}
                  >
                    <h3 className="text-lg lg:text-[22px] font-normal  text-secondary">{subFeature.title}</h3>
                    <p className="text-base font-light  text-destructive">{subFeature.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="text-center">
          <p className="text-base font-light  text-destructive">
            Find complete details on {" "}
            <a href="/BCover-for-partners" className="underline text-black">
              how BCover for Partners protects you
            </a>{" "}
            and any exclusions that apply.
          </p>
        </div>
      </div>
    </div>
  );
}
