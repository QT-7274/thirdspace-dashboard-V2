import type { App, TFile } from "obsidian";

// ── Local date helpers（讀系統時區，不硬編碼）────────────────────
// sv-SE locale 的格式恰好是 YYYY-MM-DD / HH:MM:SS，且跟隨系統時區
const _dateFmt = new Intl.DateTimeFormat("sv-SE");
const _tsFmt   = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

export function localDateStr(d: Date): string     { return _dateFmt.format(d); }             // "2026-05-27"
export function localDateCompact(d: Date): string { return _dateFmt.format(d).replace(/-/g,""); } // "20260527"
export function localTimestamp(d: Date): string   { return _tsFmt.format(d).replace(",",""); }    // "2026-05-27 14:30:00"

// ── Frontmatter date helpers ──────────────────────────────────
function parseFmDate(s: unknown): number {
  if (!s || typeof s !== "string") return 0;
  try { return new Date(s.replace(" ", "T")).getTime() || 0; } catch { return 0; }
}
function fileCreated(app: App, f: TFile): number {
  const fm = app.metadataCache.getFileCache(f)?.frontmatter;
  return parseFmDate(fm?.created) || f.stat.ctime || f.stat.mtime;
}
function fileModified(app: App, f: TFile): number {
  const fm = app.metadataCache.getFileCache(f)?.frontmatter;
  return parseFmDate(fm?.modified) || f.stat.mtime;
}

// ── Interfaces ───────────────────────────────────────────────
export interface WorkspaceEntry  { dir: string; skill: string; desc: string; }
export interface WorkspaceStats  { dir: string; icon: string; desc: string; fileCount: number; lastModified: number; }
export interface DailyActivity   { date: string; count: number; }
export interface TodoItem        { text: string; done: boolean; tags: string[]; dueDate?: string; periodRange?: string; taskId?: string; }
export type TaskScope            = "today" | "week" | "month" | "longterm" | "custom";
export interface ScopedTodoInput { text: string; scope: TaskScope; tags?: string[]; dueDate?: string; taskId?: string; }
export interface ScopedTodoItem  { text: string; done: boolean; scope: Exclude<TaskScope, "today">; tags: string[]; dueDate?: string; periodRange?: string; taskId?: string; }
export interface VaultStats      { total: number; thisWeek: number; thisMonth: number; activeDays: number; }
export interface WorklogEntry    { time: string; title: string; }
export interface TodayWorklog    { highlights: string[]; entries: WorklogEntry[]; }

// ── Skip rules ───────────────────────────────────────────────
// Use exact path-segment matching, not substring — prevents false positives
// on notes whose names happen to contain "INDEX", "README", etc.
const SKIP_DIRS  = new Set(["_legacy", ".thirdspace"]);
const SKIP_NAMES = new Set(["WORKSPACE", "AGENTS", "CLAUDE", "README", "INDEX"]);

function shouldSkip(f: TFile): boolean {
  const parts = f.path.split("/");
  if (parts.some(p => SKIP_DIRS.has(p))) return true;
  if (SKIP_NAMES.has(f.basename))         return true;
  return false;
}

// ── Constants ────────────────────────────────────────────────
const WORKSPACE_ICONS: Record<string, string> = {
  "00-系统": "⚙", "01-收件箱": "↓", "02-日记": "◈",
  "03-知识": "◎", "04-项目": "▲", "05-资源": "⬡",
  "06-输出": "→", "99-归档": "⊞",
};
const DEFAULT_WORKSPACES = [
  "00-系统","01-收件箱","02-日记","03-知识",
  "04-项目","05-资源","06-输出","99-归档",
];
const WEEKDAYS = ["日","一","二","三","四","五","六"];
const TASK_POOL_PATH = "00-系统/tasks.md";
const TASK_SCOPE_LABELS: Record<Exclude<TaskScope, "today">, string> = {
  week: "本周",
  month: "本月",
  longterm: "长期",
  custom: "指定日期",
};
const TASK_SCOPE_BY_LABEL: Record<string, Exclude<TaskScope, "today">> = {
  "本周": "week",
  "本月": "month",
  "长期": "longterm",
  "指定日期": "custom",
};
const WORK_TODO_TAG = "工作";

// ── Worklog path helper ──────────────────────────────────────
export function getTodayWorklogPath(): string {
  const now = new Date();
  const ymd = localDateCompact(now);
  return `02-日记/工作日志/${ymd}_工作日志_周${WEEKDAYS[now.getDay()]}.md`;
}

export function getTaskPoolPath(): string {
  return TASK_POOL_PATH;
}

// ── Workspace index ──────────────────────────────────────────
export async function loadWorkspaceIndex(app: App): Promise<WorkspaceEntry[] | null> {
  try {
    const content = await app.vault.adapter.read(".thirdspace/workspace-index.yaml");
    return parseWorkspaceYaml(content);
  } catch { return null; }
}

