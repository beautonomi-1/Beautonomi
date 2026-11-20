import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import Policies from "./../../../../public/images/policy-web.png";
import Safety from "./../../../../public/images/safety-web.png";
import type { HelpPageContent } from "../page";
import {
  exploreCardImageKey,
  resolveExploreCards,
} from "@/lib/help/resolve-explore-cards";

type ExploreImage = typeof Policies;

const IMAGE_BY_KEY: Record<string, ExploreImage> = {
  "/learn/policies": Policies,
  "/learn/provider": Safety,
};

function imageForHref(href: string): ExploreImage {
  const key = exploreCardImageKey(href);
  if (key === "/learn/policies") return IMAGE_BY_KEY["/learn/policies"];
  if (key === "/learn/provider") return IMAGE_BY_KEY["/learn/provider"];
  return Safety;
}

function sectionText(content: HelpPageContent | null | undefined, key: string) {
  return content?.[key]?.content?.trim() ?? "";
}

interface ExploreMoreProps {
  content?: HelpPageContent | null;
}

export default function ExploreMore({ content = null }: ExploreMoreProps) {
  const cards = resolveExploreCards(content ?? undefined).map((item) => ({
    ...item,
    imageSrc: imageForHref(item.href),
    imageWidth: 400,
    imageHeight: 233,
  }));
  const companyNotice = sectionText(content, "company_notice");

  return (
    <>
      <div className="bg-black text-white py-12">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-[32px] font-normal mb-6">Explore more</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-2">
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cards.map((item) => (
                <Link
                  key={item.href + item.title}
                  href={item.href}
                  className="items-center flex flex-row md:flex-col relative overflow-hidden rounded-lg group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <Image
                    src={item.imageSrc}
                    alt=""
                    className="w-24 sm:w-full h-24 sm:h-auto sm:aspect-[400/233] object-cover group-hover:opacity-95 transition-opacity"
                    width={item.imageWidth}
                    height={item.imageHeight}
                    sizes="(max-width: 640px) 96px, 50vw"
                  />
                  <div className="w-full bg-secondary pt-5 sm:pt-4 px-4 pb-7 sm:pb-6 rounded-r-lg sm:rounded-none">
                    <h3 className="text-lg font-semibold group-hover:underline">{item.title}</h3>
                    <p className="text-sm">{item.description}</p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="text-white py-4 lg:py-8 rounded-lg lg:ms-4">
              <h3 className="text-[26px] font-normal mb-4">Need to get in touch?</h3>
              <p className="mb-5 text-lg font-light">
                We&apos;ll start with some questions and get you to the right place.
              </p>
              <div className="flex flex-col gap-3 mb-6 w-full max-w-md">
                <Button variant="destructive" className="w-full text-base" size="md" asChild>
                  <Link href="/help/submit-ticket">Contact us</Link>
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-base border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100 hover:text-zinc-900"
                  size="md"
                  asChild
                >
                  <Link href="/help/my-tickets">My tickets</Link>
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-base border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100 hover:text-zinc-900"
                  size="md"
                  asChild
                >
                  <Link href="/learn">Learning Center</Link>
                </Button>
              </div>
              <p className="text-base font-light">
                You can also{" "}
                <Link
                  href="/help/submit-ticket?category=feedback_feature"
                  className="underline font-light text-white"
                  prefetch={false}
                >
                  give us feedback.
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
      {companyNotice ? (
        <p className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-sm text-zinc-500 leading-relaxed">
          {companyNotice}
        </p>
      ) : null}
    </>
  );
}