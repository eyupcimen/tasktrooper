import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api, type Agent } from "@/api";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import { isDuplicateTitle, matchAgent, readTaskFile, TaskImportError } from "@/lib/task-import";

interface ImportTasksButtonProps {
  repositoryId?: string;
  initiativeProjectId?: string;
  agents: Agent[];
  existingTitles: string[];
  /** Todo only dispatches to an assignee, so a row naming no known agent goes to this one (the PM). */
  fallbackAgentId?: string;
  onImported: () => void;
}

export function ImportTasksButton({
  repositoryId,
  initiativeProjectId,
  agents,
  existingTitles,
  fallbackAgentId,
  onImported,
}: ImportTasksButtonProps) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const importFile = async (file: File) => {
    if (!repositoryId) {
      toast.error(t("boardArea.board.importNoRepository"));
      return;
    }
    setBusy(true);
    try {
      const tasks = await readTaskFile(file);
      if (tasks.length === 0) {
        toast.error(t("boardArea.board.importEmpty"));
        return;
      }
      let created = 0;
      let skipped = 0;
      const failed: string[] = [];
      const known = [...existingTitles];
      // Sequential on purpose: positions in Backlog follow the file's row order.
      for (const { assignee, ...task } of tasks) {
        if (isDuplicateTitle(task.title, known)) {
          skipped += 1;
          continue;
        }
        known.push(task.title);
        try {
          await api.createRepositoryTask(repositoryId, {
            ...task,
            initiative_project_id: initiativeProjectId,
            assignee_agent_id: matchAgent(agents, assignee)?.id ?? fallbackAgentId,
          });
          created += 1;
        } catch {
          failed.push(task.title);
        }
      }
      onImported();
      if (skipped > 0) toast.info(t("boardArea.board.importSkipped", { count: skipped }));
      if (created === 0 && failed.length === 0) return;
      if (failed.length === 0) {
        toast.success(t("boardArea.board.importDone", { count: created }));
      } else {
        toast.warning(
          t("boardArea.board.importPartial", { count: created, failed: failed.length, titles: failed.slice(0, 3).join(", ") }),
        );
      }
    } catch (e) {
      toast.error(
        e instanceof TaskImportError
          ? t(e.code === "no_title" ? "boardArea.board.importNoTitle" : "boardArea.board.importUnsupported")
          : e instanceof Error
            ? e.message
            : t("boardArea.board.importFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importFile(file);
        }}
      />
      <Button
        variant="outline"
        className="gap-2"
        disabled={busy}
        title={t("boardArea.board.importHint")}
        onClick={() => input.current?.click()}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {t("boardArea.board.import")}
      </Button>
    </>
  );
}
