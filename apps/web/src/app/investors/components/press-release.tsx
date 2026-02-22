import { Button } from "@/components/ui/button"

export default function PressRelease() {
  // Define an array of press releases
  const pressReleases = [
    { date: "AUGUST 6, 2024", title: "Beautonomi Announces Second Quarter 2024 Results" },
    { date: "JULY 23, 2024", title: "Beautonomi to Announce Second Quarter 2024 Results" },
    { date: "MAY 16, 2024", title: "Beautonomi to Participate in the Bernstein 40th Annual Strategic Decisions Conference 2024" }
  ];

  return (
    <div className="max-w-3xl mx-auto border-b pb-32 mb-10 px-4">
      <h1 className="text-[32px] font-extrabold text-secondary mb-14">Press Releases</h1>
      <div className="space-y-8">
        {pressReleases.map((release, index) => (
          <div key={index} className="border-b pb-7">
            <p className="text-xs font-light text-[#717171] mb-3">{release.date}</p>
            <h2 className="text-[26px] font-semibold mt-1">{release.title}</h2>
          </div>
        ))}
      </div>
      <div className="mt-12">
        <Button variant="destructive">Show all press releases</Button>
      </div>
    </div>
  )
}
