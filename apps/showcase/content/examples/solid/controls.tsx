// The Controls page's example: each control of the kit, in a component of the app's own.

// #region controls
import { createSignal, For } from "solid-js";

import { Badge } from "@/components/calendar/ui/badge";
import { Button } from "@/components/calendar/ui/button";
import { ChevronRightIcon } from "@/components/calendar/ui/icons";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/calendar/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/calendar/ui/tooltip";

const rooms = [
  { label: "Room A", value: "a" },
  { label: "Room B", value: "b" },
  { label: "Room C", value: "c" },
];

export function Controls() {
  const [room, setRoom] = createSignal("a");

  return (
    <div class="flex flex-wrap items-center gap-3 p-4">
      {/* A click that returns a promise marks the button pending until it settles. */}
      <Button onClick={() => new Promise((resolve) => setTimeout(resolve, 800))}>Save</Button>
      <Button variant="outline">Cancel</Button>

      <Tooltip>
        <TooltipTrigger
          render={(trigger) => (
            <Button {...trigger} aria-label="Next week" size="icon" variant="ghost" />
          )}
        >
          <ChevronRightIcon />
        </TooltipTrigger>
        <TooltipContent>Next week</TooltipContent>
      </Tooltip>

      <Select items={rooms} onValueChange={setRoom} value={room()}>
        <SelectTrigger aria-label="Room">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <For each={rooms} keyed={(option) => option.value}>
              {(option) => (
                <SelectItem label={option().label} value={option().value}>
                  {option().label}
                </SelectItem>
              )}
            </For>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Badge variant="outline">Booked</Badge>
    </div>
  );
}
// #endregion controls
