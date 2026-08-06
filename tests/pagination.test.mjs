import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as esbuild from "esbuild";

async function loadPaginationUtils() {
  const tempDir = mkdtempSync(join(tmpdir(), "thirdspace-pagination-"));
  const bundlePath = join(tempDir, "pagination.mjs");

  await esbuild.build({
    entryPoints: ["src/utils/pagination.ts"],
    outfile: bundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
  });

  return import(`file://${bundlePath}`);
}

test("getNextVisibleCount expands by one batch without exceeding total", async () => {
  const { getNextVisibleCount } = await loadPaginationUtils();

  assert.equal(getNextVisibleCount(4, 11), 8);
  assert.equal(getNextVisibleCount(8, 11), 11);
  assert.equal(getNextVisibleCount(11, 11), 11);
});

test("getRemainingCount reports hidden items after current batch", async () => {
  const { getRemainingCount } = await loadPaginationUtils();

  assert.equal(getRemainingCount(11, 4), 7);
  assert.equal(getRemainingCount(11, 8), 3);
  assert.equal(getRemainingCount(11, 11), 0);
});

test("dashboard-experience-refinement.EXPANDABLE_LISTS.1 computes collapsed and expanded counts", async () => {
  const { getVisibleCount, getRemainingCount } = await loadPaginationUtils();

  assert.equal(getVisibleCount(8, 17, false), 8);
  assert.equal(getVisibleCount(8, 17, true), 17);
  assert.equal(getRemainingCount(17, getVisibleCount(8, 17, false)), 9);
  assert.equal(getRemainingCount(17, getVisibleCount(8, 17, true)), 0);
});
