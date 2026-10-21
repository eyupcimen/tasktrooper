import { useEffect } from "react";
import { toast } from "sonner";
import { api, type Agent, type Repository, type TaskSheet } from "@/api";
import { useI18n } from "@/hooks/useI18n";
import { isDuplicateTitle, matchAgent, readTaskFile } from "@/lib/task-import";

const SEEN_PREFIX = "taskSheetImported:";

// Shared across mounts: the board and the backlog page both run this, and
// StrictMode mounts twice, but a sheet must be read only once at a time.
const inFlight = new Set<string>();

function sheetKey(repositoryId: string, sheet: TaskSheet): string {
  return `${SEEN_PREFIX}${repositoryId}:${sheet.path}:${sheet.modified_at}`;
}

function seen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function markSeen(key: string): void {
  try {
    window.localStorage.setItem(key, new Date().toISOString());
  } catch {
    // Duplicate detection below still keeps a re-run from adding anything twice.
  }
}

/**
 * The start trigger: a task-list spreadsheet in a repository is turned into
 * Backlog tasks the first time the board sees it, and again whenever the file
 * changes. Rows that already exist on the board (even reworded) are skipped.
 */
export function useTaskSheetAutoImport(repositories: Repository[], agents: Agent[], onImported: () => void) {
  const { t } = useI18n();
  const repoIds = repositories.map((r) => r.id).join(",");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (const repo of repositories) {
        let sheets: TaskSheet[] = [];
        try {
          sheets = (await api.listTaskSheets(repo.id)).sheets ?? [];
        } catch {
          continue;
        }
        for (const sheet of sheets) {
          const key = sheetKey(repo.id, sheet);
          if (cancelled || seen(key) || inFlight.has(key)) continue;
          inFlight.add(key);
          try {
            const [rows, existing] = await Promise.all([
              api.fetchTaskSheet(repo.id, sheet).then(readTaskFile),
              api.listRepositoryTasks(repo.id).then((data) => data.tasks.map((task) => task.title)),
            ]);
            let created = 0;
            for (const { assignee, ...task } of rows) {
              if (isDuplicateTitle(task.title, existing)) continue;
              await api.createRepositoryTask(repo.id, {
                ...task,
                initiative_project_id: repo.project_ids?.length === 1 ? repo.project_ids[0] : undefined,
                assignee_agent_id: matchAgent(agents, assignee)?.id,
              });
              existing.push(task.title);
              created += 1;
            }
            markSeen(key);
            if (created > 0) {
              toast.success(t("boardArea.board.sheetImported", { name: sheet.name, count: created }));
              onImported();
            }
          } catch (e) {
            toast.error(
              t("boardArea.board.sheetImportFailed", {
                name: sheet.name,
                reason: e instanceof Error ? e.message : "",
              }),
            );
          } finally {
            inFlight.delete(key);
          }
        }
      }
    };
    if (repositories.length > 0 && agents.length > 0) void run();
    return () => {
      cancelled = true;
    };
    // Re-runs only when the set of repositories changes, not on every poll.
  }, [repoIds, agents.length > 0]);
}
