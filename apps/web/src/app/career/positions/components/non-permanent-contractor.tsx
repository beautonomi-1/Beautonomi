import Link from "next/link";
import { Button } from "@/components/ui/button";

type NonPermanentContractorProps = {
  portalUrl: string;
};

export default function NonPermanentContractor({
  portalUrl,
}: NonPermanentContractorProps) {
  return (
    <section className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm md:p-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-pink-600">
          Flexible Opportunities
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900">
          Non-permanent contractor roles
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600 md:text-base">
          We regularly open contractor opportunities across operations, support,
          and growth projects. Browse our careers portal for active short-term
          and project-based roles in available markets.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            asChild
            className="rounded-full bg-gradient-to-r from-[#FF0077] to-[#D60565] px-6"
          >
            <Link href={portalUrl}>View contractor openings</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full px-6">
            <Link href={portalUrl}>Browse all careers</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
