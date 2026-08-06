import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("dashboard-experience-refinement.ACAI_SYNC.4 settings use manual Product names", () => {
  const source = readFileSync("src/main.ts", "utf8");

  assert.match(source, /setName\("Products to Track"\)/);
  assert.match(source, /setValue\(this\.plugin\.settings\.acaiProducts\)/);
  assert.doesNotMatch(source, /acaiAvailableProducts: string\[\]/);
  assert.doesNotMatch(source, /acaiRepoUri: string/);
  assert.doesNotMatch(source, /acaiBranchName: string/);
  assert.doesNotMatch(source, /fetchAllAcaiProducts/);
  assert.doesNotMatch(source, /registerAcaiProduct/);
  assert.doesNotMatch(source, /setName\("同步 ACAI 项目"\)/);
  assert.doesNotMatch(source, /setName\("ACAI Repo URI"\)/);
  assert.doesNotMatch(source, /setName\("ACAI Branch"\)/);
});
