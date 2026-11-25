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

import { describeTree, kitFixture, opened, popups } from "./kit-twins";
import { render, until } from "./render";

// React's kit renders what `kit-twins/` stores, and `solid/kit-twins.a11y.tsx` checks the Solid
// kit renders the same (ADR 0279, point 10). React's run writes the files, with `-u` on a change.

const root = () => document.querySelector('[data-testid="kit"]')!;
const container = () => root().parentElement!;

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("kit twins", () => {
  test("the button and the badge", async () => {
    await render(
      <div data-testid="kit">
        <Button size="sm" variant="outline">
          Save
        </Button>
        <Button disabled>Delete</Button>
        <Badge variant="outline">Busy</Badge>
      </div>,
    );
    await expect(describeTree(root())).toMatchFileSnapshot("./kit-twins/button-badge.txt");
  });

  test("the tooltip, closed and open", async () => {
    await render(
      <div data-testid="kit">
        <Tooltip delay={0}>
          <TooltipTrigger render={<Button aria-label="Next period" size="icon" variant="ghost" />}>
            Next
          </TooltipTrigger>
          <TooltipContent>Next period</TooltipContent>
        </Tooltip>
      </div>,
    );
    await expect(describeTree(root())).toMatchFileSnapshot("./kit-twins/tooltip-closed.txt");

    await userEvent.hover(root().querySelector("button")!);
    await until(() => expect(opened(document.querySelector('[role="tooltip"]'))).toBe(true));
    await expect(describeTree(root(), ...popups(container()))).toMatchFileSnapshot(
      "./kit-twins/tooltip-open.txt",
    );
  });

  test("the select, closed and open", async () => {
    await render(
      <div data-testid="kit">
        <Select items={kitFixture.items} onValueChange={() => {}} value={kitFixture.value}>
          <SelectTrigger aria-label="View">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectGroupLabel>Views</SelectGroupLabel>
              {kitFixture.items.map((item) => (
                <SelectItem key={item.value} label={item.label} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
          </SelectContent>
        </Select>
      </div>,
    );
    await expect(describeTree(root())).toMatchFileSnapshot("./kit-twins/select-closed.txt");

    await userEvent.click(root().querySelector("button")!);
    await until(() => expect(opened(document.querySelector('[role="listbox"]'))).toBe(true));
    await expect(describeTree(root(), ...popups(container()))).toMatchFileSnapshot(
      "./kit-twins/select-open.txt",
    );
  });
});
