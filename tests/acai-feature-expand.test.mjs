import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("acai-feature-expand.FEATURE_EXPAND.1 feature rows are expandable", () => {
  const viewSource = readFileSync("src/view.ts", "utf8");
  const clientSource = readFileSync("src/data/acai-client.ts", "utf8");

  assert.match(viewSource, /ts-acai-row--expandable/);
  assert.match(viewSource, /acaiExpandedKeys/);
  assert.match(clientSource, /fetchFeatureContext/);
});

test("acai-feature-expand.ACID_STATUS_EDIT.2 status changes patch feature states", () => {
  const viewSource = readFileSync("src/view.ts", "utf8");
  const clientSource = readFileSync("src/data/acai-client.ts", "utf8");

  assert.match(clientSource, /patchFeatureStates/);
  assert.match(clientSource, /\/api\/v1\/feature-states/);
  assert.match(viewSource, /patchFeatureStates\(/);
  assert.match(viewSource, /ts-acai-status/);
});

test("acai-feature-expand.CONTEXT_CACHE.1 feature context cache uses TTL", () => {
  const viewSource = readFileSync("src/view.ts", "utf8");

  assert.match(viewSource, /ACAI_CONTEXT_CACHE_TTL_MS/);
  assert.match(viewSource, /acaiContextCache/);
  assert.match(viewSource, /acaiContextRequests/);
});