function parseWorkspaceYaml(content: string): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = [];
  let cur: Partial<WorkspaceEntry> | null = null;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("- dir:")) {
      if (cur?.dir) entries.push(cur as WorkspaceEntry);
      cur = { dir: line.replace("- dir:","").trim().replace(/['"]/g,""), skill:"", desc:"" };
    } else if (cur) {
      if (line.startsWith("skill:")) cur.skill = line.replace("skill:","").trim().replace(/['"]/g,"");
      if (line.startsWith("desc:"))  cur.desc  = line.replace("desc:","").trim().replace(/['"]/g,"");
    }
  }
  if (cur?.dir) entries.push(cur as WorkspaceEntry);
  return entries;
}

// ── Workspace stats ──────────────────────────────────────────
export async function getWorkspaceStats(app: App, dirs: string[]): Promise<WorkspaceStats[]> {
  const allFiles = app.vault.getMarkdownFiles();
  const targetDirs = dirs.length > 0 ? dirs : DEFAULT_WORKSPACES;
  return targetDirs.map(dir => {
    const files = allFiles.filter(f =>
      f.path.startsWith(dir+"/") &&
      !SKIP_DIRS.has(f.path.split("/")[1] ?? "")  // 只排除 _legacy/.thirdspace 子目录
    );
    const lastMod = files.reduce((m,f) => Math.max(m, fileModified(app, f)), 0);
    return { dir, icon: WORKSPACE_ICONS[dir] ?? "◇", desc: dir.replace(/^\d+-/,""), fileCount: files.length, lastModified: lastMod };
  });
}

// ── Activity ─────────────────────────────────────────────────
export async function getDailyActivity(app: App, days = 365): Promise<DailyActivity[]> {
  const cutoff = Date.now() - days * 86_400_000;
  const countMap: Record<string, number> = {};
  for (const f of app.vault.getMarkdownFiles()) {
    if (shouldSkip(f)) continue;
    const ts = fileCreated(app, f);
    if (ts < cutoff) continue;
    const date = localDateStr(new Date(ts));
    countMap[date] = (countMap[date] ?? 0) + 1;
  }
  return Object.entries(countMap).map(([date,count])=>({date,count})).sort((a,b)=>a.date.localeCompare(b.date));
}

export function getVaultStats(app: App): VaultStats {
  const files = app.vault.getMarkdownFiles().filter(f => !shouldSkip(f));
  const now = Date.now();
  const weekAgo = now - 7 * 86_400_000, monthAgo = now - 30 * 86_400_000;
  const daySet = new Set<string>();
  let week = 0, month = 0;
  for (const f of files) {
    const ts = fileCreated(app, f);
    if (ts > weekAgo)  week++;
    if (ts > monthAgo) month++;
    if (ts > now - 365 * 86_400_000) daySet.add(localDateStr(new Date(ts)));
  }
  return { total: files.length, thisWeek: week, thisMonth: month, activeDays: daySet.size };
}

export function getRecentFiles(app: App, days = 7) {
  const cutoff = Date.now() - days * 86_400_000;
  return app.vault.getMarkdownFiles()
    .filter(f => fileModified(app, f) > cutoff && !shouldSkip(f))
    .sort((a,b) => fileModified(app, b) - fileModified(app, a))
    .slice(0, 10)
    .map(f => ({ path: f.path, name: f.basename, workspace: f.path.split("/")[0]??"", mtime: fileModified(app, f) }));
}

// ── Products ─────────────────────────────────────────────────
export async function loadProductStatus(app: App): Promise<string | null> {
  try {
    const f = app.vault.getAbstractFileByPath("04-项目/product-status.md") as TFile|null;
    if (f) return await app.vault.read(f);
  } catch {}
  return null;
}

export function parseProducts(md: string): Array<{name:string; status:string; milestone:string}> {
  const results: Array<{name:string;status:string;milestone:string}> = [];
  let currentStatus = "unknown";
  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) {
      if (line.includes("🟢")) currentStatus = "active";
      else if (line.includes("🟡")) currentStatus = "watch";
      else if (line.includes("🔴") || line.includes("搁置") || line.includes("放弃")) currentStatus = "paused";
    }
    if (line.startsWith("### ")) results.push({ name: line.replace("### ","").trim(), status: currentStatus, milestone:"" });
    if (line.includes("当前里程碑") && results.length > 0) {
      const last = results[results.length-1];
      if (!last.milestone) last.milestone = line.replace(/.*：\s*/,"").trim().slice(0,45);
    }
  }
  return results.filter(p => p.status !== "unknown").slice(0, 6);
}

// ── Todos (from today's worklog ## 今日Todo) ─────────────────
export async function loadTodos(app: App): Promise<TodoItem[]> {
  try {
    const f = app.vault.getAbstractFileByPath(getTodayWorklogPath()) as TFile | null;
    if (!f) return [];
    const md = await app.vault.read(f);
    return parseTodosFromMd(md);
  } catch { return []; }
}

export function parseTodosFromMd(md: string): TodoItem[] {
  const items: TodoItem[] = [];
  let inTodoSection = false;
  for (const line of md.split("\n")) {
    if (line.startsWith("## 今日Todo")) { inTodoSection = true; continue; }
    if (line.startsWith("## ") && !line.startsWith("## 今日Todo")) { inTodoSection = false; }
    if (!inTodoSection) continue;
    const m = line.match(/^- \[( |x)\] (.+)/);
    if (m) {
      const parsed = parseTodoBody(m[2]);
      if (parsed.text) items.push({ ...parsed, done: m[1]==="x" });
    }
  }
  return items;
}

function normalizeTag(tag: string): string | null {
  const cleaned = tag.trim().replace(/^#/, "").replace(/\s+/g, "-");
  return cleaned ? cleaned : null;
}

function uniqueTags(tags: string[] = []): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

export function isWorkTodo(item: { tags?: string[] }): boolean {
  // work-todo-board.COMPATIBILITY.1
  return uniqueTags(item.tags).includes(WORK_TODO_TAG);
}

function isValidDueDate(dueDate: string | undefined): dueDate is string {
  return !!dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate);
}

function createTaskId(): string {
  return `ts-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseTaskId(text: string): string | undefined {
  return text.match(/(?:^|\s)\^(ts-[A-Za-z0-9_-]+)/)?.[1];
}

function stripTaskId(text: string): string {
  return text.replace(/(?:^|\s)\^ts-[A-Za-z0-9_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseTodoBody(body: string): Omit<TodoItem, "done"> {
  const taskId = parseTaskId(body);
  const dueDate = body.match(/📅\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  const periodRange = body.match(/📆\s*(\d{4}-\d{2}-\d{2}\s+到\s+\d{4}-\d{2}-\d{2})/)?.[1];
  const tags = Array.from(body.matchAll(/(?:^|\s)#([^\s#]+)/g))
    .map(match => match[1])
    .filter(tag => !tag.startsWith("task/scope-"));
  const text = body
    .replace(/✅\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/📅\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/📆\s*\d{4}-\d{2}-\d{2}\s+到\s+\d{4}-\d{2}-\d{2}/g, "")
    .replace(/(?:^|\s)#[^\s#]+/g, " ")
    .replace(/(?:^|\s)\^ts-[A-Za-z0-9_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    text,
    tags: uniqueTags(tags),
    ...(periodRange ? { periodRange } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(taskId ? { taskId } : {}),
  };
}

/** Match a parsed todo line against a TodoItem for deletion. */
function todoMatchesItem(parsed: Omit<TodoItem, "done">, item: TodoItem): boolean {
  // Strongest identifier: taskId
  if (item.taskId) return parsed.taskId === item.taskId;
  // Fallback: strict multi-field equality
  if (parsed.text !== item.text) return false;
  if ((parsed.dueDate ?? "") !== (item.dueDate ?? "")) return false;
  if ((parsed.periodRange ?? "") !== (item.periodRange ?? "")) return false;
  if (parsed.tags.length !== item.tags.length) return false;
  return parsed.tags.every(t => item.tags.includes(t));
}

// ── Overdue detection ────────────────────────────────────────
// todo-overdue-and-edge-cases.TIMEZONE.1
function getTodayStr(): string { return localDateStr(new Date()); }

/** Extract the end date from a "YYYY-MM-DD 到 YYYY-MM-DD" period range string. */
export function parsePeriodEnd(periodRange: string): string | null {
  const m = periodRange.match(/(\d{4}-\d{2}-\d{2})\s+到\s+(\d{4}-\d{2}-\d{2})/);
  return m ? m[2] : null;
}

// todo-overdue-and-edge-cases.OVERDUE_DETECTION.1 todo-overdue-and-edge-cases.OVERDUE_DETECTION.2 todo-overdue-and-edge-cases.OVERDUE_DETECTION.5
export function isTodoOverdue(item: { dueDate?: string; periodRange?: string; done?: boolean }): boolean {
  if (item.done) return false;
  const today = getTodayStr();
  // Check dueDate
  if (item.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) && item.dueDate < today) return true;
  // Check periodRange end date
  if (item.periodRange) {
    const end = parsePeriodEnd(item.periodRange);
    if (end && end < today) return true;
  }
  return false;
}

/** Split scoped todos into overdue and current (non-overdue) groups */
// todo-overdue-and-edge-cases.OVERDUE_DETECTION.4
export function categorizeScopedOverdue(items: ScopedTodoItem[]): { overdue: ScopedTodoItem[]; current: ScopedTodoItem[] } {
  const overdue: ScopedTodoItem[] = [];
  const current: ScopedTodoItem[] = [];
  for (const item of items) {
    if (isTodoOverdue(item)) overdue.push(item);
    else current.push(item);
  }
  return { overdue, current };
}

// ── Urgency sort ─────────────────────────────────────────────
// todo-overdue-and-edge-cases.URGENCY_SORT.1 todo-overdue-and-edge-cases.URGENCY_SORT.2
export function sortTodosByUrgency<T extends { done?: boolean; dueDate?: string; periodRange?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // Overdue first
    const aOverdue = !a.done && isTodoOverdue(a);
    const bOverdue = !b.done && isTodoOverdue(b);
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    // Then by dueDate ascending (undated last)
    const aDate = a.dueDate ?? parsePeriodEnd(a.periodRange ?? "") ?? "9999-99-99";
    const bDate = b.dueDate ?? parsePeriodEnd(b.periodRange ?? "") ?? "9999-99-99";
    if (aDate < bDate) return -1;
    if (aDate > bDate) return 1;
    return 0;
  });
}

export function getScopeDateRange(scope: TaskScope, baseDate = new Date()): string | undefined {
  const d = new Date(baseDate);
  d.setHours(0, 0, 0, 0);

  if (scope === "week") {
    const dow = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${localDateStr(start)} 到 ${localDateStr(end)}`;
  }

  if (scope === "month") {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${localDateStr(start)} 到 ${localDateStr(end)}`;
  }

  return undefined;
}

function formatTodayTodoText(input: { text: string; tags?: string[]; dueDate?: string; periodRange?: string; taskId?: string }): string {
  const tags = uniqueTags(input.tags);
  const tagText = tags.length ? ` ${tags.map(tag => `#${tag}`).join(" ")}` : "";
  const dateText = isValidDueDate(input.dueDate) ? ` 📅 ${input.dueDate}` : "";
  const rangeText = "periodRange" in input && input.periodRange ? ` 📆 ${input.periodRange}` : "";
  const idText = input.taskId ? ` ^${input.taskId}` : "";
  return `${input.text.trim()}${tagText}${rangeText}${dateText}${idText}`;
}

export function formatScopedTodoLine(input: ScopedTodoInput, baseDate = new Date()): string {
  const tags = uniqueTags([...(input.tags ?? []), `task/scope-${input.scope}`]);
  const tagText = tags.length ? ` ${tags.map(tag => `#${tag}`).join(" ")}` : "";
  const periodRange = getScopeDateRange(input.scope, baseDate);
  const rangeText = periodRange ? ` 📆 ${periodRange}` : "";
  const dateText = input.scope === "custom" && isValidDueDate(input.dueDate) ? ` 📅 ${input.dueDate}` : "";
  const idText = input.taskId ? ` ^${input.taskId}` : "";
  return `- [ ] ${input.text.trim()}${tagText}${rangeText}${dateText}${idText}`;
}

export function parseScopedTodosFromMd(md: string): ScopedTodoItem[] {
  const items: ScopedTodoItem[] = [];
  let scope: Exclude<TaskScope, "today"> | null = null;

  for (const rawLine of md.split("\n")) {
    const heading = rawLine.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      scope = TASK_SCOPE_BY_LABEL[heading[1]] ?? null;
      continue;
    }
    if (!scope) continue;

    const checkbox = rawLine.match(/^- \[( |x)\]\s+(.+)/);
    if (!checkbox) continue;
    const done = checkbox[1] === "x";
    if (done) continue;

    const body = checkbox[2];
    const taskId = parseTaskId(body);
    const dueDate = body.match(/📅\s*(\d{4}-\d{2}-\d{2})/)?.[1];
    const periodRange = body.match(/📆\s*(\d{4}-\d{2}-\d{2}\s+到\s+\d{4}-\d{2}-\d{2})/)?.[1];
    const tags = Array.from(body.matchAll(/(?:^|\s)#([^\s#]+)/g))
      .map(match => match[1])
      .filter(tag => !tag.startsWith("task/scope-"));
    const text = body
      .replace(/✅\s*\d{4}-\d{2}-\d{2}/g, "")
      .replace(/📅\s*\d{4}-\d{2}-\d{2}/g, "")
      .replace(/📆\s*\d{4}-\d{2}-\d{2}\s+到\s+\d{4}-\d{2}-\d{2}/g, "")
      .replace(/(?:^|\s)#[^\s#]+/g, " ")
      .replace(/(?:^|\s)\^ts-[A-Za-z0-9_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (text) items.push({
      text,
      done,
      scope,
      tags: uniqueTags(tags),
      ...(periodRange ? { periodRange } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...(taskId ? { taskId } : {}),
    });
  }

  return items;
}

export function buildTaskPoolTemplate(firstTask?: ScopedTodoInput): string {
  const scopedTask = firstTask && firstTask.scope !== "today" ? firstTask : null;
  const sections = (Object.keys(TASK_SCOPE_LABELS) as Array<Exclude<TaskScope, "today">>)
    .map(scopeKey => {
      const line = scopedTask?.scope === scopeKey ? `\n${formatScopedTodoLine(scopedTask)}` : "";
      return `## ${TASK_SCOPE_LABELS[scopeKey]}${line}`;
    });
  return `# Tasks\n\n${sections.join("\n\n")}\n`;
}

function ensureTaskPoolSections(md: string): string {
  const trimmed = md.trim();
  let next = trimmed ? md : "# Tasks\n";
  for (const label of Object.values(TASK_SCOPE_LABELS)) {
    if (!new RegExp(`^##\\s+${label}\\s*$`, "m").test(next)) {
      next = `${next.replace(/\s*$/, "")}\n\n## ${label}\n`;
    }
  }
  return next;
}

function insertScopedTodoIntoMd(md: string, input: ScopedTodoInput): string {
  if (input.scope === "today") return md;

  const label = TASK_SCOPE_LABELS[input.scope];
  const lines = ensureTaskPoolSections(md).split("\n");
  const secIdx = lines.findIndex(line => line.trim() === `## ${label}`);
  const newItem = formatScopedTodoLine(input);

  if (secIdx >= 0) {
    let insertAt = secIdx + 1;
    while (insertAt < lines.length && lines[insertAt].trim() === "") insertAt++;
    lines.splice(insertAt, 0, newItem);
  } else {
    lines.push("", `## ${label}`, newItem);
  }

  return `${lines.join("\n").replace(/\s*$/, "")}\n`;
}

function addTaskIdToScopedTodoInMd(md: string, item: ScopedTodoItem, taskId: string): string {
  const lines = md.split("\n");
  let scope: Exclude<TaskScope, "today"> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^##\s+(.+?)\s*$/);
    if (heading) {
      scope = TASK_SCOPE_BY_LABEL[heading[1]] ?? null;
      continue;
    }
    if (scope !== item.scope) continue;

    const checkbox = lines[i].match(/^- \[( |x)\]\s+(.+)/);
    if (!checkbox || checkbox[1] === "x") continue;
    if (parseTaskId(checkbox[2])) continue;

    const parsed = parseScopedTodosFromMd(`## ${TASK_SCOPE_LABELS[scope]}\n${lines[i]}`);
    const candidate = parsed[0];
    if (!candidate) continue;
    if (candidate.text !== item.text) continue;
    if ((candidate.periodRange ?? "") !== (item.periodRange ?? "")) continue;
    if ((candidate.dueDate ?? "") !== (item.dueDate ?? "")) continue;

    lines[i] = `${lines[i]} ^${taskId}`;
    break;
  }

  return lines.join("\n");
}

