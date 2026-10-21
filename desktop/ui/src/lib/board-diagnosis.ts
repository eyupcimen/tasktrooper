import type { BoardTask } from "@/api";
import { workOrderBlockerKeys } from "@/lib/project-board";

export type StallReason =
  | "usage_limit"
  | "awaiting_human"
  | "blocked"
  | "in_backlog"
  | "no_assignee"
  | "resource"
  | "working"
  | "stalled"
  | "queued";

export interface StallRoot {
  task: BoardTask;
  reason: StallReason;
  /** How many other tasks wait on this one, directly or down a chain. */
  waiting: number;
}

export interface BoardDiagnosis {
  running: number;
  waitingTasks: number;
  roots: StallRoot[];
}

const FINISHED = new Set(["done", "released"]);
const HUMAN_COLUMNS = new Set(["analiz_review", "human_uat"]);
const AGENT_COLUMNS = new Set(["in_progress", "code_review", "ready_for_qa", "in_qa", "need_revision", "pm_uat"]);
const APPROVAL_COLUMNS = new Set(["analiz_review", "human_uat"]);

/** Past this, an agent column with no agent on the card is stuck, not queued. */
export const STALL_MINUTES = 15;

export function awaitsHuman(task: BoardTask): boolean {
  return (
    APPROVAL_COLUMNS.has(task.column) ||
    task.blocked_resource === "human_decision" ||
    task.blocked_resource === "analysis_questions"
  );
}

/** Minutes since the card last changed, or null when the server sent no timestamps. */
export function idleMinutes(task: BoardTask, now = Date.now()): number | null {
  const stamps = [task.column_entered_at, task.updated_at]
    .filter((v): v is string => !!v)
    .map((v) => new Date(v).getTime())
    .filter((v) => !Number.isNaN(v));
  if (stamps.length === 0) return null;
  return Math.floor((now - Math.max(...stamps)) / 60000);
}

function reasonOf(task: BoardTask, active: Set<string>, now: number): StallReason | null {
  if (active.has(task.id)) return "working";
  const resource = task.blocked_resource ?? "";
  if (resource === "llm_provider_code_quota" || /quota|usage/.test(resource)) return "usage_limit";
  if (resource === "human_decision" || resource === "analysis_questions") return "awaiting_human";
  if (HUMAN_COLUMNS.has(task.column)) return "awaiting_human";
  if (resource && resource !== "work_order") return "resource";
  if (task.column === "blocked") return "blocked";
  if (task.column === "backlog") return "in_backlog";
  if (task.column === "todo" && !task.assignee_agent_id && !resource) return "no_assignee";
  if (AGENT_COLUMNS.has(task.column) || task.column === "todo") {
    const idle = idleMinutes(task, now);
    return idle !== null && idle >= STALL_MINUTES && !resource ? "stalled" : "queued";
  }
  return null;
}

/**
 * Explains why the board is not moving: every work_order park is followed down
 * its blocker chain to the task actually holding it up, and those roots are
 * ranked by how much of the board waits behind them. Blocker keys come from
 * blocked_question; their column is read from the live task, because the
 * column printed in that text is the one the blocker had when the park began.
 */
export function diagnoseBoard(tasks: BoardTask[], active: Set<string>, now = Date.now()): BoardDiagnosis {
  const byKey = new Map(tasks.map((task) => [task.key, task]));
  const live = tasks.filter((task) => !FINISHED.has(task.column));

  const rootsOf = (task: BoardTask, seen: Set<string>): BoardTask[] => {
    if (seen.has(task.id)) return [];
    seen.add(task.id);
    if (task.blocked_resource !== "work_order") return [task];
    const blockers = workOrderBlockerKeys(task.blocked_question ?? "")
      .map((key) => byKey.get(key))
      .filter((blocker): blocker is BoardTask => !!blocker && !FINISHED.has(blocker.column));
    // Every blocker finished but the park not yet swept: the task itself is next.
    if (blockers.length === 0) return [task];
    return blockers.flatMap((blocker) => rootsOf(blocker, seen));
  };

  const waitingOn = new Map<string, number>();
  let waitingTasks = 0;
  for (const task of live) {
    if (task.blocked_resource !== "work_order") continue;
    waitingTasks += 1;
    for (const root of new Set(rootsOf(task, new Set()))) {
      if (root.id !== task.id) waitingOn.set(root.id, (waitingOn.get(root.id) ?? 0) + 1);
    }
  }

  const roots: StallRoot[] = [];
  for (const task of live) {
    const waiting = waitingOn.get(task.id) ?? 0;
    const reason = reasonOf(task, active, now);
    if (!reason || task.blocked_resource === "work_order") continue;
    // Backlog and plain queued work only matter when something waits on them.
    if ((reason === "in_backlog" || reason === "queued" || reason === "working") && waiting === 0) continue;
    roots.push({ task, reason, waiting });
  }

  const rank: Record<StallReason, number> = {
    awaiting_human: 0, stalled: 1, usage_limit: 2, blocked: 3, in_backlog: 4, no_assignee: 5, resource: 6, queued: 7, working: 8,
  };
  roots.sort((a, b) => b.waiting - a.waiting || rank[a.reason] - rank[b.reason]);
  return { running: active.size, waitingTasks, roots };
}
