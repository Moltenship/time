import type { SVGProps } from "react";

/**
 * The wordmark: "time" in one stroke weight, with the dot of the "i" in the brand colour. The
 * letters take the text colour. `app/icon.svg` is its "t" and dot on a brand tile.
 */
export function Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-label="Moltenship Time"
      fill="none"
      role="img"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="3"
      viewBox="-2 1 58 24"
      {...props}
    >
      <path d="M4 5V18a4 4 0 0 0 4 4h1.5M0.5 10.5H9" />
      <path d="M15 10.5V22" />
      <path d="M21 10.5V22M21 14.75a4 4 0 0 1 8 0V22M29 14.75a4 4 0 0 1 8 0V22" />
      <path d="M41.75 16.25H53.25A5.75 5.75 0 1 0 51.6 20.3" />
      <circle className="fill-brand" cx="15" cy="4.6" r="2.2" stroke="none" />
    </svg>
  );
}
