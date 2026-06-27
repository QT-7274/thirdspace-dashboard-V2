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
- [ ] 整理插件 Todo 需求 #插件 #task/scope-week 📆 2026-06-15 到 2026-06-21 ^ts-week-1
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
      taskId: "ts-week-1",
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

test("work-todo-board.COMPATIBILITY.1 isWorkTodo matches only the exact 工作 tag", async () => {
  const { isWorkTodo } = await loadVaultReader();

  assert.equal(isWorkTodo({ tags: ["工作"] }), true);
  assert.equal(isWorkTodo({ tags: ["项目", "工作"] }), true);
  assert.equal(isWorkTodo({ tags: ["工作流"] }), false);
  assert.equal(isWorkTodo({ tags: ["项目"] }), false);
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

test("parseTodosFromMd extracts task ids without polluting todo text", async () => {
  const { parseTodosFromMd } = await loadVaultReader();

  assert.deepEqual(parseTodosFromMd("## 今日Todo\n- [ ] 注册 linkin #学习 ^ts-week-1\n"), [
    { text: "注册 linkin", done: false, tags: ["学习"], taskId: "ts-week-1" },
  ]);
});

test("work-todo-board.TAG_DISPLAY.2 parseTodosFromMd extracts tags from today's todo title", async () => {
  const { parseTodosFromMd } = await loadVaultReader();

  assert.deepEqual(parseTodosFromMd("## 今日Todo\n- [ ] edgeone pages 控制台发布 #工作\n"), [
    { text: "edgeone pages 控制台发布", done: false, tags: ["工作"] },
  ]);
});

test("setTaskPoolTodoDoneInMd updates the linked source task by id", async () => {
  const { setTaskPoolTodoDoneInMd } = await loadVaultReader();
  const md = "## 本周\n- [ ] 注册 linkin #学习 #task/scope-week ^ts-week-1\n";

  const checked = setTaskPoolTodoDoneInMd(md, "ts-week-1", true, "2026-06-21");
  assert.equal(checked, "## 本周\n- [x] 注册 linkin #学习 #task/scope-week ^ts-week-1 ✅ 2026-06-21\n");

  const unchanged = setTaskPoolTodoDoneInMd(md, "missing", true, "2026-06-21");
  assert.equal(unchanged, md);
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
