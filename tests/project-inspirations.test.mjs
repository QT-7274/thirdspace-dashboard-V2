import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as esbuild from "esbuild";

async function loadVaultReader() {
  const tempDir = mkdtempSync(join(tmpdir(), "thirdspace-inspirations-"));
  const bundlePath = join(tempDir, "vault-reader.mjs");

  await esbuild.build({
    entryPoints: ["src/data/vault-reader.ts"],
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["obsidian"],
    logLevel: "silent",
  });

  return import(bundlePath);
}

test("project-inspirations.INSPIRATION_FIELDS.1 parse inspirations with timestamp and status", async () => {
  const {
    parseInspirationsFromMd,
  } = await loadVaultReader();

  const md = `
## thirdspace-dashboard

- [💡] 2026-07-09 11:30 · 热力图支持按项目筛选
- [🔍] 2026-07-08 16:00 · Acai 面板加快捷记灵感入口
`;

  const items = parseInspirationsFromMd(md);
  assert.equal(items.length, 2);
  assert.equal(items[0].project, "thirdspace-dashboard");
  assert.equal(items[0].status, "idea");
  assert.equal(items[0].timestamp, "2026-07-09 11:30");
  assert.equal(items[0].text, "热力图支持按项目筛选");
  assert.equal(items[1].status, "exploring");
});

test("project-inspirations.PROJECT_OPTIONS.1 collect project options from products acai and file", async () => {
  const { collectInspirationProjectOptions } = await loadVaultReader();

  const options = collectInspirationProjectOptions(
    [{ name: "site" }],
    ["api"],
    [{ project: "custom-app", status: "idea", timestamp: "2026-07-09 10:00", text: "x" }],
  );

  assert.deepEqual(options, ["api", "custom-app", "site"]);
});

test("project-inspirations.INSPIRATION_FIELDS.2 cycle inspiration status in order", async () => {
  const { cycleInspirationStatus } = await loadVaultReader();

  assert.equal(cycleInspirationStatus("idea"), "exploring");
  assert.equal(cycleInspirationStatus("exploring"), "adopted");
  assert.equal(cycleInspirationStatus("adopted"), "discarded");
  assert.equal(cycleInspirationStatus("discarded"), "idea");
});

test("project-inspirations.QUICK_CAPTURE.3 inspirations live in project markdown file", async () => {
  const {
    PROJECT_INSPIRATIONS_PATH,
    formatInspirationLine,
  } = await loadVaultReader();

  assert.equal(PROJECT_INSPIRATIONS_PATH, "04-项目/project-inspirations.md");
  assert.equal(
    formatInspirationLine({ status: "idea", timestamp: "2026-07-09 11:30", text: "demo" }),
    "- [💡] 2026-07-09 11:30 · demo",
  );
});

test("project-inspirations.PANEL_RENDER.2 group inspirations by project newest first", async () => {
  const { groupInspirationsByProject } = await loadVaultReader();

  const groups = groupInspirationsByProject([
    { project: "a", status: "idea", timestamp: "2026-07-08 10:00", text: "old" },
    { project: "a", status: "idea", timestamp: "2026-07-09 10:00", text: "new" },
    { project: "b", status: "idea", timestamp: "2026-07-09 09:00", text: "other" },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].project, "a");
  assert.equal(groups[0].items[0].text, "new");
});

test("project-inspirations.PANEL_RENDER.1 bilingual inspirations panel hooks exist", () => {
  const viewSource = readFileSync("src/view.ts", "utf8");
  const styles = readFileSync("src/styles.css", "utf8");

  assert.match(viewSource, /项目灵感 · INSPIRATIONS/);
  assert.match(viewSource, /renderInspirations\(/);
  assert.match(viewSource, /showDiscardedInspirations/);
  assert.match(styles, /\.ts-insp-card/);
});
