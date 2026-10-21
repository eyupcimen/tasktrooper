import { describe, expect, it } from "vitest";
import type { BoardTask } from "@/api";
import { diagnoseBoard } from "./board-diagnosis";

function task(key: string, column: string, extra: Partial<BoardTask> = {}): BoardTask {
  return { id: key, key, title: key, column, assignee_agent_id: "dev", ...extra } as BoardTask;
}

const wait = (...keys: string[]) => ({
  blocked_resource: "work_order",
  blocked_question: `waiting for ${keys.map((k) => `${k} (title, with comma) [todo]`).join(", ")} to finish`,
});

describe("diagnoseBoard", () => {
  it("follows a chain to the task holding it up", () => {
    const tasks = [
      task("A", "blocked", { blocked_resource: "llm_provider_code_quota" }),
      task("B", "todo", wait("A")),
      task("C", "todo", wait("B")),
    ];
    const { roots, waitingTasks } = diagnoseBoard(tasks, new Set());
    expect(waitingTasks).toBe(2);
    expect(roots).toEqual([{ task: tasks[0], reason: "usage_limit", waiting: 2 }]);
  });

  it("reads the blocker's live column, not the stale one in the text", () => {
    const tasks = [task("A", "done"), task("B", "todo", wait("A"))];
    expect(diagnoseBoard(tasks, new Set()).roots).toEqual([]);
  });

  it("names a backlog task that a chain waits on", () => {
    const tasks = [task("A", "backlog", { assignee_agent_id: undefined }), task("B", "todo", wait("A"))];
    expect(diagnoseBoard(tasks, new Set()).roots[0]).toMatchObject({ reason: "in_backlog", waiting: 1 });
  });

  it("reports human gates and unassigned todo tasks even with nothing behind them", () => {
    const tasks = [task("A", "human_uat"), task("B", "todo", { assignee_agent_id: undefined })];
    const reasons = diagnoseBoard(tasks, new Set()).roots.map((r) => r.reason);
    expect(reasons).toEqual(["awaiting_human", "no_assignee"]);
  });

  it("survives a blocker cycle", () => {
    const tasks = [task("A", "todo", wait("B")), task("B", "todo", wait("A"))];
    expect(() => diagnoseBoard(tasks, new Set())).not.toThrow();
  });

  it("calls an agent column with nobody on it for too long stuck", () => {
    const now = Date.parse("2026-10-07T14:30:00Z");
    const old = "2026-10-07T10:38:00Z";
    const fresh = "2026-10-07T14:25:00Z";
    const tasks = [
      task("A", "in_qa", { column_entered_at: old, updated_at: old }),
      task("B", "in_qa", { column_entered_at: fresh, updated_at: fresh }),
      task("C", "in_qa", { column_entered_at: old, updated_at: old }),
    ];
    const roots = diagnoseBoard(tasks, new Set(["C"]), now).roots;
    expect(roots.map((r) => [r.task.key, r.reason])).toEqual([["A", "stalled"]]);
  });
});
