import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("work-todo-board.PAGINATION.1 scoped todo more control is a button", () => {
  const source = readFileSync("src/view.ts", "utf8");

  assert.match(
    source,
    /createEl\("button",\s*\{\s*cls:\s*"ts-todo-more",\s*text:\s*`\+\$\{remaining\} more`\s*\}\)/,
  );
  assert.doesNotMatch(
    source,
    /createDiv\(\{\s*cls:\s*"ts-todo-more",\s*text:\s*`\+\$\{remaining\} more`\s*\}\)/,
  );
});

test("work-todo-board.WORK_BOARD.4 overdue scoped todos stay inside their routed card", () => {
  const source = readFileSync("src/view.ts", "utf8");

  assert.match(source, /type ScopedTodoSectionKey = ScopedTodoItem\["scope"\] \| "overdue"/);
  assert.match(
    source,
    /return isTodoOverdue\(item\) \? "overdue" : item\.scope/,
  );
  assert.match(source, /const overdueWorkScoped = overdueScoped\.filter\(isWorkTodo\)/);
  assert.match(source, /const overdueUpcomingScoped = overdueScoped\.filter\(item => !isWorkTodo\(item\)\)/);
  assert.match(source, /const workScopedTodos = \[\.\.\.overdueWorkScoped, \.\.\.currentScoped\.filter\(isWorkTodo\)\]/);
  assert.match(
    source,
    /const order: ScopedTodoSectionKey\[\] = \["overdue", "week", "month", "custom", "longterm"\]/,
  );
  assert.match(source, /this\.renderOverdueTodos\(overdueCard, overdueUpcomingScoped\)/);
});

test("work-todo-board.TAG_DISPLAY.3 work overdue section has distinct styling hooks", () => {
  const viewSource = readFileSync("src/view.ts", "utf8");
  const styles = readFileSync("src/styles.css", "utf8");

  assert.match(viewSource, /ts-scoped-section--overdue/);
  assert.match(viewSource, /ts-scoped-row--overdue/);
  assert.match(styles, /work-todo-board\.TAG_DISPLAY\.3/);
  assert.match(styles, /\.ts-work-card \.ts-scoped-section--overdue/);
});

test("project-centered-dashboard.TIME_VIEWS.3 replaces standalone project panels", () => {
  const source = readFileSync("src/view.ts", "utf8");

  assert.match(source, /renderProjectCenter\(/);
  assert.match(source, /renderProjectAcai\(/);
  assert.match(source, /label: "记灵感"/);
  assert.doesNotMatch(source, /this\.renderAcaiTracker\(right\)/);
  assert.doesNotMatch(source, /text: "昨日遗留"/);
  assert.doesNotMatch(source, /text: "WORK TODOS"/);
  assert.doesNotMatch(source, /text: "PRODUCTS"/);
});

test("project-centered-dashboard.TODO_FORMAT.3 exposes project selectors in task surfaces", () => {
  const source = readFileSync("src/view.ts", "utf8");
  const styles = readFileSync("src/styles.css", "utf8");

  assert.match(source, /ts-project-filter/);
  assert.match(source, /ts-project-select/);
  assert.match(source, /updateTodoProject/);
  assert.match(styles, /\.ts-project-card/);
  assert.match(styles, /@media \(max-width: 680px\)/);
});

test("project-centered-dashboard.TODO_FORMAT.5 discovered projects feed todo selectors", () => {
  const source = readFileSync("src/view.ts", "utf8");

  assert.match(source, /const projectEntries = this\.getProjectEntries\(products, todos, scopedTodos, inspirations\)/);
  assert.match(source, /this\.renderTodos\(todoCard, todos, projectEntries\)/);
  assert.match(source, /this\.renderScopedTodos\(scopedCard, upcomingScopedTodos, "upcoming", projectEntries\)/);
});

test("project-centered-dashboard.PROJECT_CENTER.5 project header exposes aligned accessible toggle", () => {
  const source = readFileSync("src/view.ts", "utf8");
  const styles = readFileSync("src/styles.css", "utf8");

  assert.match(source, /toggle\.setAttr\("aria-expanded", String\(expanded\)\)/);
  assert.match(source, /const summary = toggle\.createSpan\(\{ cls: "ts-project-summary" \}\)/);
  assert.match(source, /const chevron = toggle\.createSpan\(\{ cls: "ts-project-chevron" \}\)/);
  assert.match(styles, /\.ts-project-toggle\[aria-expanded="true"\] \.ts-project-chevron/);
});

test("project-centered-dashboard.TIME_VIEWS.4 overdue card renders in the right column", () => {
  const source = readFileSync("src/view.ts", "utf8");

  assert.match(source, /const overdueCard = right\.createDiv\(\{ cls: "ts-card ts-overdue-card" \}\)/);
  assert.doesNotMatch(source, /const overdueCard = left\.createDiv\(\{ cls: "ts-card ts-overdue-card" \}\)/);
});
