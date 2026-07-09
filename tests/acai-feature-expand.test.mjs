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

test("acai-feature-expand.ACID_STATUS_EDIT.2 failed status changes restore previous value and class", () => {
  const viewSource = readFileSync("src/view.ts", "utf8");

  assert.match(viewSource, /const previousValue = \(status \?\? ""\);/);
  assert.match(viewSource, /select\.value = previousValue;/);
  assert.match(viewSource, /select\.removeClass\(`ts-acai-status--\$\{nextStatus \?\? "unset"\}`\);/);
  assert.match(viewSource, /select\.addClass\(`ts-acai-status--\$\{status \?\? "unset"\}`\);/);
});

test("acai-feature-expand.CONTEXT_CACHE.1 feature context cache uses TTL", () => {
  const viewSource = readFileSync("src/view.ts", "utf8");

  assert.match(viewSource, /ACAI_CONTEXT_CACHE_TTL_MS/);
  assert.match(viewSource, /acaiContextCache/);
  assert.match(viewSource, /acaiContextRequests/);
});

test("acai-feature-expand.CONTEXT_CACHE.1 tracker refresh invalidates cached context when settings key changes", () => {
  const viewSource = readFileSync("src/view.ts", "utf8");

  assert.match(viewSource, /const productNames = parseProductNames\(acaiProducts\);/);
  assert.match(viewSource, /const currentKey = this\.getAcaiTrackerKey\(acaiBaseUrl, acaiApiToken, productNames\);/);
  assert.match(viewSource, /this\.acaiTrackerCache\.key !== currentKey/);
  assert.match(viewSource, /this\.acaiTrackerCache = null;/);
  assert.match(viewSource, /this\.acaiContextCache\.clear\(\);/);
  assert.match(viewSource, /this\.acaiContextRequests\.clear\(\);/);
  assert.match(viewSource, /this\.acaiExpandedKeys\.clear\(\);/);
  assert.match(viewSource, /const parent = host\.parentElement;/);
  assert.match(viewSource, /host\.remove\(\);/);
  assert.match(viewSource, /this\.renderAcaiTracker\(parent\);/);
});