async function ensureScopedTodoId(app: App, item: ScopedTodoItem, taskId: string): Promise<void> {
  const f = app.vault.getAbstractFileByPath(TASK_POOL_PATH) as TFile | null;
  if (!f) return;
  const md = await app.vault.read(f);
  const next = addTaskIdToScopedTodoInMd(md, item, taskId);
  if (next !== md) await app.vault.modify(f, next);
}

export function setTaskPoolTodoDoneInMd(md: string, taskId: string, targetDone: boolean, doneDate: string): string {
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!new RegExp(`(?:^|\\s)\\^${taskId}(?:\\s|$)`).test(lines[i])) continue;
    if (targetDone) {
      const withoutDate = lines[i].replace(/ ✅ \d{4}-\d{2}-\d{2}/g, "");
      lines[i] = withoutDate.replace(/^- \[[ x]\]/, "- [x]") + ` ✅ ${doneDate}`;
    } else {
      lines[i] = lines[i].replace(/^- \[[ x]\]/, "- [ ]").replace(/ ✅ \d{4}-\d{2}-\d{2}/g, "");
    }
    break;
  }
  return lines.join("\n");
}

async function syncTaskPoolTodoDone(app: App, taskId: string, targetDone: boolean, doneDate: string): Promise<void> {
  const f = app.vault.getAbstractFileByPath(TASK_POOL_PATH) as TFile | null;
  if (!f) return;
  const md = await app.vault.read(f);
  const next = setTaskPoolTodoDoneInMd(md, taskId, targetDone, doneDate);
  if (next !== md) await app.vault.modify(f, next);
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  if (app.vault.getAbstractFileByPath(folderPath)) return;
  try { await app.vault.createFolder(folderPath); } catch {}
}

