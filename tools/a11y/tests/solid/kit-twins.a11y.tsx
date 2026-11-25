import { For } from "solid-js";
import { describe, expect, test } from "vite-plus/test";
import { server, userEvent } from "vite-plus/test/browser";

import { Badge } from "@registry/calendar-ui/badge";
import { Button } from "@registry/calendar-ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@registry/calendar-ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@registry/calendar-ui/tooltip";

import { describeTree, kitFixture, opened, popups } from "../kit-twins";
import buttonBadge from "../kit-twins/button-badge.txt?raw";
import selectClosed from "../kit-twins/select-closed.txt?raw";
import selectOpen from "../kit-twins/select-open.txt?raw";
import tooltipClosed from "../kit-twins/tooltip-closed.txt?raw";
import tooltipOpen from "../kit-twins/tooltip-open.txt?raw";
import { render, settled, until } from "./render";

// The Solid kit renders what React's renders (ADR 0279, point 10): `kit-twins.a11y.tsx` stores
// React's controls in `kit-twins/`, open and closed, and these render the Solid controls with the
// same props and compare. A difference is drift: fix the Solid control, or change both kits.

const root = () => document.querySelector('[data-testid="kit"]')!;
const container = () => root().parentElement!;

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("kit twins", () => {
  test("the button and the badge render React's", async () => {
    await render(() => (
      <div data-testid="kit">
        <Button size="sm" variant="outline">
          Save
        </Button>
        <Button disabled>Delete</Button>
        <Badge variant="outline">Busy</Badge>
      </div>
    ));
    expect(describeTree(root())).toBe(buttonBadge);
  });

  test("the tooltip renders React's, closed and open", async () => {
    await render(() => (
      <div data-testid="kit">
        <Tooltip delay={0}>
          <TooltipTrigger
            render={(trigger) => (
              <Button {...trigger} aria-label="Next period" size="icon" variant="ghost" />
            )}
          >
            Next
          </TooltipTrigger>
          <TooltipContent>Next period</TooltipContent>
        </Tooltip>
      </div>
    ));
    expect(describeTree(root())).toBe(tooltipClosed);

    await userEvent.hover(root().querySelector("button")!);
    await until(() => expect(opened(document.querySelector('[role="tooltip"]'))).toBe(true));
    await settled();
    expect(describeTree(root(), ...popups(container()))).toBe(tooltipOpen);
  });

  test("the select renders React's, closed and open", async () => {
    await render(() => (
      <div data-testid="kit">
        <Select items={kitFixture.items} onValueChange={() => {}} value={kitFixture.value}>
          <SelectTrigger aria-label="View">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectGroupLabel>Views</SelectGroupLabel>
              <For each={kitFixture.items}>
                {(item) => (
                  <SelectItem label={item.label} value={item.value}>
                    {item.label}
                  </SelectItem>
                )}
              </For>
            </SelectGroup>
            <SelectSeparator />
          </SelectContent>
        </Select>
      </div>
    ));
    expect(describeTree(root())).toBe(selectClosed);

    await userEvent.click(root().querySelector("button")!);
    await until(() => expect(opened(document.querySelector('[role="listbox"]'))).toBe(true));
    await settled();
    expect(describeTree(root(), ...popups(container()))).toBe(selectOpen);
  });
});
