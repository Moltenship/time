import type { ChangeDetails, ChangeSource } from "@ui-sdk/core";
import { expectTypeOf, test } from "vite-plus/test";

import type {
  CalendarChangeReason,
  CalendarChangeSource,
  CalendarStateChangeDetail,
} from "../src/index";

// ui-sdk's details aren't our contract, so ours are declared; these fail when the two drift.
test("the change source names what ui-sdk reports", () => {
  expectTypeOf<CalendarChangeSource>().toEqualTypeOf<ChangeSource>();
});

test("ui-sdk's change details satisfy the fields the detail promises", () => {
  expectTypeOf<ChangeDetails<CalendarChangeReason>>().toExtend<
    Pick<CalendarStateChangeDetail<unknown>, "cancel" | "canceled" | "event" | "reason" | "source">
  >();
});
