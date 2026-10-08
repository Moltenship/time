import {
  ArrowRightIcon,
  BracesIcon,
  GlobeClockIcon,
  PanelsIcon,
  ServerIcon,
} from "@/components/icons";
import InstallCommand from "@/components/install-command";
import LandingCalendar from "@/components/landing-calendar";
import { codeThemes } from "@/lib/code-themes";
import { demoUrl, githubUrl } from "@/lib/layout";
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const features = [
  {
    icon: GlobeClockIcon,
    title: "Temporal end to end",
    description:
      "Events are Temporal instants and plain dates, never Date. Time zones, DST gaps and repeated hours resolve exactly.",
  },
  {
    icon: PanelsIcon,
    title: "Headless React, shadcn/ui views",
    description:
      "State and navigation live in typed hooks and components. Views ship as shadcn/ui source you copy in and edit.",
  },
  {
    icon: BracesIcon,
    title: "Typed adapters",
    description:
      "Map your existing records with one adapter. Your ID and resource types reach every callback without casts.",
  },
  {
    icon: ServerIcon,
    title: "SSR-safe",
    description:
      "No browser globals at import time. Pass the time zone and clock, and server HTML hydrates without mismatches.",
  },
] as const;

const steps = [
  "Describe your records with an event adapter.",
  "Create a calendar typed by those records.",
  "Use its hooks and components with your types, no casts.",
] as const;

const buttonClass =
  "inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-medium transition-colors";

export default async function HomePage() {
  // The sample is a real module, type-checked and imported by tests, so it tracks the public API.
  const example = await readFile(join(process.cwd(), "app/(home)/example.ts"), "utf8");

  return (
    <>
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[linear-gradient(to_right,var(--color-fd-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-fd-border)_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_70%_at_50%_0%,black,transparent)]"
        />
        <div className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-20 pb-14 text-center sm:pt-28">
          <p className="rounded-full border bg-fd-background px-3 py-1 text-xs font-medium text-fd-muted-foreground">
            React 19 · Temporal API · shadcn/ui
          </p>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            The React calendar built on Temporal
          </h1>
          <p className="mt-5 max-w-xl text-lg text-balance text-fd-muted-foreground">
            Week, month, day and agenda views with exact time zone and DST handling. Bring your own
            data and restyle every pixel.
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
            <InstallCommand command="pnpm add @moltenship/calendar" />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <LandingCalendar />
        </div>
      </section>

      <section aria-labelledby="features-title" className="mx-auto w-full max-w-6xl px-6 py-24">
        <h2
          className="max-w-xl text-3xl font-semibold tracking-tight text-balance"
          id="features-title"
        >
          Correct time underneath. Your interface on top.
        </h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border bg-fd-border sm:grid-cols-2 lg:grid-cols-4">
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
        aria-labelledby="example-title"
        className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-24 lg:grid-cols-[2fr_3fr] lg:items-start"
      >
        <div className="lg:pt-4">
          <h2 className="text-3xl font-semibold tracking-tight text-balance" id="example-title">
            Your data, typed all the way through
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
          <Link
            className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium hover:text-brand"
            href="/docs/installation"
          >
            Read the installation guide
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
