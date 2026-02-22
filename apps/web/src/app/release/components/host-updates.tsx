import { Button } from "@/components/ui/button";
import React from "react";

const HostUpdates = () => {
  return (
    <div className="bg-primary pb-32">
      <div className="container text-center">
        <div className="">
          <h2 className="text-[68px] font-bold Beautonomi-bold text-secondary mb-3">
            Plus, big news for Hosts
          </h2>
          <p className="text-[26px] font-light  text-destructive max-w-xl mx-auto mb-9">
            There’s an all-new Messages tab, updates to the earnings dashboard,
            and more.
          </p>
          <Button size="rounded" variant="default">
           {` See what's new for Hosts`}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HostUpdates;