export async function loadScopedTodos(app: App): Promise<ScopedTodoItem[]> {
  try {
    const f = app.vault.getAbstractFileByPath(TASK_POOL_PATH) as TFile | null;
    if (!f) return [];
    const md = await app.vault.read(f);
    return parseScopedTodosFromMd(md);
  } catch { return []; }
}

export async function addScopedTodo(app: App, input: ScopedTodoInput): Promise<void> {
  const text = input.text.trim();
  if (!text) return;

  if (input.scope === "today") {
    await addTodoToWorklog(app, formatTodayTodoText({ ...input, text }));
    return;
  }

  const scopedInput = { ...input, text, taskId: input.taskId ?? createTaskId() };

  await ensureFolder(app, TASK_POOL_PATH.split("/").slice(0, -1).join("/"));
  let f = app.vault.getAbstractFileByPath(TASK_POOL_PATH) as TFile | null;
  if (!f) {
    f = await app.vault.create(TASK_POOL_PATH, buildTaskPoolTemplate(scopedInput));
    return;
  }

  const md = await app.vault.read(f);
  await app.vault.modify(f, insertScopedTodoIntoMd(md, scopedInput));
}

export async function addScopedTodoToToday(app: App, item: ScopedTodoItem): Promise<void> {
  const taskId = item.taskId ?? createTaskId();
  if (!item.taskId) await ensureScopedTodoId(app, item, taskId);
  await addTodoToWorklog(app, formatTodayTodoText({ ...item, taskId }));
}

