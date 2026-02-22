import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export default function EmailAlert() {
  // Define an array of alert options
  const alertOptions = [
    { id: "press-releases", label: "Press Releases" },
    { id: "events", label: "Events" },
    { id: "presentations", label: "Presentations" },
    { id: "sec-filings", label: "SEC Filings" },
    { id: "stock-quote", label: "End of Day Stock Quote" }
  ];

  return (
    <div className="max-w-3xl mx-auto  pb-32 px-4">
      <h1 className="text-[32px] font-extrabold mb-6">Email Alerts and Contact Info</h1>
      <div className="flex-col md:flex-row flex justify-between">
        <div className=" mb-14 md:mb-0">
        <div className="border rounded-lg border-[#b0b0b0] text-base font-normal mb-7 p-1">
          <Input type="email" placeholder="Email Address" className="text-base font-light" />
        </div>
          <div className="space-y-3 mb-7">
            {alertOptions.map((option) => (
              <div key={option.id} className="flex items-center gap-3">
                <Checkbox id={option.id} className="border h-5 w-5 border-[#b0b0b0]"/>
                <label htmlFor={option.id} className="text-base font-light text-secondary">
                  {option.label}
                </label>
              </div>
            ))}
          </div>
          <Button variant="default">Submit</Button>
        </div>
        <div>
          <p className="mb-6 text-base font-light text-secondary max-w-[390px]">
            Questions for the Investor Relations department can be emailed to{" "}
            <a href="mailto:ir@Beautonomi.com" className="underline">
              ir@airbnb.com
            </a>{" "}
            or submitted by clicking on the button below.
          </p>
          <Button variant="destructive">Contact us</Button>
        </div>
      </div>
    </div>
  );
}
