import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as esbuild from "esbuild";

async function loadKeyboardUtils() {
  const tempDir = mkdtempSync(join(tmpdir(), "thirdspace-keyboard-"));
  const bundlePath = join(tempDir, "keyboard.mjs");

  await esbuild.build({
    entryPoints: ["src/utils/keyboard.ts"],
    outfile: bundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
  });

  return import(`file://${bundlePath}`);
}

test("shouldSubmitOnEnter ignores IME composition Enter", async () => {
  const { shouldSubmitOnEnter } = await loadKeyboardUtils();

  assert.equal(shouldSubmitOnEnter({ key: "Enter", isComposing: true }), false);
  assert.equal(shouldSubmitOnEnter({ key: "Enter", keyCode: 229 }), false);
  assert.equal(shouldSubmitOnEnter({ key: "Enter" }, true), false);
});

test("shouldSubmitOnEnter accepts normal Enter only", async () => {
  const { shouldSubmitOnEnter } = await loadKeyboardUtils();

  assert.equal(shouldSubmitOnEnter({ key: "a" }), false);
  assert.equal(shouldSubmitOnEnter({ key: "Enter" }), true);
});

test("shouldSubmitOnEnter can require Ctrl/Cmd+Enter for multiline inputs", async () => {
  const { shouldSubmitOnEnter } = await loadKeyboardUtils();

  assert.equal(shouldSubmitOnEnter({ key: "Enter" }, false, { requireModifier: true }), false);
  assert.equal(shouldSubmitOnEnter({ key: "Enter", ctrlKey: true }, false, { requireModifier: true }), true);
  assert.equal(shouldSubmitOnEnter({ key: "Enter", metaKey: true }, false, { requireModifier: true }), true);
});