export async function addTodoToWorklog(app: App, text: string): Promise<void> {
  const path = getTodayWorklogPath();
  let f = app.vault.getAbstractFileByPath(path) as TFile | null;
  if (!f) {
    const now = new Date();
    const ts  = localTimestamp(now);
    const wd  = WEEKDAYS[now.getDay()];
    const ds  = localDateStr(now);
    const tpl = `---\ntitle: "${ds} 周${wd} 工作日志"\ntype: "worklog"\ntopic: "work"\nworkspace: "02-日记"\ncreated: "${ts}"\nmodified: "${ts}"\ntags: ["worklog","work"]\nsource: "agent"\nstatus: "active"\n---\n# ${ds} 周${wd} 工作日志\n\n## 今日重点\n\n## 今日Todo\n\n## 重点记录\n\n## 关键决策\n\n## 明日计划\n`;
    f = await app.vault.create(path, tpl);
  }
  const md = await app.vault.read(f);
  const lines = md.split("\n");
  const secIdx = lines.findIndex(l => l.trim() === "## 今日Todo");
  const newItem = `- [ ] ${text}`;
  if (secIdx >= 0) {
    // insert right after the section header (skip blank lines)
    let insertAt = secIdx + 1;
    while (insertAt < lines.length && lines[insertAt].trim() === "") insertAt++;
    lines.splice(insertAt, 0, newItem);
  } else {
    lines.push("", "## 今日Todo", "", newItem, "");
  }
  await app.vault.modify(f, lines.join("\n"));
}

