import React from "react";

const Location = () => {
  const googleMapsUrl =
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d45645.06754230861!2d55.29782656000002!3d25.277519145000097!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3e5f68a44f5b6abf%3A0x4e1c4f2a4a006b9b!2sDowntown%20Dubai%2C%20Dubai%2C%20United%20Arab%20Emirates!5e0!3m2!1sen!2sus!4v1614646573418!5m2!1sen!2sus";

  return (
    <div className="container">
      <div className="border-b pb-20 mb-9">
      <div>
        <h2 className="text-[22px] font-normal  text-secondary mb-5">
          Where you’ll be
        </h2>
        <p className="text-base font-normal  text-secondary mb-6">
          Downtown Dubai, United Arab Emirates
        </p>
      </div>
      <div className="map-container">
        <iframe
          src={googleMapsUrl}
          width="100%"
          height="400"
          frameBorder="0"
          className="border-none outline-none"
          allowFullScreen
          aria-hidden="false"
          title="Google Map"
        ></iframe>
      </div>
      </div>
    </div>
  );
};

export default Location;
