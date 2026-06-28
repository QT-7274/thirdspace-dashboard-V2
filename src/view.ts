import { ItemView, Modal, WorkspaceLeaf, TFile } from "obsidian";
import type ThirdSpaceDashboard from "./main";
import {
  loadWorkspaceIndex, getWorkspaceStats, getDailyActivity,
  loadProductStatus, parseProducts, getRecentFiles,
  localDateStr, localDateCompact, localTimestamp,
  loadTodos, loadTodayWorklog, getVaultStats, getTodayWorklogPath, getTaskPoolPath,
  loadScopedTodos, addScopedTodo, addScopedTodoToToday, toggleTodoInWorklog, renameTodoInWorklog, isWorkTodo,
  isTodoOverdue, sortTodosByUrgency, categorizeScopedOverdue,
  loadCarryOverTodos, addCarryOverTodoToToday, deleteTodoFromWorklog,
  type WorkspaceStats, type TodoItem, type VaultStats, type TodayWorklog,
  type ScopedTodoInput, type ScopedTodoItem, type TaskScope,
} from "./data/vault-reader";
import { buildSnakeCells, type SnakeCell } from "./data/worklog-parser";
import { renderSnakeHeatmap, type SnakeRouteCache } from "./components/snake-heatmap";
import { shouldSubmitOnEnter } from "./utils/keyboard";
import { DEFAULT_SCOPED_TASK_BATCH_SIZE, getNextVisibleCount, getRemainingCount } from "./utils/pagination";

export const VIEW_TYPE = "thirdspace-dashboard";

// ── Todo Input Modal ──────────────────────────────────────────
const TODO_SCOPE_OPTIONS: Array<{ scope: TaskScope; label: string }> = [
  { scope: "today", label: "今日" },
  { scope: "week", label: "本周" },
  { scope: "month", label: "本月" },
  { scope: "longterm", label: "长期" },
  { scope: "custom", label: "指定日期" },
];
const TODO_TAG_OPTIONS = ["工作", "项目", "学习", "生活", "插件"];

class TodoModal extends Modal {
  private onSubmit: (input: ScopedTodoInput) => void;
  private selectedScope: TaskScope = "today";
  private tags = new Set<string>();
  private dateRow: HTMLElement | null = null;
  private dateInput: HTMLInputElement | null = null;
  private errorEl: HTMLElement | null = null;
  private isComposingText = false;

  constructor(app: any, onSubmit: (input: ScopedTodoInput) => void) {
    super(app); this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("ts-modal");
    contentEl.createEl("h3", { text: "新增 Todo", cls: "ts-modal-title" });

    const input = contentEl.createEl("input", { type: "text", cls: "ts-modal-input" });
    input.placeholder = "输入 todo 内容";
    input.focus();
    input.addEventListener("compositionstart", () => { this.isComposingText = true; });
    input.addEventListener("compositionend", () => { this.isComposingText = false; });

    const scopeLabel = contentEl.createDiv({ cls: "ts-modal-field-label", text: "周期" });
    const scopeRow = contentEl.createDiv({ cls: "ts-chip-row" });
    const scopeButtons = new Map<TaskScope, HTMLButtonElement>();
    for (const option of TODO_SCOPE_OPTIONS) {
      const btn = scopeRow.createEl("button", { text: option.label, cls: "ts-chip" });
      btn.type = "button";
      scopeButtons.set(option.scope, btn);
      btn.addEventListener("click", () => {
        this.selectedScope = option.scope;
        this.renderScopeState(scopeButtons);
      });
    }
    scopeLabel.setAttr("aria-hidden", "true");

    this.dateRow = contentEl.createDiv({ cls: "ts-modal-date-row" });
    this.dateRow.createSpan({ text: "日期", cls: "ts-modal-field-label" });
    this.dateInput = this.dateRow.createEl("input", { type: "date", cls: "ts-modal-date-input" });

    contentEl.createDiv({ cls: "ts-modal-field-label", text: "标签" });
    const tagRow = contentEl.createDiv({ cls: "ts-chip-row" });
    for (const tag of TODO_TAG_OPTIONS) {
      const btn = tagRow.createEl("button", { text: tag, cls: "ts-chip" });
      btn.type = "button";
      btn.addEventListener("click", () => {
        if (this.tags.has(tag)) {
          this.tags.delete(tag);
          btn.removeClass("ts-chip--active");
        } else {
          this.tags.add(tag);
          btn.addClass("ts-chip--active");
        }
      });
    }

    this.errorEl = contentEl.createDiv({ cls: "ts-modal-error" });

    const submit = () => {
      const val = input.value.trim();
      if (!val) {
        this.setError("先写一点任务内容");
        input.focus();
        return;
      }
      const dueDate = this.dateInput?.value.trim();
      if (this.selectedScope === "custom" && !dueDate) {
        this.setError("选择指定日期时需要填写日期");
        this.dateInput?.focus();
        return;
      }
      // todo-overdue-and-edge-cases.DATE_VALIDATION.1
      if (this.selectedScope === "custom" && dueDate && dueDate < localDateStr(new Date())) {
        this.setError("日期不能早于今天");
        this.dateInput?.focus();
        return;
      }
      this.onSubmit({
        text: val,
        scope: this.selectedScope,
        tags: Array.from(this.tags),
        ...(this.selectedScope === "custom" && dueDate ? { dueDate } : {}),
      });
      this.close();
    };

    const row = contentEl.createDiv({ cls: "ts-modal-row" });
    const btn = row.createEl("button", { text: "添加", cls: "ts-modal-btn ts-modal-btn--primary" });
    btn.addEventListener("click", submit);
    const cancel = row.createEl("button", { text: "取消", cls: "ts-modal-btn" });
    cancel.addEventListener("click", () => this.close());

    input.addEventListener("keydown", ev => {
      if (shouldSubmitOnEnter(ev, this.isComposingText)) {
        ev.preventDefault();
        submit();
      }
    });
    this.dateInput.addEventListener("keydown", ev => {
      if (shouldSubmitOnEnter(ev)) {
        ev.preventDefault();
        submit();
      }
    });
    this.renderScopeState(scopeButtons);
  }