export function setTodoDoneInMd(md: string, item: TodoItem, targetDone: boolean, doneDate: string): string {
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- \[( |x)\] (.+)/);
    if (!m) continue;
    if (parseTodoBody(m[2]).text !== item.text) continue;

    if (targetDone) {
      const withoutDate = lines[i].replace(/ ✅ \d{4}-\d{2}-\d{2}/g, "");
      lines[i] = withoutDate.replace(/^- \[[ x]\]/, "- [x]") + ` ✅ ${doneDate}`;
    } else {
      lines[i] = lines[i].replace(/^- \[[ x]\]/, "- [ ]").replace(/ ✅ \d{4}-\d{2}-\d{2}/g,"");
    }
    break;
  }
  return lines.join("\n");
}

export async function toggleTodoInWorklog(app: App, item: TodoItem, targetDone = !item.done): Promise<void> {
  const path = getTodayWorklogPath();
  const f = app.vault.getAbstractFileByPath(path) as TFile | null;
  if (!f) return;
  const md = await app.vault.read(f);
  const today = localDateStr(new Date());
  const next = setTodoDoneInMd(md, item, targetDone, today);
  if (next !== md) {
    await app.vault.modify(f, next);
    if (item.taskId) await syncTaskPoolTodoDone(app, item.taskId, targetDone, today);
  }
}

export async function renameTodoInWorklog(app: App, item: TodoItem, newText: string): Promise<void> {
  const path = getTodayWorklogPath();
  const f = app.vault.getAbstractFileByPath(path) as TFile | null;
  if (!f) return;
  const md = await app.vault.read(f);
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(- \[[ x]\] )(.+)/);
    if (!m) continue;
    const parsed = parseTodoBody(m[2]);
    if (parsed.text !== item.text) continue;
    // 保留完成状态和 ✅ 日期
    const doneDate = m[2].match(/ ✅ \d{4}-\d{2}-\d{2}/)?.[0] ?? "";
    const tagText = parsed.tags.length ? ` ${parsed.tags.map(tag => `#${tag}`).join(" ")}` : "";
    const rangeText = parsed.periodRange ? ` 📆 ${parsed.periodRange}` : "";
    const dateText = parsed.dueDate ? ` 📅 ${parsed.dueDate}` : "";
    const idText = parsed.taskId ? ` ^${parsed.taskId}` : "";
    lines[i] = `${m[1]}${newText}${tagText}${rangeText}${dateText}${idText}${doneDate}`;
    await app.vault.modify(f, lines.join("\n"));
    return;
  }
}

// ── Today's worklog entries (## 重点记录) ────────────────────
export async function loadTodayWorklog(app: App): Promise<TodayWorklog | null> {
  try {
    const today = localDateStr(new Date()).replace(/-/g,"");
    const logFile = app.vault.getMarkdownFiles().find(f =>
      f.path.startsWith("02-日记/工作日志/") && f.basename.startsWith(today)
    );
    if (!logFile) return null;
    const md = await app.vault.read(logFile);
    const highlights = parseHighlights(md);
    const entries    = parseWorklogEntries(md);
    if (!highlights.length && !entries.length) return null;
    return { highlights, entries };
  } catch { return null; }
}

/** 读取 ## 今日重点 下的非空行（去掉 Markdown 格式符） */
export function parseHighlights(md: string): string[] {
  const lines: string[] = [];
  let inSection = false;
  for (const line of md.split("\n")) {
    if (line.startsWith("## 今日重点")) { inSection = true; continue; }
    if (line.startsWith("## ") && !line.startsWith("## 今日重点")) { inSection = false; continue; }
    if (!inSection) continue;
    const t = line.replace(/^[-*]\s+/, "").replace(/\*\*(.*?)\*\*/g, "$1").trim();
    if (t) lines.push(t.slice(0, 90));
  }
  return lines.slice(0, 3);
}

