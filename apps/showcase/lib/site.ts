export const siteUrl = "https://time.molten.sh";
export const siteName = "Moltenship Time";
/** The landing page's headline, which the Open Graph image and the production check repeat. */
export const siteHeadline = "The Temporal calendar for React, Solid and AI agents";
export const siteTitle = `Moltenship Time: ${siteHeadline.charAt(0).toLowerCase()}${siteHeadline.slice(1)}`;
export const siteDescription =
  "A calendar engine on the Temporal API with exact time zones and recurrence. React views you copy and own, a SolidJS 2 preview, and actions an AI agent can call.";
/** The `@id` that structured data on other pages uses to point at the site. */
export const websiteId = `${siteUrl}/#website`;
export const githubUrl = "https://github.com/Moltenship/time";
export const demoUrl = "https://moltenship-time-demo.vercel.app";
export const npmUrl = "https://www.npmjs.com/package/@moltenship/calendar";

export const siteKeywords = [
  "React calendar",
  "React scheduler",
  "SolidJS calendar",
  "calendar for AI agents",
  "WebMCP",
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
