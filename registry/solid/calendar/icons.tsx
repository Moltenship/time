import type { JSX } from "@solidjs/web";

/*
 * The icons the Solid items draw, as inline SVG with Lucide's paths (ISC licence), until
 * `lucide-solid` supports Solid 2.0. Each is decorative: give it `aria-hidden`.
 */

export type IconProps = JSX.SvgSVGAttributes<SVGSVGElement>;

function Icon(props: IconProps & { readonly children: JSX.Element }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      {...props}
    />
  );
}

export function CalendarX2Icon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16 2v3" />
      <path d="m17 16 5 5" />
      <path d="m17 21 5-5" />
      <path d="M21 12V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h8" />
      <path d="M3 9h18" />
      <path d="M8 2v3" />
    </Icon>
  );
}

export function LoaderCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </Icon>
  );
}
