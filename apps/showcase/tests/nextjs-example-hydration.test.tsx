// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

import { TeamCalendar, type TeamCalendarProps } from "../app/(home)/examples/nextjs/team-calendar";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/examples/nextjs",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("../app/(home)/examples/nextjs/actions", () => ({
  createMeeting: vi.fn(),
  moveMeeting: vi.fn(),
  saveTimeZone: vi.fn(),
}));

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("matchMedia", () => ({
    addEventListener() {},
    matches: true,
    removeEventListener() {},
  }));
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const props: TeamCalendarProps = {
  location: { date: "2026-10-14", view: "week" },
  meetings: [
    {
      color: "blue",
      end: "2026-10-14T08:30:00Z",
      id: "planning",
      start: "2026-10-14T07:00:00Z",
      title: "Weekly planning",
    },
  ],
  now: "2026-10-14T12:00:00Z",
  timeZone: "Europe/Berlin",
  timeZoneFromCookie: true,
};

async function hydrate(view: TeamCalendarProps["location"]["view"]) {
  const element = <TeamCalendar {...props} location={{ ...props.location, view }} />;
  const container = document.createElement("div");
  container.innerHTML = renderToString(element);
  document.body.append(container);
  const serverHtml = container.innerHTML;

  const errors: unknown[] = [];
  const consoleError = vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args);
  });
  const root = await act(async () =>
    hydrateRoot(container, element, { onRecoverableError: (error) => errors.push(error) }),
  );
  await act(async () => root.unmount());
  consoleError.mockRestore();
  return { errors, serverHtml };
}

test.each(["week", "day", "month"] as const)(
  "the %s view hydrates the server's markup without a mismatch",
  async (view) => {
    const { errors, serverHtml } = await hydrate(view);
    expect(serverHtml).toContain("Weekly planning");
    // Both sides run in Node here, so they'd agree on these anyway. Chrome writes plain spaces.
    expect(serverHtml).not.toMatch(/[\u2009\u202F]/u);
    expect(errors).toEqual([]);
  },
);
