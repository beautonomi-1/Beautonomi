import React from "react";
import User from "./component/user";
import PartnerOwnerNavbar from "./component/partner-owner-navbar";

const page = () => {
  return (
    <div>
      <PartnerOwnerNavbar />
      <User />
    </div>
  );
};

export default page;