/** 读取 ## 重点记录 下的 ### HH:MM — 标题 条目（只要时间+标题，不要 body） */
export function parseWorklogEntries(md: string): WorklogEntry[] {
  const entries: WorklogEntry[] = [];
  let inSection = false;
  for (const line of md.split("\n")) {
    if (line.startsWith("## 重点记录")) { inSection = true; continue; }
    if (line.startsWith("## ") && !line.startsWith("## 重点记录")) { inSection = false; continue; }
    if (!inSection) continue;
    const h3 = line.match(/^###\s+(\d{1,2}:\d{2})\s*[—\-–]\s*(.+)/);
    if (h3) entries.push({ time: h3[1], title: h3[2].trim() });
  }
  return entries.slice(0, 5);
}

// ── Cross-day carry-over ─────────────────────────────────────
// todo-overdue-and-edge-cases.CROSS_DAY_CARRYOVER.1 todo-overdue-and-edge-cases.CROSS_DAY_CARRYOVER.4
export async function loadCarryOverTodos(app: App): Promise<TodoItem[]> {
  const todayStr = localDateStr(new Date());
  // Find the most recent previous worklog that has unchecked todos
  const candidates = app.vault.getMarkdownFiles()
    .filter(f =>
      f.path.startsWith("02-日记/工作日志/") &&
      !f.path.includes(todayStr.replace(/-/g, "")) // exclude today's worklog
    )
    .sort((a, b) => b.basename.localeCompare(a.basename)) // most recent first
    .slice(0, 5); // cap worst-case reads

  for (const f of candidates) {
    try {
      const md = await app.vault.read(f);
      const todos = parseTodosFromMd(md);
      const unchecked = todos.filter(t => !t.done);
      if (unchecked.length > 0) return unchecked;
    } catch { continue; }
  }
  return [];
}

// todo-overdue-and-edge-cases.CROSS_DAY_CARRYOVER.4
export async function addCarryOverTodoToToday(app: App, item: TodoItem): Promise<void> {
  await addTodoToWorklog(app, formatTodayTodoText(item));
}

// todo-overdue-and-edge-cases.TODO_DELETE.1
export async function deleteTodoFromWorklog(app: App, item: TodoItem): Promise<void> {
  const path = getTodayWorklogPath();
  const f = app.vault.getAbstractFileByPath(path) as TFile | null;
  if (!f) return;
  const md = await app.vault.read(f);
  const lines = md.split("\n");
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- \[( |x)\] (.+)/);
    if (!m) continue;
    if (!todoMatchesItem(parseTodoBody(m[2]), item)) continue;
    lines.splice(i, 1);
    changed = true;
    break;
  }
  if (changed) await app.vault.modify(f, lines.join("\n"));
}

// ── Project Inspirations ─────────────────────────────────────
export const PROJECT_INSPIRATIONS_PATH = "04-项目/project-inspirations.md";

export type InspirationStatus = "idea" | "exploring" | "adopted" | "discarded";

export const INSPIRATION_STATUS_ORDER: InspirationStatus[] = [
  "idea", "exploring", "adopted", "discarded",
];

export const INSPIRATION_STATUS_META: Record<InspirationStatus, { emoji: string; label: string }> = {
  idea: { emoji: "💡", label: "新想法" },
  exploring: { emoji: "🔍", label: "探索中" },
  adopted: { emoji: "✅", label: "已采纳" },
  discarded: { emoji: "🗑️", label: "已放弃" },
};

const INSPIRATION_EMOJI_TO_STATUS = Object.fromEntries(
  Object.entries(INSPIRATION_STATUS_META).map(([status, meta]) => [meta.emoji, status]),
) as Record<string, InspirationStatus>;

export interface InspirationItem {
  project: string;
  status: InspirationStatus;
  timestamp: string;
  text: string;
}

const INSPIRATION_LINE_RE = /^- \[(💡|🔍|✅|🗑️)\] (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · (.+)$/;

export function formatInspirationTimestamp(d = new Date()): string {
  return localTimestamp(d).slice(0, 16);
}

export function formatInspirationLine(
  item: Pick<InspirationItem, "status" | "timestamp" | "text">,
): string {
  const emoji = INSPIRATION_STATUS_META[item.status].emoji;
  return `- [${emoji}] ${item.timestamp} · ${item.text}`;
}

export function parseInspirationsFromMd(md: string): InspirationItem[] {
  const items: InspirationItem[] = [];
  let currentProject = "";

  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) {
      currentProject = line.replace(/^##\s+/, "").trim();
      continue;
    }
    if (!currentProject) continue;

    const match = line.match(INSPIRATION_LINE_RE);
    if (!match) continue;

    const status = INSPIRATION_EMOJI_TO_STATUS[match[1]];
    if (!status) continue;

    items.push({
      project: currentProject,
      status,
      timestamp: match[2],
      text: match[3].trim(),
    });
  }

  return items;
}

export function groupInspirationsByProject(
  items: InspirationItem[],
): Array<{ project: string; items: InspirationItem[] }> {
  const groups = new Map<string, InspirationItem[]>();
  for (const item of items) {
    const list = groups.get(item.project) ?? [];
    list.push(item);
    groups.set(item.project, list);
  }

  return Array.from(groups.entries()).map(([project, projectItems]) => ({
    project,
    items: projectItems.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  }));
}

