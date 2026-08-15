import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const ESM_PATH = new URL("../dist/index.mjs", import.meta.url);
const RAW_BUDGET_BYTES = 16 * 1024;
const GZIP_BUDGET_BYTES = 4 * 1024;

const esm = await readFile(ESM_PATH);
const measurements = {
  gzipBytes: gzipSync(esm, { level: 9 }).byteLength,
  rawBytes: esm.byteLength,
};

console.log(
  `[calendar-temporal:size] raw=${measurements.rawBytes}/${RAW_BUDGET_BYTES} gzip=${measurements.gzipBytes}/${GZIP_BUDGET_BYTES}`,
);

if (measurements.rawBytes > RAW_BUDGET_BYTES || measurements.gzipBytes > GZIP_BUDGET_BYTES) {
  throw new RangeError("calendar-temporal-esm-size-budget-exceeded");
}
