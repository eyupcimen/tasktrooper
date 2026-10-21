import type { CreateBoardTaskInput, TaskPriority } from "@/api";

/**
 * Turns a spreadsheet (CSV or .xlsx) into board tasks, with no mapping step:
 * columns are recognised by their header. The aliases cover the exports of
 * Jira (Summary, Issue Type), Trello (Card Name), Todoist (CONTENT, TYPE) and
 * plain hand-made sheets in English or Turkish.
 */

export type Cell = string | number | boolean | Date | null | undefined;

export type ImportedTask = CreateBoardTaskInput & { assignee?: string };

/** Matches a sheet's assignee cell against agent names, ignoring case, spaces and dashes. */
export function matchAgent<A extends { id: string; name: string }>(agents: A[], raw: string | undefined): A | undefined {
  const key = (value: string) => fold(value).replace(/[\s_-]+/g, "");
  const wanted = raw ? key(raw) : "";
  if (!wanted) return undefined;
  return agents.find((agent) => key(agent.name) === wanted);
}

export class TaskImportError extends Error {
  constructor(readonly code: "no_title" | "unsupported") {
    super(code);
  }
}

// Aliases are written folded (see `fold`), so "BAŞLIK", "Başlık" and
// "baslik" all match.
const TITLE = ["title", "summary", "card name", "name", "content", "task", "baslik", "gorev", "ad"];
const DESCRIPTION = ["description", "desc", "card description", "notes", "body", "aciklama"];
const TECHNICAL = ["technical description", "teknik aciklama"];
const PRIORITY = ["priority", "oncelik"];
const TYPE = ["issue type", "type", "task type", "tur", "tip"];
const CRITERIA = ["acceptance criteria", "kabul kriterleri", "criteria"];
const ASSIGNEE = ["assignee", "agent", "atanan", "sorumlu", "ajan"];
const SKIP = ["archived", "closed", "status category", "status", "durum", "state"];
const IGNORED = ["no", "#", "id", "sira", "issue key", "issue id", "card id", "created", "updated"];

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delimiter = [",", ";", "\t"].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function text(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** Lower-cases and drops Turkish diacritics; "I".toLowerCase() is "i", so ı folds to i too. */
function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/i̇/g, "i")
    .trim();
}

function findColumn(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index !== -1) return index;
  }
  return -1;
}

export function toPriority(raw: string): TaskPriority | undefined {
  const value = fold(raw);
  if (!value) return undefined;
  if (["highest", "critical", "blocker", "urgent", "kritik", "acil", "1", "p1"].includes(value)) return "critical";
  if (["high", "major", "yuksek", "2", "p2"].includes(value)) return "high";
  if (["medium", "normal", "orta", "3", "p3"].includes(value)) return "medium";
  if (["low", "lowest", "minor", "trivial", "dusuk", "4", "p4"].includes(value)) return "low";
  return undefined;
}

function isTruthy(raw: string): boolean {
  return ["true", "yes", "1", "evet", "done", "completed", "closed", "tamamlandi", "bitti", "kapandi"].includes(fold(raw));
}

/**
 * The first row is the header. Rows without a title are skipped, as are
 * Todoist's section/note rows and archived Trello cards.
 */
export function rowsToTasks(rows: Cell[][]): ImportedTask[] {
  const [head, ...body] = rows;
  if (!head) return [];
  const headers = head.map((h) => fold(text(h)));
  const col = {
    title: findColumn(headers, TITLE),
    description: findColumn(headers, DESCRIPTION),
    technical: findColumn(headers, TECHNICAL),
    priority: findColumn(headers, PRIORITY),
    type: findColumn(headers, TYPE),
    criteria: findColumn(headers, CRITERIA),
    assignee: findColumn(headers, ASSIGNEE),
  };
  if (col.title === -1) {
    throw new TaskImportError("no_title");
  }
  const skipColumns = SKIP.map((name) => headers.indexOf(name)).filter((i) => i !== -1);
  const used = new Set<number>([...Object.values(col), ...skipColumns]);
  const extraColumns = headers
    .map((name, index) => ({ name, label: text(head[index]), index }))
    .filter(({ name, index }) => name && !used.has(index) && !IGNORED.includes(name));

  const tasks: ImportedTask[] = [];
  for (const row of body) {
    const get = (index: number) => (index === -1 ? "" : text(row[index]));
    const title = get(col.title);
    if (!title) continue;
    const kind = fold(get(col.type));
    if (kind === "section" || kind === "note") continue;
    if (skipColumns.some((i) => isTruthy(text(row[i])))) continue;

    const task: ImportedTask = { title: title.slice(0, 500), column: "backlog" };
    const assignee = get(col.assignee);
    if (assignee) task.assignee = assignee;
    const extras = extraColumns
      .map(({ label, index }) => [label, get(index)] as const)
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value}`);
    const description = [get(col.description), extras.join("\n")].filter(Boolean).join("\n\n");
    if (description) task.description = description;
    const technical = get(col.technical);
    if (technical) task.technical_description = technical;
    const priority = toPriority(get(col.priority));
    if (priority) task.priority = priority;
    if (kind === "bug" || kind === "hata") task.task_type = "bug";
    const criteria = get(col.criteria)
      .split(/\r?\n|;/)
      .map((line) => line.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
      .filter(Boolean);
    if (criteria.length) task.acceptance_criteria = criteria.map((text, position) => ({ text, position }));
    tasks.push(task);
  }
  return tasks;
}

const STOPWORDS = new Set(["ve", "ile", "icin", "bir", "the", "and", "for", "of", "to", "a", "an", "vb", "veya", "or"]);

function titleStems(title: string): Set<string> {
  return new Set(
    fold(title)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 1 && !STOPWORDS.has(word))
      .map((word) => word.slice(0, 5)),
  );
}

/**
 * Whether a board already has this task under a reworded title. Agents rewrite
 * sheet rows when they file them ("Git deposu başlat ve ilk commit" becomes
 * "Git deposunu hazırla ve ilk commit'i at"), so equality would re-import every
 * one. Words are cut to a five-letter stem to absorb Turkish suffixes, and the
 * overlap is measured against the shorter title.
 */
export function isDuplicateTitle(title: string, existing: string[], threshold = 0.6): boolean {
  const stems = titleStems(title);
  if (stems.size === 0) return false;
  return existing.some((other) => {
    const otherStems = titleStems(other);
    if (otherStems.size === 0) return false;
    let shared = 0;
    for (const stem of stems) if (otherStems.has(stem)) shared += 1;
    return shared / Math.min(stems.size, otherStems.size) >= threshold;
  });
}

export async function readTaskFile(file: File): Promise<ImportedTask[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return rowsToTasks((await readSheet(file)) as Cell[][]);
  }
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
    return rowsToTasks(parseCsv(await file.text()));
  }
  throw new TaskImportError("unsupported");
}
