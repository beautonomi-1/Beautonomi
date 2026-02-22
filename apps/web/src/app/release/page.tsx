import React from "react";
import BeautonomiIcons from "./components/beautonomi-icons";
import Imagination from "./components/imagination";
import ReleaseHero from "./components/release-hero";
import Category from "./components/Category";
import LimitedTime from "./components/limited-time";
import Latest from "./components/latest";
import Features from "./components/features";
import UserInteraction from "./components/user-interaction";
import HostUpdates from "./components/host-updates";

const page = () => {
  return (
    <div>
      <ReleaseHero />
      <BeautonomiIcons />
      <Imagination />
      <Category />
      <LimitedTime/>
      <Latest/>
      <Features/>
      <UserInteraction/>
      <HostUpdates/>
    </div>
  );
};

export default page;