export function collectInspirationProjectOptions(
  products: Array<{ name: string }>,
  acaiProducts: string[],
  inspirations: InspirationItem[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  };

  for (const product of products) add(product.name);
  for (const product of acaiProducts) add(product);
  for (const item of inspirations) add(item.project);

  return result.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function cycleInspirationStatus(status: InspirationStatus): InspirationStatus {
  const index = INSPIRATION_STATUS_ORDER.indexOf(status);
  return INSPIRATION_STATUS_ORDER[(index + 1) % INSPIRATION_STATUS_ORDER.length];
}

export function inspirationMatchesItem(a: InspirationItem, b: InspirationItem): boolean {
  return a.project === b.project
    && a.timestamp === b.timestamp
    && a.text === b.text
    && a.status === b.status;
}

function findProjectSectionRange(lines: string[], project: string): { start: number; end: number } | null {
  const header = `## ${project}`;
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === header) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }

  return { start, end };
}

function replaceInspirationLine(
  lines: string[],
  item: InspirationItem,
  nextLine: string,
): boolean {
  const range = findProjectSectionRange(lines, item.project);
  if (!range) return false;

  const currentLine = formatInspirationLine(item);
  for (let i = range.start + 1; i < range.end; i++) {
    if (lines[i] === currentLine) {
      lines[i] = nextLine;
      return true;
    }
  }
  return false;
}

export async function ensureProjectInspirationsFile(app: App): Promise<TFile> {
  const existing = app.vault.getAbstractFileByPath(PROJECT_INSPIRATIONS_PATH) as TFile | null;
  if (existing) return existing;

  const folder = app.vault.getAbstractFileByPath("04-项目");
  if (!folder) await app.vault.createFolder("04-项目");

  return app.vault.create(
    PROJECT_INSPIRATIONS_PATH,
    "# 项目灵感 Project Inspirations\n\n",
  );
}

export async function loadProjectInspirations(app: App): Promise<InspirationItem[]> {
  try {
    const f = app.vault.getAbstractFileByPath(PROJECT_INSPIRATIONS_PATH) as TFile | null;
    if (!f) return [];
    return parseInspirationsFromMd(await app.vault.read(f));
  } catch {
    return [];
  }
}

export async function addProjectInspiration(
  app: App,
  project: string,
  text: string,
  status: InspirationStatus = "idea",
): Promise<void> {
  const trimmedProject = project.trim();
  const trimmedText = text.trim();
  if (!trimmedProject || !trimmedText) return;

  const f = await ensureProjectInspirationsFile(app);
  const lines = (await app.vault.read(f)).split("\n");
  const line = formatInspirationLine({
    status,
    timestamp: formatInspirationTimestamp(),
    text: trimmedText,
  });

  const range = findProjectSectionRange(lines, trimmedProject);
  if (!range) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== "") lines.push("");
    lines.push(`## ${trimmedProject}`, "", line);
  } else {
    let insertAt = range.end;
    while (insertAt > range.start + 1 && lines[insertAt - 1].trim() === "") insertAt--;
    lines.splice(insertAt, 0, line);
  }

  await app.vault.modify(f, lines.join("\n"));
}

export async function updateInspirationStatus(
  app: App,
  item: InspirationItem,
  status: InspirationStatus,
): Promise<void> {
  const f = app.vault.getAbstractFileByPath(PROJECT_INSPIRATIONS_PATH) as TFile | null;
  if (!f) return;

  const lines = (await app.vault.read(f)).split("\n");
  const nextLine = formatInspirationLine({ ...item, status });
  if (!replaceInspirationLine(lines, item, nextLine)) return;
  await app.vault.modify(f, lines.join("\n"));
}

export async function renameProjectInspiration(
  app: App,
  item: InspirationItem,
  newText: string,
): Promise<void> {
  const trimmed = newText.trim();
  if (!trimmed) return;

  const f = app.vault.getAbstractFileByPath(PROJECT_INSPIRATIONS_PATH) as TFile | null;
  if (!f) return;

  const lines = (await app.vault.read(f)).split("\n");
  const nextLine = formatInspirationLine({ ...item, text: trimmed });
  if (!replaceInspirationLine(lines, item, nextLine)) return;
  await app.vault.modify(f, lines.join("\n"));
}

export async function deleteProjectInspiration(app: App, item: InspirationItem): Promise<void> {
  const f = app.vault.getAbstractFileByPath(PROJECT_INSPIRATIONS_PATH) as TFile | null;
  if (!f) return;

  const lines = (await app.vault.read(f)).split("\n");
  const range = findProjectSectionRange(lines, item.project);
  if (!range) return;

  const currentLine = formatInspirationLine(item);
  let changed = false;
  for (let i = range.start + 1; i < range.end; i++) {
    if (lines[i] !== currentLine) continue;
    lines.splice(i, 1);
    changed = true;
    break;
  }

  if (!changed) return;
  await app.vault.modify(f, lines.join("\n"));
}

export function getProjectInspirationsPath(): string {
  return PROJECT_INSPIRATIONS_PATH;
}
