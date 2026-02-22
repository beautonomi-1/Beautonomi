import React from "react";
import User from "./component/user";
import HostPageNavbar from "./component/hostpage-navbar";

const page = () => {
  return (
    <div>
      <HostPageNavbar />
      <User />
    </div>
  );
};

export default page;