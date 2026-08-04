export const DEFAULT_SCOPED_TASK_BATCH_SIZE = 4;

export function getNextVisibleCount(
  currentVisible: number,
  total: number,
  batchSize = DEFAULT_SCOPED_TASK_BATCH_SIZE,
): number {
  return Math.min(total, currentVisible + batchSize);
}

export function getRemainingCount(total: number, visible: number): number {
  return Math.max(0, total - visible);
}

// dashboard-experience-refinement.EXPANDABLE_LISTS.1
export function getVisibleCount(defaultVisible: number, total: number, expanded: boolean): number {
  return expanded ? total : Math.min(defaultVisible, total);
}
