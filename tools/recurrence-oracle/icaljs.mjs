// The second oracle for generate.py: runs each case's rule through ical.js as a floating (or
// all-day) series and returns the wall times it gives. ical.js isn't a dependency of this
// repository; generate.py installs it in a temporary directory and passes its module path.
//
//   node tools/recurrence-oracle/icaljs.mjs <path to ical.js/dist/ical.js> < cases.json
//
// stdin: [{ id, kind: "floating" | "all-day", start, rule, before, limit }]
// stdout: [{ id, dates, complete } | { id, error, timedOut? }]
// Each case runs in its own worker, because ical.js loops forever on some rules.

import { pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const TIMEOUT_MS = 5000;
const CONCURRENCY = 4;

async function expand({ modulePath, testCase }) {
  const { default: ICAL } = await import(pathToFileURL(modulePath).href);
  const start =
    testCase.kind === "all-day"
      ? ICAL.Time.fromDateString(testCase.start)
      : ICAL.Time.fromDateTimeString(testCase.start);
  const iterator = ICAL.Recur.fromString(testCase.rule).iterator(start);
  const dates = [];
  while (dates.length < testCase.limit) {
    const next = iterator.next();
    if (!next) return { complete: true, dates };
    const text = next.toString();
    // ISO strings of one kind sort as their dates do.
    if (testCase.before !== null && text >= testCase.before) return { complete: true, dates };
    dates.push(text);
  }
  return { complete: false, dates };
}

function runInWorker(modulePath, testCase) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { modulePath, testCase } });
    const timer = setTimeout(() => {
      void worker.terminate();
      resolve({ error: `no result within ${TIMEOUT_MS / 1000} s`, timedOut: true });
    }, TIMEOUT_MS);
    worker.once("message", (result) => {
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      resolve({ error: error.message });
    });
  });
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const [modulePath] = process.argv.slice(2);
  if (modulePath === undefined) {
    process.stderr.write("usage: node icaljs.mjs <path to ical.js/dist/ical.js> < cases.json\n");
    process.exitCode = 2;
    return;
  }
  const cases = JSON.parse(await readStdin());
  const results = Array.from({ length: cases.length });
  let next = 0;
  const lane = async () => {
    while (next < cases.length) {
      const index = next;
      next += 1;
      const testCase = cases[index];
      results[index] = { id: testCase.id, ...(await runInWorker(modulePath, testCase)) };
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, lane));
  process.stdout.write(`${JSON.stringify(results)}\n`);
}

if (isMainThread) {
  await main();
} else {
  try {
    parentPort.postMessage(await expand(workerData));
  } catch (error) {
    parentPort.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
}
