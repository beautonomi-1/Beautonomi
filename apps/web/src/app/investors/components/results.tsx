import { Button } from "@/components/ui/button"

export default function Results() {
  const downloadItems = [
    { label: "Press Release", href: "#" },
    { label: "Shareholder Letter", href: "#" },
    { label: "Earnings Webcast", href: "#" },
    { label: "Earnings Transcript", href: "#" },
    { label: "SEC Filings", href: "#" }
  ];

  return (
    <div className="max-w-3xl mx-auto border-b -mt-5 pb-32 mb-10 px-4">
      <h1 className="text-[32px] font-extrabold text-secondary mb-20">Quarterly Results</h1>
      <h2 className="mt-4 text-[22px] font-bold mb-10">Q2 2024</h2>
      <div className="flex flex-wrap gap-4 border-b mb-14 pb-11">
        {downloadItems.map((item, index) => (
          <a 
            key={index} 
            href={item.href} 
            className="flex flex-wrap items-center text-sm font-bold text-secondary"
          >
            <DownloadIcon className="mr-2 h-5 w-5" />
            {item.label}
          </a>
        ))}
      </div>
      <Button variant="destructive">
        See all quarterly results
      </Button>
    </div>
  )
}

function DownloadIcon(props:any) {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  )
}
