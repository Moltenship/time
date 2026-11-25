import type { JSX } from "@solidjs/web";

/*
 * The icons the Solid kit and views draw, as inline SVG with Lucide's paths (ISC licence), until
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

export function CalendarCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2v3" />
      <path d="M16 2v3" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="m9 15 2 2 4-4" />
    </Icon>
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

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 18 6-6-6-6" />
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
