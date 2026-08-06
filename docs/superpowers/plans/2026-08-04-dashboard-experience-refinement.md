# Dashboard Experience Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync and formally register ACAI Products, show project Bugs as Todos, compact project assignment, and make every truncated task list expandable.

**Architecture:** Markdown remains authoritative. `acai-client.ts` discovers remote Product names; `vault-reader.ts` owns idempotent registry updates and Bug classification; settings and dashboard views compose those helpers. `view.ts` owns one keyed expand-state mechanism shared by all list surfaces.

**Tech Stack:** TypeScript, Obsidian Plugin API, esbuild, Node test runner, ACAI CLI.

---

## File map

| File | Change |
| --- | --- |
| `features/thirdspace/dashboard-experience-refinement.feature.yaml` | New acceptance criteria. |
| `features/thirdspace/work-todo-board.feature.yaml` | Deprecate batch-pagination requirements. |
| `src/data/acai-client.ts` | List and normalize all ACAI Products. |
| `src/data/vault-reader.ts` | Product registry writer and exact Bug detection. |
| `src/main.ts` | Cache Product discovery and render settings controls. |
| `src/view.ts` | Render Bug pane, project controls, expandable lists. |
| `src/utils/pagination.ts` | Compute default versus expanded visible count. |
| `src/styles.css` | Layout and interaction styles. |
| `tests/acai-project-sync.test.mjs` | ACAI normalizer and settings integration tests. |
| `tests/vault-reader.test.mjs` | Registry and Bug tests. |
| `tests/pagination.test.mjs` | Expand/collapse helper tests. |
| `tests/view-source.test.mjs` | UI regression hooks. |

## ACIDs

Create `dashboard-experience-refinement.feature.yaml` with these requirements:

- `ACAI_SYNC.1`: 设置页通过 ACAI implementations 接口手动同步 Product，去重排序后缓存最近一次成功结果。
- `ACAI_SYNC.2`: ACAI 同步失败、无 Token 或空结果不会清除已缓存 Product 或已启用 Product，并向用户显示可操作的错误信息。
- `ACAI_SYNC.3`: 用户勾选 ACAI Product 时，插件在保存启用状态前将其幂等登记为正式项目；取消勾选不删除项目主表记录。
- `PROJECT_REGISTRATION.1`: 缺失 `04-项目/product-status.md` 时，插件创建包含进行中、观察中、已暂停三个区段的项目主表。
- `PROJECT_REGISTRATION.2`: 新登记项目写入进行中区段，使用由 Product slug 推导的展示名称、Product 作为项目标识和 ACAI Product、`待补充` 作为里程碑。
- `BUG_VIEW.1`: Todo 的精确标准化 `bug` 标签表示 Bug，项目卡片中的 Bug 不与普通 TODO 重复显示。
- `BUG_VIEW.2`: 项目摘要显示未完成 Bug 数，展开卡片显示 TODO、BUG、INSPIRATIONS 三栏，记录 Bug 操作预填当前项目和 `bug` 标签。
- `PROJECT_ASSIGNMENT.1`: 已归属 Todo 显示可编辑项目 Chip；未归属 Todo 只在悬停或键盘焦点时显示项目分配触发器。
- `EXPANDABLE_LISTS.1`: 今日、逾期、Upcoming 分组、项目 TODO、项目 BUG 和项目灵感在有隐藏项时均提供展开全部和收起。
- `EXPANDABLE_LISTS.2`: 展开状态按视图、项目、分组和项目筛选独立保存；筛选或任务数据刷新后重置受影响列表。

Mark `work-todo-board.PAGINATION.1` and `.2` as deprecated, retain their original requirement text, and add notes that `dashboard-experience-refinement.EXPANDABLE_LISTS.1` replaces batch expansion. Never renumber old ACIDs.

### Task 1: Add and validate specifications

**Files:**

- Create: `features/thirdspace/dashboard-experience-refinement.feature.yaml`
- Modify: `features/thirdspace/work-todo-board.feature.yaml`

- [ ] Inspect `git diff -- features/thirdspace/work-todo-board.feature.yaml` first, because it already has unrelated local edits. Preserve them.
- [ ] Write the new feature spec with the ten ACIDs above and Chinese `description`/`requirement` values.
- [ ] Convert old pagination requirements to this exact compatible shape:

```yaml
1:
  requirement: scoped todo 分组存在隐藏任务时，`+x more` 必须作为可点击控件继续展示下一批隐藏任务。
  deprecated: true
  note: 已由 dashboard-experience-refinement.EXPANDABLE_LISTS.1 的展开全部和收起行为替代。
```

