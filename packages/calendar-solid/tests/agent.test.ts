// @vitest-environment jsdom

import { createComponent } from "@solidjs/web";
import { createAgent, registerTools } from "@ui-sdk/solid/agent";
import { createSignal } from "solid-js";
import { afterEach, expect, test } from "vite-plus/test";

import { Rating, RatingStar } from "./fixtures/rating-parts";
import { mount, settled } from "./harness/render";
import "./setup";

interface Change {
  readonly value: number;
  readonly reason: string;
  readonly source: string;
}

// One bridge per file: it has no destroy, and it remembers components earlier tests removed.
const agent = createAgent();

function renderRating(refuseAgent: () => boolean) {
  const [value, setValue] = createSignal(1);
  const changes: Change[] = [];
  const view = mount(() =>
    createComponent(Rating, {
      "aria-label": "Satisfaction",
      get value() {
        return value();
      },
      onValueChange(next: number, details: { reason: string; source: string; cancel(): void }) {
        changes.push({ value: next, reason: details.reason, source: details.source });
        if (details.source === "agent" && refuseAgent()) details.cancel();
        else setValue(next);
      },
      get children() {
        return ["1", "2", "3"].map((star) =>
          createComponent(RatingStar, { value: star, "aria-label": `${star} stars` }),
        );
      },
    }),
  );
  return { changes, value, view };
}

afterEach(() => {
  Reflect.deleteProperty(document, "modelContext");
});

test("the bridge sees the primitive's name, state and actions", () => {
  renderRating(() => false);
  const entries = agent.snapshot().filter((entry) => !entry.offPage);
  expect(entries).toEqual([
    expect.objectContaining({ component: "rating", label: "Satisfaction", value: 1 }),
  ]);
  expect(entries[0]!.actions).toEqual(["rate"]);
});

test("an agent's change reaches the callback as the agent's, which can refuse it", async () => {
  let refuse = false;
  const { changes, value, view } = renderRating(() => refuse);

  const accepted = await agent.act({
    steps: [{ ref: "Satisfaction", action: "rate", args: [3] }],
  });
  expect(accepted.ok, accepted.error?.message).toBe(true);
  await settled();
  expect(value()).toBe(3);
  expect(changes.at(-1)).toEqual({ value: 3, reason: "item-press", source: "agent" });
  expect(view.container.querySelector('[aria-checked="true"]')!.getAttribute("aria-label")).toBe(
    "3 stars",
  );

  refuse = true;
  const refused = await agent.act({
    steps: [{ ref: "Satisfaction", action: "rate", args: [2] }],
  });
  // A cancelled change still counts as a step that ran.
  expect(refused.ok).toBe(true);
  await settled();
  expect(changes.at(-1)).toEqual({ value: 2, reason: "item-press", source: "agent" });
  expect(value()).toBe(3);
  expect(agent.snapshot().find((entry) => !entry.offPage)).toMatchObject({ value: 3 });
});

test("registerTools registers the three tools with WebMCP, and its cleanup removes them", async () => {
  renderRating(() => false);
  type Tool = { name: string; execute: (input: object) => unknown };
  const tools = new Map<string, Tool>();
  const signals: AbortSignal[] = [];
  Object.assign(document, {
    modelContext: {
      registerTool: async (tool: Tool, options?: { signal?: AbortSignal }) => {
        tools.set(tool.name, tool);
        if (options?.signal) signals.push(options.signal);
      },
    },
  });

  const unregister = registerTools(agent, { allow: () => true });
  await settled();
  expect([...tools.keys()].sort()).toEqual(["act", "query", "snapshot"]);
  const snapshot = (await tools.get("snapshot")!.execute({})) as unknown;
  expect(JSON.stringify(snapshot)).toContain("Satisfaction");

  unregister();
  await settled();
  // It unregisters by aborting the signal it registered each tool with, not with unregisterTool.
  expect(signals).toHaveLength(3);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

test("registerTools does nothing without WebMCP", () => {
  expect(() => registerTools(agent, { allow: () => true })()).not.toThrow();
});
