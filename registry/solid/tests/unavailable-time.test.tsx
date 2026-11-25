// @vitest-environment jsdom

import type { ClosedTime } from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";

import { UnavailableTime } from "../calendar/unavailable-time";
import { render, settled } from "./render";

const date = Temporal.PlainDate.from("2026-10-10");

test("a custom render gets the band's new props when the band changes", async () => {
  const [band, setBand] = createSignal<ClosedTime>({
    opensAfter: false,
    opensBefore: true,
    reason: "closed-day",
  });
  const { container } = await render(() => (
    <UnavailableTime
      band={band()}
      class=""
      date={date}
      end={1}
      render={(props) => <div {...props} data-custom="" />}
      resource={null}
      slot="month-closed"
      start={0}
    />
  ));
  const shade = () => container.querySelector("[data-custom]");
  expect(shade()?.hasAttribute("data-opens-before")).toBe(true);

  setBand({ label: "Offsite", opensAfter: true, opensBefore: false, reason: "exception" });
  await settled();
  expect(shade()?.hasAttribute("data-opens-before")).toBe(false);
  expect(shade()?.hasAttribute("data-opens-after")).toBe(true);
  expect(shade()?.getAttribute("data-label")).toBe("Offsite");
});
