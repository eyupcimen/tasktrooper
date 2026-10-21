import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, type BoardTask } from "@/api";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import { usePolling } from "@/hooks/usePolling";
import { awaitsHuman, diagnoseBoard } from "@/lib/board-diagnosis";
import { desktopRunner } from "@/lib/desktop-bridge";

const POLL_MS = 60_000;

interface Attention {
  human: number;
  stalled: number;
  blocked: number;
}

const NONE: Attention = { human: 0, stalled: 0, blocked: 0 };

// Lives in the workspace shell, not the board: what needs the person must be
// seen from any screen, and the Dock badge must stay right while the board is
// closed. The board itself already explains each item, so the bar hides there.
export function AttentionBanner() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [attention, setAttention] = useState<Attention>(NONE);

  const refresh = useCallback(async () => {
    try {
      const { repositories = [] } = await api.listRepositories();
      const lists = await Promise.all(
        repositories.map((repo) => api.listRepositoryTasks(repo.id).then((d) => d.tasks ?? [], () => [] as BoardTask[])),
      );
      const active = await api.listActivity(100).then(
        (data) =>
          new Set(
            (data.items ?? [])
              .filter((item) => item.kind === "agent_run" && item.task_id && item.status === "running")
              .map((item) => item.task_id as string),
          ),
        () => new Set<string>(),
      );
      const tasks = lists.flat();
      const roots = diagnoseBoard(tasks, active).roots;
      setAttention({
        human: tasks.filter(awaitsHuman).length,
        stalled: roots.filter((r) => r.reason === "stalled").length,
        blocked: roots.filter((r) => r.reason === "blocked").length,
      });
    } catch {
      // Keep the last answer: a blip must not clear a real alert.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);
  usePolling(refresh, POLL_MS, true);

  const count = attention.human + attention.stalled + attention.blocked;

  useEffect(() => {
    void desktopRunner()?.setAttention?.(count).catch(() => {});
  }, [count]);

  if (count === 0 || pathname === "/board") return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">
      <AlertTriangle className="h-4 w-4 text-destructive" />
      <span className="font-semibold text-destructive">{t("boardArea.status.attention", { count })}</span>
      <span className="text-muted-foreground">{t("boardArea.status.attentionDetail", { ...attention })}</span>
      <Button asChild size="sm" variant="destructive" className="ml-auto h-7 px-2 text-micro">
        <Link to="/board">{t("boardArea.status.attentionOpen")}</Link>
      </Button>
    </div>
  );
}
