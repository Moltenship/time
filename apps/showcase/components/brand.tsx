import type { SVGProps } from "react";

/** A week grid crossed by the current-time line. `app/icon.svg` is the same drawing. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 32 32" {...props}>
      <rect className="fill-brand" height="32" rx="8" width="32" />
      <path
        d="M12.5 8v16M19.5 8v16"
        stroke="white"
        strokeLinecap="round"
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
      <circle cx="8.5" cy="17" fill="white" r="2.5" />
      <path d="M10 17h14" stroke="white" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}