  private renderScopeState(scopeButtons: Map<TaskScope, HTMLButtonElement>) {
    for (const [scope, btn] of scopeButtons) {
      if (scope === this.selectedScope) btn.addClass("ts-chip--active");
      else btn.removeClass("ts-chip--active");
    }
    if (this.dateRow) {
      if (this.selectedScope === "custom") this.dateRow.removeClass("ts-modal-date-row--hidden");
      else this.dateRow.addClass("ts-modal-date-row--hidden");
    }
    this.setError("");
  }

  private setError(message: string) {
    if (this.errorEl) this.errorEl.setText(message);
  }

  onClose() { this.contentEl.empty(); }
}

// ── Dashboard View ────────────────────────────────────────────
export class DashboardView extends ItemView {
  plugin: ThirdSpaceDashboard;
  private timer: number | null = null;
  private snakeRouteCache: SnakeRouteCache | null = null;
  private snakeReplayTimer: number | null = null;
  private scopedVisibleCounts: Record<string, number> = {};
  private isEditingTodo = false;
  private refreshPending = false;
  private carryOverCache: { date: string; items: TodoItem[] } | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ThirdSpaceDashboard) {
    super(leaf); this.plugin = plugin;
  }

  getViewType()    { return VIEW_TYPE; }
  getDisplayText() { return "ThirdSpace"; }
  getIcon()        { return "layout-dashboard"; }

  async onOpen()  { this.containerEl.addClass("ts-root"); await this.render(); this.timer = window.setInterval(() => { if (this.isEditingTodo) { this.refreshPending = true; return; } this.render(); }, 60_000); }
  onClose()       { if (this.timer) { clearInterval(this.timer); this.timer = null; } if (this.snakeReplayTimer) { clearTimeout(this.snakeReplayTimer); this.snakeReplayTimer = null; } return Promise.resolve(); }

  async render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ts-dash");

    const todayStr = localDateStr(new Date());
    const carryOverPromise = this.carryOverCache?.date === todayStr
      ? Promise.resolve(this.carryOverCache.items)
      : loadCarryOverTodos(this.app).then(items => {
          this.carryOverCache = { date: todayStr, items };
          return items;
        });

    const [wsIndex, productMd, activity, todos, scopedTodos, todayWorklog, carryOverTodos] = await Promise.all([
      loadWorkspaceIndex(this.app),
      loadProductStatus(this.app),
      getDailyActivity(this.app, 365),
      loadTodos(this.app),
      loadScopedTodos(this.app),
      loadTodayWorklog(this.app),
      carryOverPromise,
    ]);

    const wsDirs    = wsIndex?.map(e => e.dir) ?? [];
    const wsStats   = await getWorkspaceStats(this.app, wsDirs);
    const vaultStats = getVaultStats(this.app);
    const recent    = getRecentFiles(this.app, 7);
    const products  = productMd ? parseProducts(productMd) : [];
    const snakeCells = buildSnakeCells(activity);
    const pending   = todos.filter(t => !t.done);
    // todo-overdue-and-edge-cases.OVERDUE_DETECTION.4
    const { overdue: overdueScoped, current: currentScoped } = categorizeScopedOverdue(scopedTodos);
    // work-todo-board.WORK_BOARD.1 work-todo-board.WORK_BOARD.2
    const workScopedTodos = currentScoped.filter(isWorkTodo);
    const upcomingScopedTodos = currentScoped.filter(item => !isWorkTodo(item));

    // ── Header
    const hdr = contentEl.createDiv({ cls: "ts-hdr" });
    const hdrL = hdr.createDiv({ cls: "ts-hdr-left" });
    hdrL.createDiv({ cls: "ts-vault-title", text: (this.app.vault as any).getName?.() ?? "Vault" });
    const pill = hdrL.createDiv({ cls: `ts-pill ${wsIndex ? "ts-pill--ok" : "ts-pill--warn"}` });
    pill.setText(wsIndex ? `${wsStats.length} workspaces` : "no .thirdspace");
    const refreshBtn = hdr.createDiv({ cls: "ts-hdr-right" }).createEl("button", { cls: "ts-icon-btn", text: "↻" });
    refreshBtn.addEventListener("click", () => { this.snakeRouteCache = null; this.carryOverCache = null; this.render(); });

    // ── Stats row
    this.renderStatsRow(contentEl, vaultStats, activity.filter(a=>a.count>0).length);

    // ── Snake heatmap
    const heatSec  = contentEl.createDiv({ cls: "ts-card ts-heatmap-card" });
    const heatHd   = heatSec.createDiv({ cls: "ts-card-head" });
    heatHd.createSpan({ cls: "ts-card-label", text: "ACTIVITY · PAST YEAR" });
    const streak = this.calcStreak(activity);
    if (streak > 0) heatHd.createSpan({ cls: "ts-card-meta", text: `⚡ ${streak}d streak` });
    const heatBody = heatSec.createDiv({ cls: "ts-heatmap-body" });

    // 清除舊的 replay timer（本次全量刷新會重新建立）
    if (this.snakeReplayTimer) { clearTimeout(this.snakeReplayTimer); this.snakeReplayTimer = null; }

    window.setTimeout(async () => {
      const cache = await renderSnakeHeatmap(heatBody, snakeCells, this.snakeRouteCache ?? undefined);
      if (cache) {
        this.snakeRouteCache = cache;
        this.scheduleSnakeReplay(heatBody, snakeCells, cache.durationMs);
      }
    }, 0);

    // ── Two columns
    const main  = contentEl.createDiv({ cls: "ts-main" });
    const left  = main.createDiv({ cls: "ts-left" });
    const right = main.createDiv({ cls: "ts-right" });

    // LEFT: workspaces
    const wsCard = left.createDiv({ cls: "ts-card" });
    wsCard.createDiv({ cls: "ts-card-label", text: "WORKSPACES" });
    this.renderWorkspaces(wsCard, wsStats);

    // LEFT: todos
    const todoCard = left.createDiv({ cls: "ts-card ts-todo-card" });
    const tdHd = todoCard.createDiv({ cls: "ts-card-head" });
    tdHd.createSpan({ cls: "ts-card-label", text: "TODAY'S TODOS" });
    const tdMeta = tdHd.createSpan({ cls: "ts-card-meta ts-todo-meta" });
    if (pending.length > 0) tdMeta.setText(`${pending.length} pending`);
    this.renderTodos(todoCard, todos);

    // todo-overdue-and-edge-cases.CROSS_DAY_CARRYOVER.2
    if (carryOverTodos.length > 0) {
      const carryCard = left.createDiv({ cls: "ts-card ts-carry-card" });
      const carryHd = carryCard.createDiv({ cls: "ts-card-head" });
      carryHd.createSpan({ cls: "ts-card-label", text: "昨日遗留" });
      carryHd.createSpan({ cls: "ts-card-meta", text: `${carryOverTodos.length} unchecked` });
      this.renderCarryOverTodos(carryCard, carryOverTodos);
    }

    // todo-overdue-and-edge-cases.OVERDUE_DETECTION.4
    if (overdueScoped.length > 0) {
      const overdueCard = left.createDiv({ cls: "ts-card ts-overdue-card" });
      const overdueHd = overdueCard.createDiv({ cls: "ts-card-head" });
      overdueHd.createSpan({ cls: "ts-card-label", text: "逾期任务" });
      overdueHd.createSpan({ cls: "ts-card-meta", text: `${overdueScoped.length} overdue` });
      this.renderOverdueTodos(overdueCard, overdueScoped);
    }

    // LEFT: work scoped tasks
    if (workScopedTodos.length > 0) {
      const workCard = left.createDiv({ cls: "ts-card ts-scoped-card ts-work-card" });
      const workHd = workCard.createDiv({ cls: "ts-card-head" });
      workHd.createSpan({ cls: "ts-card-label", text: "WORK TODOS" });
      workHd.createSpan({ cls: "ts-card-meta", text: `${workScopedTodos.length} work` });
      this.renderScopedTodos(workCard, workScopedTodos, "work");
    }

    // LEFT: scoped tasks
    if (upcomingScopedTodos.length > 0) {
      const scopedCard = left.createDiv({ cls: "ts-card ts-scoped-card" });
      const scopedHd = scopedCard.createDiv({ cls: "ts-card-head" });
      scopedHd.createSpan({ cls: "ts-card-label", text: "UPCOMING TASKS" });
      scopedHd.createSpan({ cls: "ts-card-meta", text: `${upcomingScopedTodos.length} open` });
      this.renderScopedTodos(scopedCard, upcomingScopedTodos, "upcoming");
    }

    // RIGHT: today's worklog
    if (todayWorklog) {
      const logCard = right.createDiv({ cls: "ts-card" });
      const logHd   = logCard.createDiv({ cls: "ts-card-head" });
      logHd.createSpan({ cls: "ts-card-label", text: "TODAY" });
      logHd.createSpan({ cls: "ts-card-meta", text: new Date().toLocaleDateString("zh-CN",{month:"short",day:"numeric",weekday:"short"}) });
      this.renderTodayWorklog(logCard, todayWorklog);
    }

    // RIGHT: quick actions (高频操作前置)
    const actCard = right.createDiv({ cls: "ts-card ts-quick-card" });
    actCard.createDiv({ cls: "ts-card-label", text: "QUICK" });
    this.renderActions(actCard);

    // RIGHT: recent
    if (recent.length > 0) {
      const recCard = right.createDiv({ cls: "ts-card" });
      recCard.createDiv({ cls: "ts-card-label", text: "RECENT" });
      this.renderRecent(recCard, recent);
    }

    // RIGHT: products
    if (products.length > 0) {
      const prodCard = right.createDiv({ cls: "ts-card" });
      prodCard.createDiv({ cls: "ts-card-label", text: "PRODUCTS" });
      this.renderProducts(prodCard, products);
    }
  }

  // ── Stats row
  private renderStatsRow(parent: HTMLElement, s: VaultStats, activeDays: number) {
    const row = parent.createDiv({ cls: "ts-stats-row" });
    for (const st of [
      { value: s.total, label: "files" }, { value: s.thisWeek, label: "this week" },
      { value: s.thisMonth, label: "this month" }, { value: activeDays, label: "active days" },
    ]) {
      const cell = row.createDiv({ cls: "ts-stat-cell" });
      cell.createDiv({ cls: "ts-stat-num", text: String(st.value) });
      cell.createDiv({ cls: "ts-stat-lbl", text: st.label });
    }
  }

  // ── Workspaces
  private renderWorkspaces(parent: HTMLElement, stats: WorkspaceStats[]) {
    const grid = parent.createDiv({ cls: "ts-ws-grid" });
    const maxFiles = Math.max(...stats.map(s => s.fileCount), 1);
    for (const ws of stats) {
      const age  = Date.now() - ws.lastModified;
      const card = grid.createDiv({ cls: `ts-ws-card ${age < 7*86_400_000 ? "ts-ws--hot" : age < 30*86_400_000 ? "ts-ws--warm" : "ts-ws--cold"}` });
      card.addEventListener("click", () => this.openWorkspace(ws.dir));
      const top = card.createDiv({ cls: "ts-ws-top" });
      top.createSpan({ cls: "ts-ws-icon", text: ws.icon });
      top.createSpan({ cls: "ts-ws-name", text: ws.desc });
      card.createDiv({ cls: "ts-ws-count", text: `${ws.fileCount} files` });
      card.createDiv({ cls: "ts-ws-bar" }).createDiv({ cls: "ts-ws-fill", attr: { style: `width:${Math.round(ws.fileCount/maxFiles*100)}%` } });
      card.createDiv({ cls: "ts-ws-time", text: ws.lastModified ? `active ${this.relTime(ws.lastModified)}` : "—" });
    }
  }

  // ── Todos (from today's worklog ## 今日Todo)
  private renderTodos(parent: HTMLElement, items: TodoItem[]) {
    // todo-overdue-and-edge-cases.URGENCY_SORT.1
    const sorted = sortTodosByUrgency(items);
    const pending = sorted.filter(t => !t.done);
    const done    = sorted.filter(t => t.done);

    if (items.length === 0) {
      parent.createDiv({ cls: "ts-empty", text: 'No todos — click "记TODO" to add' });
      return;
    }
    const list = parent.createDiv({ cls: "ts-todo-list" });
    const SHOW = 8;
    for (const item of pending.slice(0, SHOW)) this.renderTodoRow(list, item);
    if (pending.length > SHOW) {
      const m = list.createDiv({ cls: "ts-todo-more" });
      m.setText(`+${pending.length - SHOW} more`);
      m.addEventListener("click", () => this.openFile(getTodayWorklogPath()));
    }
    if (done.length > 0)
      list.createDiv({ cls: "ts-todo-done-hint", text: `✓ ${done.length} completed` });
  }

  private renderScopedTodos(parent: HTMLElement, items: ScopedTodoItem[], bucket = "upcoming") {
    const labels: Record<ScopedTodoItem["scope"], string> = {
      week: "本周",
      month: "本月",
      longterm: "长期",
      custom: "指定日期",
    };
    const order: Array<ScopedTodoItem["scope"]> = ["week", "month", "custom", "longterm"];
    const list = parent.createDiv({ cls: "ts-scoped-list" });

    for (const scope of order) {
      // todo-overdue-and-edge-cases.URGENCY_SORT.2
      const group = sortTodosByUrgency(items.filter(item => item.scope === scope));
      if (group.length === 0) continue;
      const visibleKey = `${bucket}:${scope}`;
      const visibleCount = this.scopedVisibleCounts[visibleKey] ?? DEFAULT_SCOPED_TASK_BATCH_SIZE;
      const visibleItems = group.slice(0, visibleCount);
      const remaining = getRemainingCount(group.length, visibleItems.length);

      const sec = list.createDiv({ cls: "ts-scoped-section" });
      const head = sec.createDiv({ cls: "ts-scoped-section-head" });
      head.createSpan({ text: labels[scope], cls: "ts-scoped-section-title" });
      head.createSpan({ text: `${group.length}`, cls: "ts-scoped-section-count" });

      for (const item of visibleItems) {
        const row = sec.createDiv({ cls: "ts-scoped-row" });
        row.addEventListener("click", () => this.openFile(getTaskPoolPath()));

        const info = row.createDiv({ cls: "ts-scoped-info" });
        info.createDiv({ text: item.text, cls: "ts-scoped-text" });
        this.renderScopedMeta(info, item);

        const addBtn = row.createEl("button", { text: "加入今日", cls: "ts-scoped-add" });
        addBtn.type = "button";
        addBtn.addEventListener("click", async e => {
          e.stopPropagation();
          await addScopedTodoToToday(this.app, item);
          await this.refreshTodoSection();
          addBtn.setText("已加入");
          addBtn.disabled = true;
        });
      }

      if (remaining > 0) {
        const more = sec.createDiv({ cls: "ts-todo-more", text: `+${remaining} more` });
        more.addEventListener("click", e => {
          e.stopPropagation();
          this.scopedVisibleCounts[visibleKey] = getNextVisibleCount(visibleItems.length, group.length);
          this.render();
        });
      }
    }
  }

  private renderScopedMeta(parent: HTMLElement, item: { tags: string[]; periodRange?: string; dueDate?: string }) {
    if (item.tags.length === 0 && !item.periodRange && !item.dueDate) return;

    const meta = parent.createDiv({ cls: "ts-scoped-meta" });
    for (const tag of item.tags) {
      const tagEl = meta.createSpan({ text: `#${tag}`, cls: "ts-tag" });
      if (tag === "工作") tagEl.addClass("ts-tag--work"); // work-todo-board.TAG_DISPLAY.1
    }
    if (item.periodRange) meta.createSpan({ text: `📆 ${item.periodRange}`, cls: "ts-scoped-date" });
    if (item.dueDate) meta.createSpan({ text: `📅 ${item.dueDate}`, cls: "ts-scoped-date" });
  }

  // ── Overdue scoped todos ─────────────────────────────────────
  // todo-overdue-and-edge-cases.OVERDUE_DETECTION.4
  private renderOverdueTodos(parent: HTMLElement, items: ScopedTodoItem[]) {
    const sorted = sortTodosByUrgency(items);
    const list = parent.createDiv({ cls: "ts-scoped-list" });
    const SHOW = 8;
    for (const item of sorted.slice(0, SHOW)) {
      const row = list.createDiv({ cls: "ts-scoped-row ts-scoped-row--overdue" });
      row.addEventListener("click", () => this.openFile(getTaskPoolPath()));
      const info = row.createDiv({ cls: "ts-scoped-info" });
      info.createDiv({ text: item.text, cls: "ts-scoped-text" });
      this.renderScopedMeta(info, item);
      const addBtn = row.createEl("button", { text: "加入今日", cls: "ts-scoped-add" });
      addBtn.type = "button";
      addBtn.addEventListener("click", async e => {
        e.stopPropagation();
        await addScopedTodoToToday(this.app, item);
        await this.refreshTodoSection();
        addBtn.setText("已加入");
        addBtn.disabled = true;
      });
    }
    if (sorted.length > SHOW) {
      list.createDiv({ cls: "ts-todo-more", text: `+${sorted.length - SHOW} more` })
        .addEventListener("click", () => this.openFile(getTaskPoolPath()));
    }
  }

  // ── Carry-over todos from previous day ───────────────────────
  // todo-overdue-and-edge-cases.CROSS_DAY_CARRYOVER.3
  private renderCarryOverTodos(parent: HTMLElement, items: TodoItem[]) {
    const list = parent.createDiv({ cls: "ts-todo-list" });
    const SHOW = 5;
    for (const item of items.slice(0, SHOW)) {
      const row = list.createDiv({ cls: "ts-todo-row ts-todo-carry" });
      const chk = row.createEl("span", { cls: "ts-todo-chk", text: "☐" });
      const body = row.createDiv({ cls: "ts-todo-body" });
      body.createSpan({ cls: "ts-todo-txt", text: item.text });
      this.renderScopedMeta(body, item);
      const addBtn = row.createEl("button", { text: "加入今日", cls: "ts-scoped-add" });
      addBtn.type = "button";
      addBtn.addEventListener("click", async e => {
        e.stopPropagation();
        await addCarryOverTodoToToday(this.app, item);
        await this.refreshTodoSection();
        addBtn.setText("已加入");
        addBtn.disabled = true;
      });
      chk.addEventListener("click", e => e.stopPropagation());
    }
    if (items.length > SHOW) {
      list.createDiv({ cls: "ts-todo-more", text: `+${items.length - SHOW} more` });
    }
  }

  private renderTodoRow(parent: HTMLElement, item: TodoItem) {
    // todo-overdue-and-edge-cases.OVERDUE_DETECTION.3
    const overdue = !item.done && isTodoOverdue(item);
    const row = parent.createDiv({ cls: `ts-todo-row${item.done ? " ts-todo-done" : ""}${overdue ? " ts-todo-overdue" : ""}` });
    const chk = row.createEl("span", { cls: "ts-todo-chk", text: item.done ? "☑" : "☐" });
    const body = row.createDiv({ cls: "ts-todo-body" });
    const txt = body.createSpan({ cls: "ts-todo-txt", text: item.text });
    if (overdue) body.createSpan({ cls: "ts-todo-overdue-badge", text: "逾期" });
    this.renderScopedMeta(body, item); // work-todo-board.TAG_DISPLAY.2

    // todo-overdue-and-edge-cases.TODO_DELETE.1
    const delBtn = row.createEl("span", { cls: "ts-todo-del", text: "✕" });
    delBtn.addEventListener("click", async e => {
      e.stopPropagation();
      await deleteTodoFromWorklog(this.app, item);
      await this.refreshTodoSection();
    });

    // checkbox 单击 = 切换完成状态（原地更新，无全页刷新）
    chk.addEventListener("click", async e => {
      e.stopPropagation();
      const targetDone = !item.done;
      // 乐观更新：先改 DOM，再写文件
      item.done = targetDone;
      chk.setText(item.done ? "☑" : "☐");
      if (item.done) row.addClass("ts-todo-done");
      else           row.removeClass("ts-todo-done");
      // 同步更新 header 上的 pending 计数
      const todoCard = row.closest<HTMLElement>(".ts-todo-card");
      if (todoCard) {
        const meta = todoCard.querySelector<HTMLElement>(".ts-todo-meta");
        if (meta) {
          const pendingCount = todoCard.querySelectorAll<HTMLElement>(".ts-todo-row:not(.ts-todo-done)").length;
          meta.setText(pendingCount > 0 ? `${pendingCount} pending` : "");
        }
      }
      await toggleTodoInWorklog(this.app, item, targetDone);
      if (item.taskId) await this.render();
    });

    // 单击行 = 打开文件（detail >= 2 时忽略，让 dblclick 接管）
    row.addEventListener("click", e => {
      if ((e as MouseEvent).detail >= 2) return;
      this.openFile(getTodayWorklogPath());
    });

    // 双击行 = inline 编辑文字
    row.addEventListener("dblclick", e => {
      e.stopPropagation();
      this.isEditingTodo = true;
      // 替换文字 span 为 input
      const input = document.createElement("input");
      input.type  = "text";
      input.value = item.text;
      input.className = "ts-todo-edit-input";
      txt.replaceWith(input);
      input.focus();
      input.select();

      // 阻止 input 上的所有点击冒泡到 row，防止触发 openFile
      input.addEventListener("click",     e => e.stopPropagation());
      input.addEventListener("mousedown", e => e.stopPropagation());
      let isEditingComposing = false;
      input.addEventListener("compositionstart", () => { isEditingComposing = true; });
      input.addEventListener("compositionend", () => { isEditingComposing = false; });

      let saved = false;
      const finishEditing = () => {
        this.isEditingTodo = false;
        if (this.refreshPending) {
          this.refreshPending = false;
          this.render();
        }
      };
      const save = async () => {
        if (saved) return;
        saved = true;
        const newText = input.value.trim();
        if (newText && newText !== item.text) {
          await renameTodoInWorklog(this.app, item, newText);
          item.text = newText;
        }
        // 原地把 input 换回 span，无全页刷新
        const span = createEl("span", { cls: "ts-todo-txt", text: item.text });
        input.replaceWith(span);
        finishEditing();
      };

      input.addEventListener("keydown", async ev => {
        if (shouldSubmitOnEnter(ev, isEditingComposing))  { ev.preventDefault(); await save(); }
        if (ev.key === "Escape") {
          saved = true;
          // 取消：原地恢复原始 span
          const span = createEl("span", { cls: "ts-todo-txt", text: item.text });
          input.replaceWith(span);
          finishEditing();
        }
      });
      input.addEventListener("blur", save);
    });
  }

  // ── Today: ## 今日重点 + ## 重点记录 时间线 ──────────────────
  private renderTodayWorklog(parent: HTMLElement, today: TodayWorklog) {
    const body = parent.createDiv({ cls: "ts-log-body" });

    // 今日重点：人工写的摘要
    if (today.highlights.length > 0) {
      const hl = body.createDiv({ cls: "ts-log-highlights" });
      for (const h of today.highlights) {
        const row = hl.createDiv({ cls: "ts-log-highlight-row" });
        row.createSpan({ cls: "ts-log-hl-bullet", text: "◆" });
        row.createSpan({ cls: "ts-log-hl-text",   text: h });
      }
    }

    // 重点记录：时间轴，只展示时间+标题
    if (today.entries.length > 0) {
      const tl = body.createDiv({ cls: "ts-log-timeline" });
      for (const e of today.entries) {
        const row = tl.createDiv({ cls: "ts-log-tl-row" });
        row.addEventListener("click", () => this.openFile(getTodayWorklogPath()));
        row.createSpan({ cls: "ts-log-time",  text: e.time });
        row.createSpan({ cls: "ts-log-tl-sep", text: "—" });
        row.createSpan({ cls: "ts-log-tl-title", text: e.title });
      }
    }
  }

  // ── Products
  private renderProducts(parent: HTMLElement, products: ReturnType<typeof parseProducts>) {
    const ICONS: Record<string, string> = { active:"●", watch:"◐", paused:"○" };
    const list = parent.createDiv({ cls: "ts-prod-list" });
    for (const p of products) {
      const row = list.createDiv({ cls: `ts-prod-row ts-prod--${p.status}` });
      row.createSpan({ cls: "ts-prod-dot", text: ICONS[p.status]??"·" });
      const info = row.createDiv({ cls: "ts-prod-info" });
      info.createDiv({ cls: "ts-prod-name", text: p.name });
      if (p.milestone) info.createDiv({ cls: "ts-prod-mile", text: p.milestone });
    }
  }

  // ── Quick actions
  private renderActions(parent: HTMLElement) {
    const ACTIONS = [
      { label: "新笔记",  icon: "✎", fn: () => this.createNewNote() },
      { label: "今日志",  icon: "◈", fn: () => this.openTodayLog() },
      { label: "记TODO",  icon: "☐", fn: () => this.openTodoModal() },
      { label: "搜索",    icon: "⊕", fn: () => this.runCmd("global-search:open") },
      { label: "收件箱",  icon: "↓", fn: () => this.openWorkspace("01-收件箱") },
    ];
    const grid = parent.createDiv({ cls: "ts-act-grid" });
    for (const a of ACTIONS) {
      const btn = grid.createEl("button", { cls: "ts-act-btn" });
      btn.createDiv({ cls: "ts-act-icon", text: a.icon });
      btn.createDiv({ cls: "ts-act-label", text: a.label });
      btn.addEventListener("click", a.fn);
    }
  }

  // ── Recent
  private renderRecent(parent: HTMLElement, files: ReturnType<typeof getRecentFiles>) {
    const list = parent.createDiv({ cls: "ts-rec-list" });
    for (const f of files) {
      const row = list.createDiv({ cls: "ts-rec-row" });
      row.addEventListener("click", () => this.openFile(f.path));
      row.createSpan({ cls: "ts-rec-ws",   text: f.workspace.replace(/^\d+-/,"").slice(0,6) });
      row.createSpan({ cls: "ts-rec-name", text: f.name });
      row.createSpan({ cls: "ts-rec-time", text: this.relTime(f.mtime) });
    }
  }

  // ── Helpers
  private calcStreak(activity: {date:string;count:number}[]): number {
    const set = new Set(activity.filter(a=>a.count>0).map(a=>a.date));
    let streak = 0; const d = new Date();
    while (true) { const s = localDateStr(d); if (!set.has(s)) break; streak++; d.setDate(d.getDate()-1); }
    return streak;
  }
  private relTime(ms: number): string {
    const d = Math.floor((Date.now()-ms)/86_400_000);
    if (d===0) return "today"; if (d===1) return "1d";
    if (d<7) return `${d}d`; if (d<30) return `${Math.floor(d/7)}w`;
    return `${Math.floor(d/30)}mo`;
  }
  private async openFile(path: string) {
    const f = this.app.vault.getAbstractFileByPath(path) as TFile|null;
    if (f) await this.app.workspace.getLeaf(false).openFile(f);
  }
  private openWorkspace(dir: string) {
    const fe = (this.app as any).internalPlugins?.plugins?.["file-explorer"]?.instance;
    const folder = this.app.vault.getAbstractFileByPath(dir);
    if (fe && folder) { fe.revealInFolder(folder); try { fe.setCollapseState?.(folder,false); } catch {} }
    const first = this.app.vault.getMarkdownFiles()
      .filter(f => f.path.startsWith(dir+"/") && !f.path.includes("WORKSPACE") && !f.path.includes("AGENTS"))
      .sort((a,b) => b.stat.mtime - a.stat.mtime)[0];
    if (first) this.openFile(first.path);
  }
  private async createNewNote() {
    const now = new Date();
    const date = localDateCompact(now);
    const ts   = localTimestamp(now);
    const path = `01-收件箱/${date}_untitled.md`;
    const fm   = ["---",`title: "Untitled"`,`type: note`,`topic: work`,`workspace: "01-收件箱"`,`created: "${ts}"`,`modified: "${ts}"`,`tags: ["note","draft"]`,`source: manual`,`status: draft`,"---","",""].join("\n");
    try { const f = await this.app.vault.create(path, fm); await this.app.workspace.getLeaf(false).openFile(f); }
    catch { const f = this.app.vault.getAbstractFileByPath(path) as TFile|null; if (f) await this.app.workspace.getLeaf(false).openFile(f); }
  }
  private async openTodayLog() {
    const today = new Date();
    const ymd   = localDateCompact(today);
    const wd    = ["日","一","二","三","四","五","六"][today.getDay()];
    const path  = `02-日记/工作日志/${ymd}_工作日志_周${wd}.md`;
    const f = this.app.vault.getAbstractFileByPath(path) as TFile|null;
    if (f) { await this.app.workspace.getLeaf(false).openFile(f); return; }
    const all = this.app.vault.getMarkdownFiles();
    const log = all.find(f => f.path.startsWith("02-日记/工作日志/") && f.basename.startsWith(ymd));
    if (log) await this.app.workspace.getLeaf(false).openFile(log);
    else this.openWorkspace("02-日记");
  }
  private openTodoModal() {
    new TodoModal(this.app, async (input) => {
      await addScopedTodo(this.app, input);
      if (input.scope === "today") await this.refreshTodoSection();
      else await this.render();
    }).open();
  }

  /** 局部刷新 todo card，不触发全页重绘 */
  private async refreshTodoSection() {
    const todoCard = this.containerEl.querySelector<HTMLElement>(".ts-todo-card");
    if (!todoCard) { await this.render(); return; }

    const todos   = await loadTodos(this.app);
    const pending = todos.filter(t => !t.done);

    // 更新 pending 计数
    const meta = todoCard.querySelector<HTMLElement>(".ts-todo-meta");
    if (meta) meta.setText(pending.length > 0 ? `${pending.length} pending` : "");

    // 替换列表内容
    const existing = todoCard.querySelector<HTMLElement>(".ts-todo-list, .ts-empty");
    if (existing) existing.remove();
    this.renderTodos(todoCard, todos);
  }
  private runCmd(id: string) { try { (this.app as any).commands.executeCommandById(id); } catch {} }

  /** 蛇跑完後等 2 秒自動重播，不依賴 60s 全量刷新 */
  private scheduleSnakeReplay(container: HTMLElement, cells: SnakeCell[], durationMs: number) {
    if (this.snakeReplayTimer) clearTimeout(this.snakeReplayTimer);
    this.snakeReplayTimer = window.setTimeout(async () => {
      if (!container.isConnected) return; // 面板已被全量刷新，跳過
      const cache = await renderSnakeHeatmap(container, cells, this.snakeRouteCache ?? undefined);
      if (cache) {
        this.snakeRouteCache = cache;
        this.scheduleSnakeReplay(container, cells, cache.durationMs);
      }
    }, durationMs + 2000); // 動畫結束後 2s 重播
  }
}
