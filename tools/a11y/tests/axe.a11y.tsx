import { describe, expect, test } from "vite-plus/test";

import { Dialog, DialogContent } from "@registry/ui/dialog";

import { seriousViolations } from "./axe";
import { render } from "./render";

describe("the axe gate", () => {
  test("still fails rules with known #97 exceptions anywhere else", async () => {
    await render(
      // A modal hides everything outside it, so the mislabelled button sits inside.
      <Dialog open>
        <DialogContent>
          <button aria-label="Close" type="button">
            Save
          </button>
        </DialogContent>
      </Dialog>,
    );
    const rules = (await seriousViolations()).map((violation) => violation.split(":")[0]);

    expect(rules).toEqual(
      expect.arrayContaining(["aria-dialog-name", "label-content-name-mismatch"]),
    );
  });
});
