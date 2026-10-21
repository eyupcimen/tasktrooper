import { ArrowRightToLine } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type BoardTask } from "@/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/hooks/useI18n";

interface MoveAllToTodoButtonProps {
  /** Backlog tasks to move, already in the order they should land in Todo. */
  tasks: BoardTask[];
  /** Todo only dispatches to an assignee, so an unassigned task is handed to this one (the PM). */
  fallbackAgentId?: string;
  onMoved: () => void;
}

export function MoveAllToTodoButton({ tasks, fallbackAgentId, onMoved }: MoveAllToTodoButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);

  // One request per task, in order, so Todo keeps the backlog's ordering.
  const moveAll = async () => {
    setMoving(true);
    let moved = 0;
    const failed: string[] = [];
    for (const task of tasks) {
      try {
        await api.updateRepositoryTask(task.repository_id, task.id, {
          column: "todo",
          ...(!task.assignee_agent_id && fallbackAgentId ? { assignee_agent_id: fallbackAgentId } : {}),
        });
        moved += 1;
      } catch {
        failed.push(task.key);
      }
    }
    setMoving(false);
    setOpen(false);
    onMoved();
    if (failed.length === 0) toast.success(t("boardArea.backlog.movedAll", { count: moved }));
    else toast.warning(t("boardArea.backlog.movedAllPartial", { count: moved, keys: failed.join(", ") }));
  };

  if (tasks.length === 0) return null;

  return (
    <>
      <Button variant="outline" className="gap-2" disabled={moving} onClick={() => setOpen(true)}>
        <ArrowRightToLine className="h-4 w-4" />
        {t("boardArea.backlog.moveAllCount", { count: tasks.length })}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("boardArea.backlog.moveAllTitle", { count: tasks.length })}
        description={t("boardArea.backlog.moveAllDescription")}
        confirmLabel={t("boardArea.backlog.moveAllConfirm")}
        loading={moving}
        onConfirm={moveAll}
      />
    </>
  );
}
