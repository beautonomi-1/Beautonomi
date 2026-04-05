import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";
import type { LucideIcon } from "lucide-react";

function strokeProps(p: LucideProps) {
  const {
    size = 24,
    color = "currentColor",
    strokeWidth = 2,
    className,
    ...rest
  } = p;
  return { size, color, strokeWidth, className, rest };
}

type SvgWrap = {
  ref: React.ForwardedRef<SVGSVGElement>;
  p: ReturnType<typeof strokeProps>;
  children: React.ReactNode;
};
function Svg({ ref, p, children }: SvgWrap) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={p.size}
      height={p.size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={p.color}
      strokeWidth={p.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
      {...p.rest}
    >
      {children}
    </svg>
  );
}

/**
 * Scissors — Tabler TbScissors paths (24×24 stroke style, identical to Lucide).
 * Two circular handles on left, blades crossing to the right.
 */
export const BeautonomiHair = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      <path d="M6 7m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
      <path d="M6 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
      <path d="M8.6 8.6l10.4 10.4" />
      <path d="M8.6 15.4l10.4 -10.4" />
    </Svg>
  );
});
BeautonomiHair.displayName = "BeautonomiHair";

/**
 * Nail polish bottle — handle stick, cap, rounded bottle body with shine line.
 */
export const BeautonomiNails = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      {/* Brush handle */}
      <line x1="12" y1="2" x2="12" y2="5" />
      {/* Cap */}
      <rect x="10" y="5" width="4" height="2.5" rx="0.5" />
      {/* Bottle body */}
      <path d="M10.5 7.5h3l0.7 1.5v11a1.2 1.2 0 0 1 -1.2 1.2h-3a1.2 1.2 0 0 1 -1.2 -1.2V9z" />
      {/* Shine line */}
      <line x1="11.2" y1="11" x2="11.2" y2="17" />
    </Svg>
  );
});
BeautonomiNails.displayName = "BeautonomiNails";

/**
 * Three-strand braid — strands cross each other from scalp to tie-off.
 * The crossing pattern is the universal visual cue for "braid".
 */
export const BeautonomiBraids = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      {/* Scalp arc */}
      <path d="M8 4Q12 2 16 4" />
      {/* Left strand — swings right across centre */}
      <path d="M9 4C8.5 7 14 9 14 12C14 15 8.5 17 9 20" />
      {/* Right strand — swings left across centre */}
      <path d="M15 4C15.5 7 10 9 10 12C10 15 15.5 17 15 20" />
      {/* Centre strand */}
      <line x1="12" y1="4" x2="12" y2="20" />
      {/* Elastic tie at bottom */}
      <path d="M9 20Q12 21.5 15 20" />
    </Svg>
  );
});
BeautonomiBraids.displayName = "BeautonomiBraids";

/**
 * Lipstick tube — universally recognised "makeup" icon.
 * Lower tube, upper sleeve, and angled bullet tip.
 */
export const BeautonomiMakeup = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      {/* Lower tube / handle */}
      <rect x="9.5" y="13" width="5" height="9" rx="1" />
      {/* Collar ring */}
      <line x1="9.5" y1="13" x2="14.5" y2="13" />
      {/* Upper sleeve */}
      <rect x="10" y="9" width="4" height="4" rx="0.5" />
      {/* Angled bullet */}
      <path d="M10 9L10 7L12 4.5L14 7L14 9" />
    </Svg>
  );
});
BeautonomiMakeup.displayName = "BeautonomiMakeup";

/**
 * Massage table — Tabler TbMassage paths.
 * Person lying on table with therapist hands above the back.
 */
export const BeautonomiMassage = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      {/* Head of person lying down */}
      <path d="M4 17m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      {/* Head of therapist seated above */}
      <path d="M9 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      {/* Table edge + person's body */}
      <path d="M4 22l4 -2v-3h12" />
      {/* Legs on table */}
      <path d="M11 20h9" />
      {/* Therapist arms reaching to back */}
      <path d="M8 14l3 -2l1 -4c3 1 3 4 3 6" />
    </Svg>
  );
});
BeautonomiMassage.displayName = "BeautonomiMassage";

