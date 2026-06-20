import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as esbuild from "esbuild";

async function loadVaultReader() {
  const tempDir = mkdtempSync(join(tmpdir(), "thirdspace-vault-reader-"));
  const bundlePath = join(tempDir, "vault-reader.mjs");

  await esbuild.build({
    entryPoints: ["src/data/vault-reader.ts"],
    outfile: bundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
    external: ["obsidian"],
  });

  return import(`file://${bundlePath}`);
}

test("formatScopedTodoLine stores scope, tags, and custom date in markdown", async () => {
  const { formatScopedTodoLine } = await loadVaultReader();

  const line = formatScopedTodoLine({
    text: "发布 Todo 改造",
    scope: "custom",
    tags: ["插件", "项目"],
    dueDate: "2026-06-30",
  });

  assert.equal(
    line,
    "- [ ] 发布 Todo 改造 #插件 #项目 #task/scope-custom 📅 2026-06-30",
  );
});

test("parseScopedTodosFromMd returns only unchecked tasks grouped by section", async () => {
  const { parseScopedTodosFromMd } = await loadVaultReader();

  const items = parseScopedTodosFromMd(`## 本周
- [ ] 整理插件 Todo 需求 #插件 #task/scope-week 📆 2026-06-15 到 2026-06-21
- [x] 已完成的周任务 #task/scope-week ✅ 2026-06-18

## 本月
- [ ] 完成长期任务面板 #项目 #task/scope-month 📆 2026-06-01 到 2026-06-30

## 指定日期
- [ ] 发布第一版 Todo 改造 #插件 #task/scope-custom 📅 2026-06-30
`);

  assert.deepEqual(items, [
    {
      text: "整理插件 Todo 需求",
      done: false,
      scope: "week",
      tags: ["插件"],
      periodRange: "2026-06-15 到 2026-06-21",
    },
    {
      text: "完成长期任务面板",
      done: false,
      scope: "month",
      tags: ["项目"],
      periodRange: "2026-06-01 到 2026-06-30",
    },
    {
      text: "发布第一版 Todo 改造",
      done: false,
      scope: "custom",
      tags: ["插件"],
      dueDate: "2026-06-30",
    },
  ]);
});

test("formatScopedTodoLine stores real date ranges for week and month tasks", async () => {
  const { formatScopedTodoLine, getScopeDateRange } = await loadVaultReader();
  const baseDate = new Date("2026-06-18T12:00:00");

  assert.equal(getScopeDateRange("week", baseDate), "2026-06-15 到 2026-06-21");
  assert.equal(getScopeDateRange("month", baseDate), "2026-06-01 到 2026-06-30");
  assert.equal(
    formatScopedTodoLine({ text: "整理插件 Todo 需求", scope: "week", tags: ["插件"] }, baseDate),
    "- [ ] 整理插件 Todo 需求 #插件 #task/scope-week 📆 2026-06-15 到 2026-06-21",
  );
  assert.equal(
    formatScopedTodoLine({ text: "完成长期任务面板", scope: "month", tags: ["项目"] }, baseDate),
    "- [ ] 完成长期任务面板 #项目 #task/scope-month 📆 2026-06-01 到 2026-06-30",
  );
});

test("buildTaskPoolTemplate creates stable sections and first scoped task", async () => {
  const { buildTaskPoolTemplate } = await loadVaultReader();

  const md = buildTaskPoolTemplate({
    text: "研究 Obsidian Tasks 兼容",
    scope: "longterm",
    tags: ["插件"],
  });

  assert.match(md, /^# Tasks\n\n/);
  assert.match(md, /## 本周\n\n## 本月\n\n## 长期\n- \[ \] 研究 Obsidian Tasks 兼容 #插件 #task\/scope-longterm\n\n## 指定日期\n$/);
});

test("setTodoDoneInMd writes the requested target state", async () => {
  const { setTodoDoneInMd } = await loadVaultReader();

  const checked = setTodoDoneInMd(
    "## 今日Todo\n- [ ] 写插件 PR\n",
    { text: "写插件 PR", done: true },
    true,
    "2026-06-20",
  );
  assert.equal(checked, "## 今日Todo\n- [x] 写插件 PR ✅ 2026-06-20\n");

  const unchecked = setTodoDoneInMd(
    "## 今日Todo\n- [x] 写插件 PR ✅ 2026-06-20\n",
    { text: "写插件 PR", done: false },
    false,
    "2026-06-20",
  );
  assert.equal(unchecked, "## 今日Todo\n- [ ] 写插件 PR\n");
});

test("toggleTodoInWorklog skips vault.modify when no todo matches", async () => {
  const { toggleTodoInWorklog } = await loadVaultReader();
  const file = { path: "today.md" };
  let modifyCalls = 0;
  const app = {
    vault: {
      getAbstractFileByPath: () => file,
      read: async () => "## 今日Todo\n- [ ] 已存在任务\n",
      modify: async () => { modifyCalls += 1; },
    },
  };

  await toggleTodoInWorklog(app, { text: "不存在任务", done: false }, true);

  assert.equal(modifyCalls, 0);
});
