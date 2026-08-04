# Dashboard Experience Refinement Design

**Date:** 2026-08-04  
**Status:** approved design; implementation pending user review

## Goal

Improve four dashboard workflows without replacing the Markdown-first data model:

1. Discover ACAI Products from the configured server and let users enable them from settings.
2. Register every newly enabled ACAI Product as a formal Vault project.
3. Show project-scoped bugs as a first-class view of Todo items.
4. Replace broken and inconsistent truncated-list controls with a shared expand-all/collapse pattern.

## Decisions

| Area | Decision |
| --- | --- |
| ACAI selection | The user clicks a manual sync action, then checks Products to enable. |
| Product registration | Enabling a Product creates a formal project entry when none exists. New entries go under `🟢 进行中`, use a readable name derived from the Product slug, and set milestone to `待补充`. |
| Unchecking | Unchecking stops ACAI tracking only. It never removes the project from `product-status.md`. |
| Bug model | A bug is a Todo with an exact `#bug` tag and a project tag. It keeps normal Todo completion, due-date, and source-file behavior. |
| Project layout | Expanded project cards use three columns: TODO, BUG, and INSPIRATIONS. ACAI remains full width below them. Narrow screens stack these sections. |
| Project assignment | Assigned Todos show a clickable project Chip. Unassigned Todos show a `+` assignment trigger only on row hover. |
| Truncated lists | Every affected list uses `展开全部（+N）` followed by `收起`; it never opens a source file as a substitute for expansion. |

## ACAI Product Sync

### Settings state

Keep `acaiProducts` as the persisted selected Product list for backward compatibility. Add cached discovery metadata to settings:

- `acaiAvailableProducts`: deduplicated Product names from the last successful sync.
- `acaiProductsLastSyncedAt`: optional sync timestamp for display only.

Existing comma-separated `acaiProducts` values migrate as selected entries. Users do not need to reconfigure existing tracking.

### Fetch and cache

The plugin calls `GET /api/v1/implementations` without `product_name`. The endpoint already returns implementation entries with `product_name`; the client deduplicates and sorts those names.

The settings screen exposes a `同步项目` action. It requires a configured ACAI token. While it runs, the action is disabled and reports progress. A successful result replaces the discovery cache. A failed result preserves the previous cache and shows an actionable error. The screen never clears selected Products because a sync failed.

### Enable transaction

Checking a Product runs this sequence:

1. Read `04-项目/product-status.md`.
2. If the Product has no matching project ID or ACAI Product mapping, create a project record under `## 🟢 进行中`.
3. Write the registry file. If it is missing, create the standard three-status scaffold first.
4. Only after the registry write succeeds, persist the selected ACAI Product and refresh the dashboard.

The registry writer is idempotent. Repeated syncs, checks, or plugin reloads never create duplicate records. If the write fails, the checkbox reverts and the plugin shows a Notice. The dashboard therefore never represents a Product as enabled while its required project registry entry is absent.

Readable names are derived deterministically from Product slugs. For example, `edgeone-pages-console` becomes `Edgeone Pages Console`; users may later edit the Markdown display name.

## Project Bug View

### Classification

Todo parsing adds a derived `isBug` flag for exact normalized tag `bug`. Existing Todo parsing, project-tag validation, task-pool updates, and worklog synchronization remain unchanged.

Project card counts use this partition:

- `tasks`: incomplete project Todos that are not bugs.
- `bugs`: incomplete project Todos that are bugs.
- `inspirations`: non-discarded project inspirations.

A bug appears once in a project card, inside BUG rather than TODO. It still appears in time views when its date or scope qualifies; overdue bugs keep the overdue treatment.

### Layout and actions

An expanded project card renders these desktop panes in one row:

1. TODO, with `+ 添加任务`.
2. BUG, with `+ 记录 Bug`.
3. INSPIRATIONS, with `+ 记灵感`.

ACAI renders below the panes across the card width. On narrow screens, the panes stack in that order.

`+ 记录 Bug` opens the existing Todo modal with the current project preselected and `#bug` prefilled. Completed bugs remain in their source Markdown but disappear from the default incomplete BUG list and summary count.

## Todo Project Assignment

Replace the always-visible `<select>` in existing Todo rows with a compact control:

- Assigned Todo: show a project Chip. Selecting it opens the existing project option set.
- Unassigned Todo: show no assignment control at rest. Show a small `+` trigger when its row receives hover or keyboard focus.
- Invalid/multiple project tags: retain the existing title/Notice warning and use the compact control to repair the assignment.

The new control delegates to the same `updateTodoProject` path. A failed update restores the previous project value and communicates the failure. It must stop propagation so assignment does not open the source file row action.

## Expandable Lists

### Coverage

The shared behavior applies to every list that intentionally limits visible entries:

- Today’s pending Todos.
- Overdue Todos.
- All Upcoming groups: overdue, week, month, custom date, and long term.
- Project-card TODO, BUG, and INSPIRATIONS lists.

Each list retains its current initial display limit. If items remain hidden, it shows `展开全部（+N）`. Expanding shows all items and changes the control to `收起`. Collapsing returns to that list’s initial limit.

### State and interaction

Expanded state is keyed by list scope, project ID where applicable, section, and active project filter. One list’s expansion cannot affect another. Refreshing task data or changing the project filter resets the affected keys to their default collapsed state.

The control is a real button. Its click handler stops propagation, updates view state, and re-renders. Todo rows keep their existing click-to-open-source behavior.

This replaces two faulty patterns:

- Overdue `+x more` currently opens the task-pool file instead of expanding.
- Today `+x more` currently opens the worklog instead of expanding.

Project TODO and inspiration lists currently truncate without any control; the new shared behavior makes hidden entries discoverable.

## Specification Changes

Update ACAI specs before implementation:

- Add a dedicated refinement feature for ACAI discovery/cache, idempotent project registration, bug projection, compact assignment controls, and expand/collapse behavior.
- Update `project-centered-dashboard` only where new project-card counts/layout extend its existing requirements.
- Preserve `work-todo-board.PAGINATION.1` and `work-todo-board.PAGINATION.2` as historical ACIDs, mark them deprecated, and add replacement requirements for expand-all/collapse behavior. Do not renumber existing ACIDs.

Implementation comments and tests will reference every new ACID directly.

## Error Handling

| Failure | Result |
| --- | --- |
| Missing ACAI token | Disable sync with clear setup guidance. |
| ACAI request failure | Keep cached Products and selected Products unchanged; show the endpoint error. |
| Empty ACAI response | Show an empty discovery state; do not change current selections. |
| Registry write failure | Revert the Product checkbox and do not persist selection. |
| Todo project update failure | Restore the old Chip/control value and show a Notice. |
| Invalid project tags | Preserve current warning behavior; allow the compact selector to repair the task. |

## Verification

Automated tests will cover:

- ACAI Product discovery, de-duplication, cache retention, and legacy selected-Product migration.
- Project registry scaffold creation, deterministic default entry fields, and idempotent re-registration.
- Exact `#bug` classification, project summary counts, bug modal defaults, and non-duplication between TODO and BUG panes.
- Compact project assignment rendering and update rollback.
- `展开全部 / 收起` behavior for each covered list, especially overdue tasks.

Before handoff, run the project test suite, build the plugin, and copy built artifacts to:

`/Users/shizheng/Documents/BlinkLLMWiki-Release-v1.0/.obsidian/plugins/thirdspace-dashboard`

Then synchronize ACAI specs and ACID references with `acai push --all`.
