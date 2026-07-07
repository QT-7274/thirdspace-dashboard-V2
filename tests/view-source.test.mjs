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
