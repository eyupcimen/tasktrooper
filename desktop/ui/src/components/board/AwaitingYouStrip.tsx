import { Check, HelpCircle, UserCheck } from "lucide-react";
import type { BoardColumn, BoardTask } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/hooks/useI18n";
import { awaitsHuman } from "@/lib/board-diagnosis";

const APPROVABLE = new Set(["analiz_review", "human_uat"]);

interface AwaitingYouStripProps {
  tasks: BoardTask[];
  columns: BoardColumn[];
  onOpen: (task: BoardTask) => void;
  onApprove: (task: BoardTask) => void;
}

// The human-gated columns sit at the far right of a wide board, so a card
// waiting on the user was easy to miss; this lifts them above the lanes.
export function AwaitingYouStrip({ tasks, columns, onOpen, onApprove }: AwaitingYouStripProps) {
  const { t } = useI18n();
  const waiting = tasks.filter(awaitsHuman);
  if (waiting.length === 0) return null;

  const columnLabel = (slug: string) => columns.find((c) => c.slug === slug)?.label ?? slug;

  return (
    <Card className="mb-3 border-amber-500/40 bg-amber-500/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <UserCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        {t("boardArea.board.awaitingYou", { count: waiting.length })}
      </div>
      <div className="flex flex-wrap gap-2">
        {waiting.map((task) => (
          <div
            key={task.id}
            className="flex max-w-full items-center gap-2 rounded-md border border-border bg-background py-1 pr-1 pl-2"
          >
            <Badge variant="outline" className="font-mono text-micro">
              {task.key}
            </Badge>
            <button
              type="button"
              className="max-w-[18rem] truncate text-left text-sm hover:underline"
              title={task.title}
              onClick={() => onOpen(task)}
            >
              {task.title}
            </button>
            <Badge variant="secondary" className="shrink-0 text-micro">
              {APPROVABLE.has(task.column) ? columnLabel(task.column) : t("boardArea.board.awaitingAnswer")}
            </Badge>
            {APPROVABLE.has(task.column) ? (
              <Button size="sm" className="h-7 gap-1 px-2 text-micro" onClick={() => onApprove(task)}>
                <Check className="h-3.5 w-3.5" />
                {t("boardArea.components.taskDetail.analizReviewApprove")}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-micro" onClick={() => onOpen(task)}>
                <HelpCircle className="h-3.5 w-3.5" />
                {t("boardArea.board.awaitingOpen")}
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
