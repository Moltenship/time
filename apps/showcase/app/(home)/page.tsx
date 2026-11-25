import {
  ArrowRightIcon,
  BracesIcon,
  GlobeClockIcon,
  GlobeIcon,
  PanelsIcon,
  RepeatIcon,
  ServerIcon,
} from "@/components/icons";
import { AgentPreview } from "@/components/agent-preview";
import InstallCommand from "@/components/install-command";
import { CalendarPreview } from "@/components/calendar-preview";
import { codeThemes } from "@/lib/code-themes";
import {
  demoUrl,
  githubUrl,
  jsonLd,
  npmUrl,
  openGraphBase,
  siteDescription,
  siteHeadline,
  siteKeywords,
  siteName,
  siteTitle,
  siteUrl,
  websiteId,
} from "@/lib/site";
import type { Metadata } from "next";
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...openGraphBase, type: "website", url: "/", title: siteTitle },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: siteName,
      url: siteUrl,
      description: siteDescription,
      inLanguage: "en",
    },
    {
      "@type": "SoftwareSourceCode",
      name: siteName,
      description: siteDescription,
      url: siteUrl,
      codeRepository: githubUrl,
      programmingLanguage: "TypeScript",
      runtimePlatform: ["React 19", "SolidJS 2"],
      license: "https://opensource.org/licenses/MIT",
      keywords: siteKeywords.join(", "),
      sameAs: [githubUrl, npmUrl],
    },
  ],
};

const features = [
  {
    icon: GlobeClockIcon,
    title: "Temporal, not Date",
    description:
      "A timed event is a Temporal.Instant, an all-day event a Temporal.PlainDate, and a floating event a Temporal.PlainDateTime.",
  },
  {
    icon: GlobeIcon,
    title: "Time zones and DST",
    description:
      "The engine lays out days that are 23 or 25 hours long, and the hours a clock change skips or repeats, in any IANA time zone.",
  },
  {
    icon: RepeatIcon,
    title: "Recurrence and iCalendar",
    description:
      "Two more packages expand RRULE series inside the dates on screen and parse ICS feeds into Temporal values.",
  },
  {
    icon: PanelsIcon,
    title: "Views you copy and own",
    description:
      "Week, day, month, year, agenda and resource views are React source files. The shadcn CLI copies them into your app, in Tailwind CSS or StyleX.",
  },
  {
    icon: BracesIcon,
    title: "Typed adapters",
    description:
      "One adapter reads an ID, a title and a time range from your records. TypeScript keeps your record and ID types in every hook and callback.",
  },
  {
    icon: ServerIcon,
    title: "Server rendering",
    description:
      "In React, the calendar reads no clock, host time zone or window while it renders on the server, so the server and the browser render the same markup.",
  },
] as const;

const steps = [
  "Describe your records with an event adapter.",
  "Create a calendar typed by those records.",
  "Use its hooks and components with your types, no casts.",
] as const;

const agentFacts = [
  {
    title: "An agent sees nothing by default.",
    description:
      "An agent can read or change a calendar only after your app creates ui-sdk's agent bridge.",
  },
  {
    title: "Your rules run for every step.",
    description:
      "The bridge asks your allow function first. Then your policies and onEventChange run, as they do for a drag.",
  },
  {
    title: "Deleting is off.",
    description:
      "A calendar has no deleteEvent action until Root has allowAgentDelete, and your app can ask the person first.",
  },
  {
    title: "A browser's agent, or a model you run.",
    description:
      "registerTools offers the same tools through WebMCP where the browser has it. WebMCP is an experimental browser API.",
  },
] as const;

/** What each integration has today. `docs/frameworks` has the full table. */
const frameworkRows = [
  ["Engine, state and event changes", "Yes", "Yes"],
  ["The fifteen agent actions", "Yes", "Yes"],
  ["Root, toolbar parts and read hooks", "Yes", "Yes"],
  ["Ready-made views", "shadcn/ui or StyleX source", "Not yet"],
  ["Keyboard navigation in a view", "Yes", "Not yet"],
  ["Drag, resize and create", "Yes", "Not yet"],
  ["Undo and redo", "Yes", "Not yet"],
] as const;

