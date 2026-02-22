import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import ButtonPrimary from "@/components/global/button";

const tableData = [
  {
    title: "Client identity verification",
    description:
      "Our comprehensive verification system checks details such as name, address, government ID, and more to confirm the identity of clients who book through Beautonomi.",
    beautonomi: true,
    competitors: true,
  },
  {
    title: "Appointment screening",
    description:
      "Our proprietary technology analyzes hundreds of factors in each appointment and blocks certain bookings that show a high risk for disruptive behavior.",
    beautonomi: true,
    competitors: false,
  },
  {
    title: "Service equipment protection",
    beautonomi: true,
    competitors: false,
  },
  {
    title: "Product inventory protection",
    beautonomi: true,
    competitors: false,
  },
  {
    title: "Service disruption coverage",
    beautonomi: true,
    competitors: false,
  },
  {
    title: "Revenue loss protection",
    beautonomi: true,
    competitors: false,
  },
  {
    title: "Deep cleaning",
    beautonomi: true,
    competitors: false,
  },
  {
    title: "24-hour safety line",
    description:
      "If you ever feel unsafe, our app provides one-tap access to specially-trained safety agents, available around the clock.",
    beautonomi: true,
    competitors: false,
  },
];

export default function AirCoverTable() {
  return (
    <div className="container">
      <div className="">
        <header className="text-start lg:text-center">
          <h2 className="text-[26px] text-4xl lg:text-5xl font-normal lg:font-semibold  lg:Beautonomi-semibold text-secondary mb-5 md:mb-8 lg:mb-14">
            Beautonomi it with top-to-bottom protection
          </h2>
        </header>
        <TableHeader className="justify-end  flex max-w-4xl mx-auto">
          <TableRow className="border-none flex gap-4">
            <TableHead className=" font-normal">Beauotonomi</TableHead>
            <TableHead className="font-normal ">Competitors</TableHead>
          </TableRow>
        </TableHeader>
        <Table className="max-w-4xl mx-auto border-t">
          <TableBody>
            {tableData.map((row, index) => (
              <TableRow key={index} className="">
                <TableCell >
                  <div className="flex md:flex items-center justify-between  w-full">
                    <p className="font-normal text-lg md:text-[22px] text-secondary  mt-1">
                      {row.title}
                    </p>
                    <div className="flex gap-y-0 gap-20">
                      <TableCell className="flex md:flex ">
                        {row.beautonomi ? (
                          <CheckIcon className="text-green-600 mx-auto" />
                        ) : (
                          <XIcon className="text-red-600 mx-auto" />
                        )}
                      </TableCell>
                      <TableCell className="flex md:flex">
                        {row.competitors ? (
                          <CheckIcon className="text-green-600 mx-auto" />
                        ) : (
                          <XIcon className="text-red-600 mx-auto" />
                        )}
                      </TableCell>
                    </div>
                  </div>
                  {row.description && (
                    <p className="text-sm md:text-base font-light  text-destructive max-w-full md:max-w-xl ">
                      {row.description}
                    </p>
                  )}
                </TableCell>
                <TableCell className="flex justify-between">
                  
                  {/* <div className="flex gap-24 ">
                    <TableCell className="hidden md:block">
                      {row.airbnb ? (
                        <CheckIcon className="text-green-600 mx-auto" />
                      ) : (
                        <XIcon className="text-red-600 mx-auto" />
                      )}
                    </TableCell>
                    <TableCell className="hidden md:block">
                      {row.competitors ? (
                        <CheckIcon className="text-green-600 mx-auto" />
                      ) : (
                        <XIcon className="text-red-600 mx-auto" />
                      )}
                    </TableCell>
                  </div> */}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <footer>
          <p className="mx-auto text-sm md:text-base text-destructive font-light  max-w-4xl mb-10">
            Comparison is based on public information and free offerings by top
            competitors as of 10/22.{" "}
            <a href="#" className="underline text-black font-light ">
              Find details and exclusions here.
            </a>
          </p>
          <div className="text-start lg:text-center mb-[78px]">
            <ButtonPrimary variant={"primaryButton"} text={"Learn more"} />
          </div>
        </footer>
      </div>
    </div>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
