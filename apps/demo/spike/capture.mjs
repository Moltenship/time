// SPIKE (motion customization research, not for merge). Captures each experiment: frames
// mid-animation at `slow`, and a real-speed video. node apps/demo/spike/capture.mjs <url> <outDir>
import { renameSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(
  fileURLToPath(new URL("../../../tools/a11y/package.json", import.meta.url)),
);
const { chromium } = require("playwright");
const [base = "http://localhost:5917/", out = "/tmp/motion-measure/custom"] = process.argv.slice(2);
const only = process.env.ONLY?.split(",");
const wanted = (name) => only === undefined || only.includes(name);
const viewport = { width: 1280, height: 800 };

async function open(context, spike, slow) {
  const page = await context.newPage();
  await page.goto(`${base}?view=week&spike=${spike}&slow=${slow}`);
  await page.locator('[data-slot="calendar-event"]').first().waitFor();
  await page.waitForTimeout(800);
  // A tall timed event in view, so it has a two-line title.
  const chip = page
    .locator('[role="gridcell"] [data-slot="calendar-event"]')
    .filter({ has: page.locator(".line-clamp-2") });
  const count = await chip.count();
  for (let i = 0; i < count; i++) {
    const box = await chip.nth(i).boundingBox();
    if (box && box.height > 60 && box.y > 200 && box.y + box.height < viewport.height - 40) {
      return { box, chip: chip.nth(i), page };
    }
  }
  throw new Error("no tall event in view");
}

async function frames(page, name, times) {
  const start = Date.now();
  for (const t of times) {
    const wait = t - (Date.now() - start);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.screenshot({ path: `${out}/${name}-${String(t).padStart(4, "0")}.png` });
  }
}

const browser = await chromium.launch();
const results = {};

for (const spike of ["card-motion", "card-layoutid", "card-dialog", "card-vt"]) {
  if (!wanted(spike)) continue;
  const context = await browser.newContext({ viewport });
  const { chip, page } = await open(context, spike, 6);
  await chip.click({ noWaitAfter: true });
  await frames(page, spike, [60, 500, 1100, 1800, 3200]);
  results[spike] = await page.evaluate(() => {
    const popup = document.querySelector('[role="dialog"]');
    return {
      focusInPopup: popup?.contains(document.activeElement) ?? false,
      popupOpen: popup !== null,
      transform: popup ? getComputedStyle(popup).transform : null,
    };
  });
  await context.close();
}

for (const spike of ["drag-css", "drag-motion"]) {
  if (!wanted(spike)) continue;
  const context = await browser.newContext({ viewport });
  const { box, chip, page } = await open(context, spike, 1);
  const id = await chip.getAttribute("data-event-id");
  const x = box.x + box.width / 2;
  const y = box.y + 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 20, { steps: 4 });
  await page.waitForTimeout(250);
  await page.mouse.move(x + 190, y + 90, { steps: 6 });
  await page.screenshot({ path: `${out}/${spike}-moving.png` });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${spike}-held.png` });
  const ghost = await page.evaluate(() => {
    const g = document.querySelector('[data-calendar-ghost="event"]');
    if (g === null) return null;
    const style = getComputedStyle(g);
    return { inlineTransform: g.style.transform, rotate: style.rotate, scale: style.scale };
  });
  await page.mouse.up();
  await page.waitForTimeout(90);
  await page.screenshot({ path: `${out}/${spike}-landing.png` });
  await page.waitForTimeout(700);
  const after = await page.evaluate(
    (eventId) =>
      document
        .querySelector(`[data-slot="calendar-event"][data-event-id="${CSS.escape(eventId)}"]`)
        ?.getBoundingClientRect()
        .toJSON(),
    id,
  );
  results[spike] = {
    ghost,
    moved: after ? { dx: Math.round(after.x - box.x), dy: Math.round(after.y - box.y) } : null,
  };
  await context.close();
}

// Real-speed videos: each card mode opens and closes twice, each drag mode drags once.
for (const spike of [
  "card-motion",
  "card-layoutid",
  "card-dialog",
  "card-vt",
  "drag-css",
  "drag-motion",
]) {
  if (!wanted(spike)) continue;
  const context = await browser.newContext({
    recordVideo: { dir: `${out}/video`, size: viewport },
    viewport,
  });
  const { box, chip, page } = await open(context, spike, 1);
  if (spike.startsWith("card-")) {
    for (let i = 0; i < 2; i++) {
      await chip.click();
      await page.waitForTimeout(1100);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
  } else {
    const x = box.x + box.width / 2;
    const y = box.y + 12;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 30, y + 20, { steps: 6 });
    await page.waitForTimeout(200);
    await page.mouse.move(x + 190, y + 90, { steps: 25 });
    await page.waitForTimeout(500);
    await page.mouse.move(x + 10, y + 150, { steps: 25 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(1000);
  }
  const video = page.video();
  await context.close();
  renameSync(await video.path(), `${out}/video/${spike}.webm`);
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