const agentDocs = [
  {
    name: "/llms.txt",
    href: "/llms.txt",
    description:
      "The index of every page, with a Markdown version of each at its address plus .md.",
  },
  {
    name: "node_modules/@moltenship/calendar/docs",
    href: "/docs/agents/coding-agents#docs-in-the-package",
    description: "The same pages inside the npm package, for the version you installed.",
  },
] as const;

const buttonClass =
  "inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-medium transition-colors";
const sectionLinkClass = "inline-flex items-center gap-1.5 text-sm font-medium hover:text-brand";

export default async function HomePage() {
  // The sample is a real module, type-checked and imported by tests, so it tracks the public API.
  const example = await readFile(join(process.cwd(), "app/(home)/example.ts"), "utf8");

  return (
    <>
      <script dangerouslySetInnerHTML={jsonLd(structuredData)} type="application/ld+json" />
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[linear-gradient(to_right,var(--color-fd-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-fd-border)_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_70%_at_50%_0%,black,transparent)]"
        />
        <div className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-20 pb-14 text-center sm:pt-28">
          <p className="rounded-full border bg-fd-background px-3 py-1 text-xs font-medium text-fd-muted-foreground">
            2.0 pre-release · React 19 · SolidJS 2 preview
          </p>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            {siteHeadline}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-balance text-fd-muted-foreground">
            One engine computes time zones, daylight saving time and recurrence. React renders it
            with views you copy and own, and SolidJS 2 renders it as a preview. An AI agent can read
            the calendar and change it, under rules your app sets.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              className={`${buttonClass} bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/85`}
              href="/docs"
            >
              Get started
              <ArrowRightIcon />
            </Link>
            <a
              className={`${buttonClass} border bg-fd-background hover:bg-fd-accent`}
              href={demoUrl}
            >
              View demo
            </a>
          </div>
          <div className="mt-6 max-w-full">
            <InstallCommand command="pnpm add @moltenship/calendar @ui-sdk/core @ui-sdk/react" />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <CalendarPreview sidebar size="h-[34rem] sm:h-[40rem]" view="week" />
        </div>
      </section>

      <section aria-labelledby="features-title" className="mx-auto w-full max-w-6xl px-6 py-24">
        <h2
          className="max-w-xl text-3xl font-semibold tracking-tight text-balance"
          id="features-title"
        >
          One engine under every view
        </h2>
        <p className="mt-4 max-w-2xl text-fd-muted-foreground">
          The packages that hold events, time and state import no UI framework. The calendar above
          is that engine with the React views from this site&apos;s registry.
        </p>
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border bg-fd-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <article className="bg-fd-background p-6" key={title}>
              <Icon className="size-5 text-brand" />
              <h3 className="mt-4 font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="agents-title"
        className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6"
      >
        <div className="px-2 sm:px-0">
          <h2
            className="max-w-2xl text-3xl font-semibold tracking-tight text-balance"
            id="agents-title"
          >
            An AI agent can read this calendar and change it
          </h2>
          <p className="mt-4 max-w-2xl text-fd-muted-foreground">
            A calendar describes itself to an agent as state, events and fifteen named actions. The
            agent never reads your markup or simulates a pointer. Below is a live calendar next to
            what the bridge lists for it. Each button sends the call a model would send.
          </p>
        </div>
        <AgentPreview />
        <dl className="mt-10 grid gap-px overflow-hidden rounded-xl border bg-fd-border sm:grid-cols-2 lg:grid-cols-4">
          {agentFacts.map(({ title, description }) => (
            <div className="bg-fd-background p-6" key={title}>
              <dt className="font-medium">{title}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">
                {description}
              </dd>
            </div>
          ))}
        </dl>
        <Link className={`${sectionLinkClass} mt-8 px-2 sm:px-0`} href="/docs/agents">
          Read the agents guide
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </section>

      <section
        aria-labelledby="frameworks-title"
        className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-24 lg:grid-cols-[2fr_3fr] lg:items-start"
      >
        <div className="lg:pt-4">
          <h2 className="text-3xl font-semibold tracking-tight text-balance" id="frameworks-title">
            React is complete. Solid is a preview.
          </h2>
          <p className="mt-6 text-fd-muted-foreground">
            One package holds the calendar&apos;s state and actions. It imports no framework and is
            built on{" "}
            <a
              className="underline underline-offset-4 hover:text-fd-foreground"
              href="https://ui-sdk.dev"
            >
              ui-sdk
            </a>
            . React and Solid each have a thin package that renders them. The Solid package has the
            typed factory, Root, the structural parts and the read hooks. You write its views
            yourself for now.
          </p>
          <p className="mt-4 text-fd-muted-foreground">
            Time 2.0 is a pre-release and ui-sdk is a beta, so both APIs can still change.
          </p>
          <Link className={`${sectionLinkClass} mt-8`} href="/docs/frameworks">
            Compare React and Solid
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-fd-background shadow-sm">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">What the React and Solid integrations have today</caption>
            <thead className="border-b bg-fd-muted/50 text-fd-muted-foreground">
              <tr>
                <td className="px-4 py-3" />
                <th className="px-4 py-3 font-medium" scope="col">
                  React 19
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  SolidJS 2
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {frameworkRows.map(([feature, react, solid]) => (
                <tr key={feature}>
                  <th className="px-4 py-3 font-normal" scope="row">
                    {feature}
                  </th>
                  <td className="px-4 py-3">{react}</td>
                  <td className={`px-4 py-3 ${solid === "Yes" ? "" : "text-fd-muted-foreground"}`}>
                    {solid}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="example-title"
        className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-24 lg:grid-cols-[2fr_3fr] lg:items-start"
      >
        <div className="lg:pt-4">
          <h2 className="text-3xl font-semibold tracking-tight text-balance" id="example-title">
            One adapter types the whole calendar
          </h2>
          <ol className="mt-6 space-y-4">
            {steps.map((step, index) => (
              <li className="flex gap-3 text-fd-muted-foreground" key={step}>
                <span className="grid size-6 shrink-0 place-items-center rounded-full border font-mono text-xs text-fd-foreground">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <Link className={`${sectionLinkClass} mt-8`} href="/docs/quick-start">
            Build the React quick start
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
        <ServerCodeBlock
          code={example}
          codeblock={{ title: "calendar.ts", className: "my-0 shadow-sm" }}
          lang="ts"
          themes={codeThemes}
        />
      </section>

      <section
        aria-labelledby="coding-agents-title"
        className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-24 lg:grid-cols-[2fr_3fr] lg:items-start"
      >
        <div className="lg:pt-4">
          <h2
            className="text-3xl font-semibold tracking-tight text-balance"
            id="coding-agents-title"
          >
            Docs your coding agent can read
          </h2>
          <p className="mt-6 text-fd-muted-foreground">
            A coding agent trained before 2.0 guesses at this API. The docs come as Markdown, on the
            site and inside the package, and a skill tells the agent where to look first.
          </p>
          <Link className={`${sectionLinkClass} mt-8`} href="/docs/agents/coding-agents">
            Build with a coding agent
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-px overflow-hidden rounded-xl border bg-fd-border">
          {agentDocs.map(({ name, href, description }) => (
            <div className="min-w-0 bg-fd-background p-6" key={name}>
              <a className="font-mono text-sm font-medium break-all hover:text-brand" href={href}>
                {name}
              </a>
              <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">{description}</p>
            </div>
          ))}
          <div className="min-w-0 bg-fd-background p-6">
            <InstallCommand command="npx skills add Moltenship/time --skill moltenship-time" />
            <p className="mt-3 text-sm leading-relaxed text-fd-muted-foreground">
              An Agent Skill with seven references, which also ships in the npm package.
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-auto border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-fd-muted-foreground">
          <p>Moltenship Time</p>
          <nav aria-label="Footer" className="flex gap-6">
            <Link className="hover:text-fd-foreground" href="/docs">
              Docs
            </Link>
            <a className="hover:text-fd-foreground" href={demoUrl}>
              Demo
            </a>
            <a className="hover:text-fd-foreground" href={githubUrl}>
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}