- [ ] Run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && ACAI=/Users/shizheng/.nvm/versions/node/v22.16.0/bin/acai && $ACAI push dashboard-experience-refinement` and `git diff --check -- features/thirdspace`. Expected: valid local spec and no whitespace errors. If ACAI is unavailable, keep the local spec and capture the exact connection failure.
- [ ] Commit only the in-scope spec hunks: `git commit -m "spec: dashboard refine"`.

### Task 2: Add Product discovery and registry domain APIs

**Files:**

- Modify: `src/data/acai-client.ts`
- Modify: `src/data/vault-reader.ts`
- Create: `tests/acai-project-sync.test.mjs`
- Modify: `tests/vault-reader.test.mjs`

- [ ] Before touching `parseProducts`, `parseTodosFromMd`, or `updateTodoProject`, run GitNexus upstream impact for all three symbols. Stop for HIGH or CRITICAL risk and report the result.
- [ ] Add a failing Product normalizer test:

```js
assert.deepEqual(
  collectAcaiProductNames({ implementations: [
    { product_name: "tef-cli", implementation_name: "main", implementation_id: "1" },
    { product_name: "edgeone-pages-console", implementation_name: "dev", implementation_id: "2" },
    { product_name: "tef-cli", implementation_name: "release", implementation_id: "3" },
  ] }),
  ["edgeone-pages-console", "tef-cli"],
);
```

- [ ] Implement these exports in `src/data/acai-client.ts`:

```ts
export function collectAcaiProductNames(data: AcaiImplementationsData | null): string[] {
  return Array.from(new Set((data?.implementations ?? [])
    .map(item => item.product_name?.trim())
    .filter((name): name is string => Boolean(name))))
    .sort((left, right) => left.localeCompare(right));
}

