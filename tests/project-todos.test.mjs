import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as esbuild from "esbuild";

async function loadProjectTodos() {
  const tempDir = mkdtempSync(join(tmpdir(), "thirdspace-project-todos-"));
  const bundlePath = join(tempDir, "project-todos.mjs");

  await esbuild.build({
    entryPoints: ["src/utils/project-todos.ts"],
    outfile: bundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
  });

  return import(`file://${bundlePath}`);
}

test("project-centered-dashboard.PROJECT_CENTER.6 keeps distinct legacy project todos", async () => {
  const { deduplicateProjectTodos } = await loadProjectTodos();

  assert.deepEqual(
    deduplicateProjectTodos([
      { text: "重复任务", taskId: "ts-1" },
      { text: "重复任务", taskId: "ts-1" },
      { text: "重复任务" },
      { text: "重复任务" },
    ]),
    [
      { text: "重复任务", taskId: "ts-1" },
      { text: "重复任务" },
      { text: "重复任务" },
    ],
  );
});