/**
 * Three sinusoidal locs hanging from a scalp arc.
 * The parallel S-curves (no crossing) distinguish dreadlocks from braids.
 */
export const BeautonomiDreadlocks = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      {/* Scalp arc */}
      <path d="M8 4Q12 2 16 4" />
      {/* Loc 1 */}
      <path d="M9 4c1 1.5 -1 3 0 5s-1 3 0 5-1 3 0 4" />
      {/* Loc 2 */}
      <path d="M12 4c1 1.5 -1 3 0 5s-1 3 0 5-1 3 0 4" />
      {/* Loc 3 */}
      <path d="M15 4c1 1.5 -1 3 0 5s-1 3 0 5-1 3 0 4" />
    </Svg>
  );
});
BeautonomiDreadlocks.displayName = "BeautonomiDreadlocks";

/**
 * Eye with eyebrow — Tabler TbEye paths with an arched brow added above.
 * Clear, minimal "brows & lashes" symbol.
 */
export const BeautonomiBrowsLashes = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      {/* Arched brow */}
      <path d="M5 8c3 -2 7 -2.5 11 -1" />
      {/* Eye outline — Tabler TbEye */}
      <path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" />
      {/* Iris */}
      <path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
    </Svg>
  );
});
BeautonomiBrowsLashes.displayName = "BeautonomiBrowsLashes";

/**
 * Afro head — large rounded dome (the hair) with a small face oval below.
 * The dome-to-face ratio is the unmistakable afro/natural hair silhouette.
 */
export const BeautonomiNaturalHair = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      {/* Large afro dome */}
      <path d="M6 12c0 -4.4 2.7 -8 6 -8s6 3.6 6 8" />
      {/* Bumpy afro texture */}
      <path d="M6.5 9.5c0.3 -1 1.2 -1.5 2 -1" />
      <path d="M10 7c0.2 -1.5 1.5 -2 2.5 -1.5" />
      <path d="M14 7c0.3 -1.2 1.8 -1.2 2 0" />
      <path d="M17 9.5c0.5 -0.8 1.2 -0.5 1.5 0.5" />
      {/* Face / chin */}
      <path d="M9 12v3c0 1.7 1.3 3 3 3s3 -1.3 3 -3v-3" />
      {/* Neck */}
      <path d="M10 18v2M14 18v2" />
    </Svg>
  );
});
BeautonomiNaturalHair.displayName = "BeautonomiNaturalHair";

/**
 * Mannequin head on stand with flowing wig hair.
 * Stand + head oval + sweeping hair mass = "wigs & weaves".
 */
export const BeautonomiWigsWeaves = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      {/* Stand pole */}
      <line x1="12" y1="18" x2="12" y2="22" />
      {/* Stand base */}
      <path d="M9 22h6" />
      {/* Mannequin head */}
      <path d="M9 13c0 -2 1.3 -4 3 -4s3 2 3 4v5H9v-5z" />
      {/* Wig hair — cascades over and past the head */}
      <path d="M8 13c0 -4 1.8 -7 4 -7s4 3 4 7" />
      <path d="M7 16c-1 -2 -1 -5.5 1 -7.5" />
      <path d="M17 16c1 -2 1 -5.5 -1 -7.5" />
    </Svg>
  );
});
BeautonomiWigsWeaves.displayName = "BeautonomiWigsWeaves";

/**
 * Face mask — Tabler TbFaceMask paths.
 * Rectangular mask with ear straps on both sides.
 */
export const BeautonomiSkinFacials = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      {/* Left ear strap */}
      <path d="M5 14.5h-.222c-1.535 0 -2.778 -1.12 -2.778 -2.5s1.243 -2.5 2.778 -2.5h.222" />
      {/* Right ear strap */}
      <path d="M19 14.5h.222c1.534 0 2.778 -1.12 2.778 -2.5s-1.244 -2.5 -2.778 -2.5h-.222" />
      {/* Mask horizontal lines */}
      <path d="M9 10h6" />
      <path d="M9 14h6" />
      {/* Mask body outline */}
      <path d="M12.55 18.843l5 -1.429a2 2 0 0 0 1.45 -1.923v-6.981a2 2 0 0 0 -1.45 -1.923l-5 -1.429a2 2 0 0 0 -1.1 0l-5 1.429a2 2 0 0 0 -1.45 1.922v6.982a2 2 0 0 0 1.45 1.923l5 1.429a2 2 0 0 0 1.1 0z" />
    </Svg>
  );
});
BeautonomiSkinFacials.displayName = "BeautonomiSkinFacials";

