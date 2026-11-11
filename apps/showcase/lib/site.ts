export const siteUrl = "https://time.molten.sh";
export const siteName = "Moltenship Time";
export const siteTitle = "Moltenship Time: the React calendar built on Temporal";
export const siteDescription =
  "A headless React 19 calendar built on the Temporal API. Week, day, month, year, agenda and resource views you own as shadcn/ui source, with exact time zones and DST.";
export const githubUrl = "https://github.com/Moltenship/time";
export const demoUrl = "https://moltenship-time-demo.vercel.app";
export const npmUrl = "https://www.npmjs.com/package/@moltenship/calendar";

export const siteKeywords = [
  "React calendar",
  "React scheduler",
  "event calendar",
  "Temporal API",
  "headless calendar",
  "shadcn/ui calendar",
  "week view",
  "month view",
  "agenda view",
  "resource timeline",
  "time zones",
  "daylight saving time",
  "drag and drop calendar",
  "recurring events",
  "RRULE",
  "iCalendar",
  "Next.js calendar",
  "TypeScript",
];

/** Open Graph fields every page repeats, since a page's `openGraph` replaces the layout's. */
export const openGraphBase = {
  siteName,
  locale: "en_US",
  images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: siteTitle }],
};

/** Serializes structured data for a `<script type="application/ld+json">` tag. */
export function jsonLd(data: object): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
