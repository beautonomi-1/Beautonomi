"use client";

import * as React from "react";
import useEmblaCarousel, { type UseEmblaCarouselType } from "embla-carousel-react";

type EmblaCarouselType = NonNullable<UseEmblaCarouselType[1]>;
import { cn } from "@/lib/utils";

export interface EmblaSliderApi {
  scrollPrev: () => void;
  scrollNext: () => void;
  scrollTo: (index: number, jump?: boolean) => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
}

interface EmblaSliderProps {
  children: React.ReactNode;
  /** Number of slides visible at once (used for flex basis). Default 8. */
  slidesToShow?: number;
  loop?: boolean;
  className?: string;
  contentClassName?: string;
  itemClassName?: string;
  setApi?: (api: EmblaSliderApi | null) => void;
}

const EmblaSlider = React.forwardRef<HTMLDivElement, EmblaSliderProps>(
  (
    {
      children,
      slidesToShow = 8,
      loop = true,
      className,
      contentClassName,
      itemClassName,
      setApi,
    },
    ref
  ) => {
    const [emblaRef, emblaApi] = useEmblaCarousel({
      loop,
      align: "start",
      containScroll: "trimSnaps",
    });
    const [canScrollPrev, setCanScrollPrev] = React.useState(false);
    const [canScrollNext, setCanScrollNext] = React.useState(true);

    const apiRef = React.useRef<EmblaSliderApi | null>(null);

    const updateScrollState = React.useCallback((api: EmblaCarouselType) => {
      setCanScrollPrev(api.canScrollPrev());
      setCanScrollNext(api.canScrollNext());
    }, []);

    React.useEffect(() => {
      if (!emblaApi) return;
      updateScrollState(emblaApi);
      apiRef.current = {
        scrollPrev: () => emblaApi.scrollPrev(),
        scrollNext: () => emblaApi.scrollNext(),
        scrollTo: (index: number, jump = true) => emblaApi.scrollTo(index, jump),
        get canScrollPrev() {
          return emblaApi.canScrollPrev();
        },
        get canScrollNext() {
          return emblaApi.canScrollNext();
        },
      };
      setApi?.(apiRef.current);
      emblaApi.on("select", updateScrollState);
      emblaApi.on("reInit", updateScrollState);
      return () => {
        emblaApi.off("select", updateScrollState);
        emblaApi.off("reInit", updateScrollState);
        apiRef.current = null;
        setApi?.(null);
      };
    }, [emblaApi, setApi, updateScrollState]);

    const basisPercent = slidesToShow > 0 ? 100 / slidesToShow : 100;

    return (
      <div ref={ref} className={cn("relative", className)}>
        <div ref={emblaRef} className="overflow-hidden">
          <div
            className={cn(
              "flex gap-0 -ml-1",
              contentClassName
            )}
            style={{ minWidth: 0 }}
          >
            {React.Children.map(children, (child) => (
              <div
                className={cn(
                  "min-w-0 shrink-0 grow-0 pl-1",
                  itemClassName
                )}
                style={{ flexBasis: `${basisPercent}%` }}
              >
                {child}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);
EmblaSlider.displayName = "EmblaSlider";

export { EmblaSlider };
