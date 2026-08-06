import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as esbuild from "esbuild";

async function loadAcaiImplementations() {
  const tempDir = mkdtempSync(join(tmpdir(), "thirdspace-acai-implementations-"));
  const bundlePath = join(tempDir, "acai-implementations.mjs");

  await esbuild.build({
    entryPoints: ["src/utils/acai-implementations.ts"],
    outfile: bundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
  });

  return import(`file://${bundlePath}`);
}

test("dashboard-experience-refinement.ACAI_COMPLETED_BRANCHES.1 partitions only fully completed implementations", async () => {
  const { partitionAcaiImplementations } = await loadAcaiImplementations();
  const implementation = (name, features) => ({
    impl: { implementation_name: name },
    features: { features },
  });

  const result = partitionAcaiImplementations([
    implementation("complete", [
      { completed_count: 2, total_count: 2 },
      { completed_count: 1, total_count: 1 },
    ]),
    implementation("partial", [{ completed_count: 1, total_count: 2 }]),
    implementation("empty-acids", [{ completed_count: 0, total_count: 0 }]),
    implementation("empty-features", []),
  ]);

  assert.deepEqual(result.completed.map(item => item.impl.implementation_name), ["complete"]);
  assert.deepEqual(result.current.map(item => item.impl.implementation_name), ["partial", "empty-acids"]);
});

test("dashboard-experience-refinement.ACAI_COMPLETED_BRANCHES.2 renders completed implementations in a collapsed disclosure", () => {
  const viewSource = readFileSync("src/view.ts", "utf8");

  assert.match(viewSource, /createEl\("details", \{ cls: "ts-acai-completed-impls" \}\)/);
  assert.match(viewSource, /已隐藏.*已完成分支/);
  assert.match(viewSource, /disclosure\.open = this\.acaiExpandedKeys\.has\(disclosureKey\)/);
  assert.match(viewSource, /renderAcaiImplementationSection/);
});
