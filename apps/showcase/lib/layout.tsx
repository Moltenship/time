import { BrandMark } from "@/components/brand";
import type { HomeLayoutProps } from "fumadocs-ui/layouts/home";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const githubUrl = "https://github.com/Moltenship/time";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <BrandMark className="size-6" />
          <span className="font-semibold tracking-tight">Moltenship Time</span>
        </>
      ),
    },
    githubUrl,
  };
}

export function homeOptions(): HomeLayoutProps {
  return {
    ...baseOptions(),
    links: [{ text: "Docs", url: "/docs", active: "nested-url" }],
  };
}