export async function fetchAllAcaiProducts(baseUrl: string, token: string): Promise<string[]> {
  return collectAcaiProductNames(await requestAcaiData<AcaiImplementationsData>(
    `${baseUrl}/api/v1/implementations`, token, "implementations",
  ));
}
```

- [ ] Add failing and then passing tests for `isBugTodo`, `formatProjectDisplayName`, and `ensureAcaiProductRegisteredInMd`. Required assertions:

```js
assert.equal(isBugTodo({ tags: ["bug"] }), true);
assert.equal(isBugTodo({ tags: ["bugfix"] }), false);
assert.equal(isBugTodo({ tags: ["Bug"] }), true);
assert.match(ensureAcaiProductRegisteredInMd("", "tef-cli"), /## 🟢 进行中/);
assert.equal(ensureAcaiProductRegisteredInMd(registered, "tef-cli"), registered);
```

- [ ] Add `PRODUCT_STATUS_PATH`, `formatProjectDisplayName`, `isBugTodo`, `ensureAcaiProductRegisteredInMd`, and `registerAcaiProduct` beside existing Product helpers. Registry insertion must add this block once under `## 🟢 进行中`:

```md
### Tef Cli
- 项目标识：tef-cli
- ACAI Product：tef-cli
- 当前里程碑：待补充
```

`registerAcaiProduct` calls `vault.create` for a missing file, otherwise `vault.modify` only when content changes.
- [ ] Run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && node --test tests/acai-project-sync.test.mjs tests/vault-reader.test.mjs`; expected: PASS.
- [ ] Commit with `git commit -m "feat: discover acai products"`.

### Task 3: Replace manual Product configuration with sync and checks

**Files:**

- Modify: `src/main.ts`
- Modify: `tests/acai-project-sync.test.mjs`

- [ ] Run GitNexus upstream impact for `ThirdSpaceSettings`, `parseProductNames`, `ThirdSpaceDashboard.loadSettings`, and `ThirdSpaceSettingTab.display` before editing.
- [ ] Add a failing source test for `acaiAvailableProducts`, `fetchAllAcaiProducts`, `registerAcaiProduct`, and a `同步项目` button; assert the old `Products to Track` textarea no longer renders.
- [ ] Extend persistent settings:

```ts
acaiAvailableProducts: string[];
acaiProductsLastSyncedAt?: number;
```

Default the cache to `[]` in `DEFAULT_SETTINGS`; in `loadSettings`, coerce non-array legacy values to `[]` while keeping legacy comma-separated `acaiProducts` as selected names.
- [ ] In the settings tab, add a sync button which disables while requesting. On success save the cache and timestamp; on failure retain the existing cache and show `new Notice(...)`.
- [ ] Render cached Products as checkboxes. Checking awaits `registerAcaiProduct` before serializing selection back to `acaiProducts`. Failure restores the checkbox. Unchecking only removes selected tracking and never changes the Markdown registry.
- [ ] Run `node --test tests/acai-project-sync.test.mjs` under Node 22; expected: PASS. Commit with `git commit -m "feat: sync acai settings"`.

### Task 4: Replace batch pagination with keyed expand/collapse state

**Files:**

- Modify: `src/utils/pagination.ts`
- Modify: `src/view.ts`
- Modify: `tests/pagination.test.mjs`
- Modify: `tests/view-source.test.mjs`

- [ ] Run GitNexus upstream impact for `renderTodos`, `renderScopedTodos`, and `renderOverdueTodos` before editing.
- [ ] Replace batch-count tests with a failing test for:

```js
assert.equal(getVisibleCount(8, 17, false), 8);
assert.equal(getVisibleCount(8, 17, true), 17);
assert.equal(getRemainingCount(17, getVisibleCount(8, 17, false)), 9);
```

- [ ] Replace `getNextVisibleCount` with:

```ts
export function getVisibleCount(defaultVisible: number, total: number, expanded: boolean): number {
  return expanded ? total : Math.min(defaultVisible, total);
}
```

- [ ] Replace `scopedVisibleCounts` in `DashboardView` with `expandedListKeys = new Set<string>()`; add `isListExpanded`, `resetExpandableLists`, and `renderListToggle`.
- [ ] `renderListToggle` must create `<button class="ts-todo-more">`; display `展开全部（+${remaining}）` before expansion and `收起` after it; stop propagation; toggle state; invoke `void this.render()`.
- [ ] Apply it to Today (`today:<filter>`), overdue (`overdue:<filter>`), each Upcoming section (`upcoming:<filter>:<section>`), project TODO (`project:<id>:todos`), project Bugs (`project:<id>:bugs`), and project inspirations (`project:<id>:inspirations`). Reset state after a Todo data refresh and after project-filter changes.
- [ ] Remove both current `ts-todo-more` handlers that open source files. Row clicks continue to open their source files.
- [ ] Assert the shared toggle API and the absence of `ts-todo-more` + `openFile(getTaskPoolPath())` coupling in `tests/view-source.test.mjs`. Run `node --test tests/pagination.test.mjs tests/view-source.test.mjs` under Node 22; expected: PASS.
- [ ] Commit with `git commit -m "fix: expand dashboard lists"`.

### Task 5: Add Bug pane and compact project assignment controls

**Files:**

- Modify: `src/view.ts`
- Modify: `src/styles.css`
- Modify: `tests/view-source.test.mjs`

- [ ] Run GitNexus upstream impact for `TodoModal.onOpen`, `renderProjectCenter`, `renderProjectTodoList`, and `renderProjectSelector` before editing.
- [ ] Extend `TodoModal` to accept `defaultTags: string[] = []`; preselect those tags during `onOpen`. Change the Bug action to call `openTodoModal(project.id, ["bug"])`.
- [ ] Import `isBugTodo`. Partition open project tasks as `!isBugTodo(item)` for TODO and `isBugTodo(item)` for BUG. Count each partition independently; render BUG between TODO and INSPIRATIONS and never duplicate a Bug in TODO.
- [ ] Reuse `renderProjectTodoList(parent, items, listKey)` for both panes; add `+ 记录 Bug` to the Bug header.
- [ ] Replace `renderProjectSelector` row `<select>` with `renderProjectAssignmentControl`. An assigned task renders `.ts-project-chip`; an unassigned task renders `.ts-project-assign-trigger` with `+`. Populate an Obsidian `Menu` with every project and `未归属`; keep the existing `updateTodoProject` rollback and `stopPropagation` behavior.
- [ ] Add source assertions for `isBugTodo(item)`, `text: "BUG"`, `openTodoModal(project.id, ["bug"])`, `ts-project-chip`, and `ts-project-assign-trigger`.
- [ ] Style three desktop project columns, a red Bug pane treatment, the Chip, and the hover/focus trigger. Preserve the existing mobile one-column media rule and visible keyboard focus.
- [ ] Run `node --test tests/view-source.test.mjs` under Node 22; expected: PASS. Commit with `git commit -m "feat: project bugs"`.

### Task 6: Full validation, deployment, and ACAI synchronization

**Files:**

- Verify: all changed files
- Deploy: `/Users/shizheng/Documents/BlinkLLMWiki-Release-v1.0/.obsidian/plugins/thirdspace-dashboard/main.js`
- Deploy: `/Users/shizheng/Documents/BlinkLLMWiki-Release-v1.0/.obsidian/plugins/thirdspace-dashboard/main.css`

- [ ] Run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm test`; expected: all tests PASS.
- [ ] Run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npm run build`; expected: `main.js` and `main.css` build without errors.
- [ ] Copy `main.js` and `main.css` to the Vault plugin directory listed above.
- [ ] Run GitNexus `detect_changes` with `scope: "all"`, then `git diff --check` and `git status --short`. Stage only planned hunks because the worktree already contains unrelated modifications.
- [ ] Commit any remaining in-scope files with `git commit -m "feat: dashboard experience"`.
- [ ] Run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && ACAI=/Users/shizheng/.nvm/versions/node/v22.16.0/bin/acai && $ACAI push --all`. If remote synchronization fails, report the exact failure after leaving verified local commits and deployed artifacts intact.

## Plan self-review

- Every confirmed design requirement maps to a task: ACAI sync/registration in Tasks 2–3, Bugs and compact project controls in Task 5, list behavior in Task 4, and build/deployment in Task 6.
- All planned helper names are defined before their consumers: `collectAcaiProductNames`, `fetchAllAcaiProducts`, `isBugTodo`, `ensureAcaiProductRegisteredInMd`, `registerAcaiProduct`, `getVisibleCount`, and `renderListToggle`.
- The plan uses no destructive Git operation and explicitly protects unrelated dirty files.
