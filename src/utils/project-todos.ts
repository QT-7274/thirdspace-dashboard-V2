export function deduplicateProjectTodos<T extends { taskId?: string }>(items: T[]): T[] {
  const seenTaskIds = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (!item.taskId) {
      result.push(item);
      continue;
    }
    if (seenTaskIds.has(item.taskId)) continue;
    seenTaskIds.add(item.taskId);
    result.push(item);
  }

  return result;
}
