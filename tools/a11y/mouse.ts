import type { BrowserCommand } from "vite-plus/test/node";

/** One step of the browser's own mouse, at a point in the test page's viewport. */
export type MouseStep =
  | { readonly type: "down" | "up" }
  | { readonly steps?: number; readonly type: "move"; readonly x: number; readonly y: number };

/**
 * Moves, presses or releases Playwright's mouse, which sends the page trusted pointer and mouse
 * events. The test page runs in an iframe, so its points are shifted by the frame's place on the
 * runner's page, and scaled as the runner scales the frame to fit a small window.
 */
export const mouse: BrowserCommand<[step: MouseStep]> = async (context, step) => {
  if (context.provider.name !== "playwright") throw new Error("mouse needs Playwright");
  const { page } = context as typeof context & { page: import("playwright").Page };
  if (step.type !== "move") {
    await page.mouse[step.type]();
    return;
  }
  const frame = await (
    context as typeof context & { frame(): Promise<import("playwright").Frame> }
  ).frame();
  const box = (await (await frame.frameElement()).boundingBox()) ?? { width: 0, x: 0, y: 0 };
  const width = await frame.evaluate(() => innerWidth);
  const scale = box.width > 0 && width > 0 ? box.width / width : 1;
  await page.mouse.move(box.x + step.x * scale, box.y + step.y * scale, {
    steps: step.steps ?? 1,
  });
};