/**
 * Razor — Tabler TbRazor paths.
 * Classic safety razor: flat cartridge head + teardrop handle.
 */
export const BeautonomiHairRemoval = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      {/* Blade cartridge */}
      <path d="M7 3h10v4h-10z" />
      {/* Stem */}
      <path d="M12 7v4" />
      {/* Handle (teardrop) */}
      <path d="M12 11a2 2 0 0 1 2 2v6a2 2 0 1 1 -4 0v-6a2 2 0 0 1 2 -2z" />
    </Svg>
  );
});
BeautonomiHairRemoval.displayName = "BeautonomiHairRemoval";

/**
 * Electric clipper — Tabler TbRazorElectric paths.
 * Head unit with three guard teeth + cylindrical blade body.
 */
export const BeautonomiBarber = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      {/* Three guard pins at top */}
      <path d="M8 3v2" />
      <path d="M12 3v2" />
      <path d="M16 3v2" />
      {/* Clipper head trapezoidal housing */}
      <path d="M8 5h8l-1 4h-6z" />
      {/* Blade body cylinder */}
      <path d="M9 12v6a3 3 0 0 0 6 0v-6h-6z" />
      {/* Indicator dot */}
      <path d="M12 17v1" />
    </Svg>
  );
});
BeautonomiBarber.displayName = "BeautonomiBarber";

/**
 * Bath / spa tub — Tabler TbBath paths.
 * Rounded tub basin with tap fixture = universal spa/relaxation icon.
 */
export const BeautonomiSpa = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      {/* Tub basin */}
      <path d="M4 12h16a1 1 0 0 1 1 1v3a4 4 0 0 1 -4 4h-10a4 4 0 0 1 -4 -4v-3a1 1 0 0 1 1 -1z" />
      {/* Tap fixture on left */}
      <path d="M6 12v-7a2 2 0 0 1 2 -2h3v2.25" />
      {/* Drain feet */}
      <path d="M4 21l1 -1.5" />
      <path d="M20 21l-1 -1.5" />
    </Svg>
  );
});
BeautonomiSpa.displayName = "BeautonomiSpa";

/**
 * Magic wand with 4-pointed sparkle — "all services".
 */
export const BeautonomiAll = forwardRef<SVGSVGElement, LucideProps>((props, ref) => {
  const p = strokeProps(props);
  return (
    <Svg ref={ref} p={p}>
      <path d="M3 21L11 13" />
      <path d="M15.5 4L17 9L22 10.5L17 12L15.5 17L14 12L9 10.5L14 9Z" />
    </Svg>
  );
});
BeautonomiAll.displayName = "BeautonomiAll";

export const BEAUTONOMI_CATEGORY_ICONS_AS_LUCIDE = {
  BeautonomiHair: BeautonomiHair as LucideIcon,
  BeautonomiNails: BeautonomiNails as LucideIcon,
  BeautonomiBraids: BeautonomiBraids as LucideIcon,
  BeautonomiMakeup: BeautonomiMakeup as LucideIcon,
  BeautonomiMassage: BeautonomiMassage as LucideIcon,
  BeautonomiDreadlocks: BeautonomiDreadlocks as LucideIcon,
  BeautonomiBrowsLashes: BeautonomiBrowsLashes as LucideIcon,
  BeautonomiNaturalHair: BeautonomiNaturalHair as LucideIcon,
  BeautonomiWigsWeaves: BeautonomiWigsWeaves as LucideIcon,
  BeautonomiSkinFacials: BeautonomiSkinFacials as LucideIcon,
  BeautonomiHairRemoval: BeautonomiHairRemoval as LucideIcon,
  BeautonomiBarber: BeautonomiBarber as LucideIcon,
  BeautonomiSpa: BeautonomiSpa as LucideIcon,
  BeautonomiAll: BeautonomiAll as LucideIcon,
} as const;
