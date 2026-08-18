import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="brand-lockup">
          <span aria-hidden="true" className="brand-mark">
            24
          </span>
          <span>Moltenship Time</span>
        </span>
      ),
    },
    githubUrl: "https://github.com/Moltenship/time",
    links: [
      {
        text: "Docs",
        url: "/docs",
        active: "nested-url",
      },
      {
        text: "Packages",
        url: "/docs/packages",
        active: "nested-url",
      },
      {
        text: "API",
        url: "/docs/api",
        active: "nested-url",
      },
    ],
  };
}
