import { localDateStr } from "./vault-reader";
import type { DailyActivity } from "./vault-reader";

// Convert daily activity counts to snake Cell format
// Activity counts → level 0-4 (mapped to snk Color 0-4)
// level 0 = empty, 1-4 = progressively more active
export interface SnakeCell {
  x: number; // week column (0-51)
  y: number; // day of week (0=Mon, 6=Sun)
  level: number; // 0-4
}

// Map count to level (C method: total files across all workspaces that day)
function countToLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

// Build a 52-week grid (365 days) from activity data
// Returns cells in snk Cell[] format
export function buildSnakeCells(activity: DailyActivity[]): SnakeCell[] {
  const activityMap: Record<string, number> = {};
  for (const a of activity) {
    activityMap[a.date] = a.count;
  }

  const cells: SnakeCell[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start from 52 weeks ago, aligned to Monday
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 364);
  // Align to Monday
  const dayOfWeek = startDate.getDay(); // 0=Sun, 1=Mon, ...
  const daysToMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7;
  startDate.setDate(startDate.getDate() - (dayOfWeek === 1 ? 0 : dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  for (let week = 0; week < 53; week++) {
    for (let day = 0; day < 7; day++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + week * 7 + day);

      if (date > today) continue;

      const dateStr = localDateStr(date);
      const count = activityMap[dateStr] || 0;

      cells.push({
        x: week,
        y: day,
        level: countToLevel(count),
      });
    }
  }

  return cells;
}
