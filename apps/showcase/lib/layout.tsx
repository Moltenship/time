import { Wordmark } from "@/components/brand";
import type { HomeLayoutProps } from "fumadocs-ui/layouts/home";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const githubUrl = "https://github.com/Moltenship/time";
export const demoUrl = "https://moltenship-time-demo.vercel.app";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Wordmark className="h-5 w-auto" />,
    },
    githubUrl,
  };
}

export function homeOptions(): HomeLayoutProps {
  return {
    ...baseOptions(),
    links: [
      { text: "Docs", url: "/docs", active: "nested-url" },
      { text: "Demo", url: demoUrl, external: true },
    ],
  };
}
