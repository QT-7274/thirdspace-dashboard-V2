import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as esbuild from "esbuild";

async function loadAcaiClient() {
  const tempDir = mkdtempSync(join(tmpdir(), "thirdspace-acai-client-"));
  const bundlePath = join(tempDir, "acai-client.mjs");

  await esbuild.build({
    entryPoints: ["src/data/acai-client.ts"],
    outfile: bundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
    plugins: [{
      name: "obsidian-stub",
      setup(build) {
        build.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
        build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export async function requestUrl() { return {}; }", loader: "js" }));
      },
    }],
  });

  return import(`file://${bundlePath}`);
}

test("dashboard-experience-refinement.ACAI_SYNC.1 deduplicates and sorts discovered ACAI Products", async () => {
  const { collectAcaiProductNames } = await loadAcaiClient();

  assert.deepEqual(
    collectAcaiProductNames({
      implementations: [
        { product_name: "tef-cli", implementation_name: "main", implementation_id: "1" },
        { product_name: "edgeone-pages-console", implementation_name: "dev", implementation_id: "2" },
        { product_name: "tef-cli", implementation_name: "release", implementation_id: "3" },
        { product_name: "", implementation_name: "ignored", implementation_id: "4" },
      ],
    }),
    ["edgeone-pages-console", "tef-cli"],
  );
});
