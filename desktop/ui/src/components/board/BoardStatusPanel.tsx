import { Activity, ArrowRightToLine, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import type { BoardColumn, BoardTask } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/hooks/useI18n";
import { diagnoseBoard, idleMinutes, type StallRoot } from "@/lib/board-diagnosis";
import { blockedResourceLabel, formatResumeIn } from "@/lib/project-board";
import { formatDate } from "@/lib/utils";

const MAX_ROOTS = 5;

interface BoardStatusPanelProps {
  tasks: BoardTask[];
  columns: BoardColumn[];
  activeTaskIds: Set<string>;
  onOpen: (task: BoardTask) => void;
  onMoveToTodo: (task: BoardTask) => void;
  onRestart: (task: BoardTask) => void;
}

export function BoardStatusPanel({
  tasks,
  columns,
  activeTaskIds,
  onOpen,
  onMoveToTodo,
  onRestart,
}: BoardStatusPanelProps) {
  const { t } = useI18n();
  const diagnosis = useMemo(() => diagnoseBoard(tasks, activeTaskIds), [tasks, activeTaskIds]);
  // A human gate with nothing behind it is already in the "waiting for you" strip.
  const roots = diagnosis.roots.filter((root) => !(root.reason === "awaiting_human" && root.waiting === 0));
  if (roots.length === 0) return null;

  const columnLabel = (slug: string) => columns.find((c) => c.slug === slug)?.label ?? slug;

  const explain = (root: StallRoot): string => {
    const { task } = root;
    switch (root.reason) {
      case "usage_limit":
        return task.blocked_resume_at
          ? t("boardArea.status.usageLimitAt", {
              time: formatDate(task.blocked_resume_at),
              left: formatResumeIn(task.blocked_resume_at),
            })
          : t("boardArea.status.usageLimit");
      case "awaiting_human":
        return task.blocked_resource === "human_decision" && task.blocked_question
          ? t("boardArea.status.blockedWith", { reason: task.blocked_question.slice(0, 200) })
          : t("boardArea.status.awaitingHuman", { column: columnLabel(task.column) });
      case "stalled":
        return t("boardArea.status.stalled", {
          column: columnLabel(task.column),
          minutes: idleMinutes(task) ?? 0,
        });
      case "blocked":
        return task.blocked_question
          ? t("boardArea.status.blockedWith", { reason: task.blocked_question.slice(0, 160) })
          : t("boardArea.status.blocked");
      case "in_backlog":
        return t("boardArea.status.inBacklog");
      case "no_assignee":
        return t("boardArea.status.noAssignee");
      case "resource":
        return blockedResourceLabel(task.blocked_resource ?? "");
      case "working":
        return t("boardArea.status.working");
      case "queued":
        return t("boardArea.status.queued", { column: columnLabel(task.column) });
    }
  };

  return (
    <Card className="mb-3 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">{t("boardArea.status.title")}</span>
        <span className="text-muted-foreground">
          {t("boardArea.status.summary", { running: diagnosis.running, waiting: diagnosis.waitingTasks })}
        </span>
      </div>
      <ul className="space-y-1.5">
        {roots.slice(0, MAX_ROOTS).map((root) => (
          <li key={root.task.id} className="flex flex-wrap items-center gap-2 text-sm">
            {/* The key, not the title: the card on the board already shows the title. */}
            <button
              type="button"
              className="shrink-0 rounded font-mono text-xs font-semibold hover:underline"
              title={root.task.title}
              aria-label={root.task.title}
              onClick={() => onOpen(root.task)}
            >
              {root.task.key}
            </button>
            <span className="min-w-0 flex-1 text-muted-foreground">{explain(root)}</span>
            {root.waiting > 0 && (
              <Badge variant="warning" className="shrink-0 text-micro">
                {t("boardArea.status.waitingOnThis", { count: root.waiting })}
              </Badge>
            )}
            {root.reason === "stalled" && (
              <Button size="sm" className="h-7 gap-1 px-2 text-micro" onClick={() => onRestart(root.task)}>
                <RotateCcw className="h-3.5 w-3.5" />
                {t("boardArea.status.restart")}
              </Button>
            )}
            {(root.reason === "in_backlog" || root.reason === "no_assignee") && root.task.column === "backlog" && (
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-micro" onClick={() => onMoveToTodo(root.task)}>
                <ArrowRightToLine className="h-3.5 w-3.5" />
                {t("boardArea.status.moveToTodo")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
