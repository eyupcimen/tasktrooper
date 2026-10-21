import { describe, expect, it } from "vitest";
import { isDuplicateTitle, matchAgent, parseCsv, rowsToTasks, TaskImportError } from "./task-import";

describe("parseCsv", () => {
  it("keeps quoted commas, quotes and newlines inside one cell", () => {
    expect(parseCsv('Title,Description\n"A, b","line 1\nline ""2"""\n')).toEqual([
      ["Title", "Description"],
      ["A, b", 'line 1\nline "2"'],
    ]);
  });

  it("detects a semicolon delimiter and strips the BOM", () => {
    expect(parseCsv("﻿Başlık;Öncelik\r\nX;Yüksek")).toEqual([
      ["Başlık", "Öncelik"],
      ["X", "Yüksek"],
    ]);
  });
});

describe("rowsToTasks", () => {
  it("reads a Jira export", () => {
    const rows = parseCsv(
      "Summary,Issue key,Issue Type,Priority,Description,Status Category\n" +
        "Login fails,PRJ-1,Bug,Highest,Steps here,To Do\n" +
        "Old work,PRJ-2,Story,Low,,Done\n",
    );
    expect(rowsToTasks(rows)).toEqual([
      {
        title: "Login fails",
        column: "backlog",
        task_type: "bug",
        priority: "critical",
        description: "Steps here",
      },
    ]);
  });

  it("skips Todoist section rows", () => {
    const rows = parseCsv("TYPE,CONTENT,DESCRIPTION,PRIORITY\nsection,Phase 1,,\ntask,Write docs,,2\n");
    expect(rowsToTasks(rows)).toEqual([{ title: "Write docs", column: "backlog", priority: "high" }]);
  });

  it("matches Turkish headers in any case and splits acceptance criteria", () => {
    const tasks = rowsToTasks([
      ["BAŞLIK", "AÇIKLAMA", "Kabul Kriterleri"],
      ["Sepet", "Ürün ekle", "- ekler\n- siler"],
    ]);
    expect(tasks[0]).toMatchObject({
      title: "Sepet",
      description: "Ürün ekle",
      acceptance_criteria: [
        { text: "ekler", position: 0 },
        { text: "siler", position: 1 },
      ],
    });
  });

  it("fails without a title column", () => {
    expect(() => rowsToTasks([["foo"], ["bar"]])).toThrow(TaskImportError);
  });

  it("keeps the assignee cell for agent matching", () => {
    const [task] = rowsToTasks([["Title", "Atanan"], ["API", "Backend Developer"]]);
    expect(task.assignee).toBe("Backend Developer");
  });
});

describe("matchAgent", () => {
  const agents = [
    { id: "1", name: "backend-developer" },
    { id: "2", name: "product-manager" },
  ];

  it("ignores case, spaces and dashes", () => {
    expect(matchAgent(agents, "Backend Developer")?.id).toBe("1");
    expect(matchAgent(agents, "PRODUCT_MANAGER")?.id).toBe("2");
  });

  it("returns nothing for an unknown or empty name", () => {
    expect(matchAgent(agents, "designer")).toBeUndefined();
    expect(matchAgent(agents, "")).toBeUndefined();
  });
});

describe("a Victus-style sheet", () => {
  const rows = [
    ["No", "Aşama", "Görev", "Platform", "Durum", "Not"],
    [17, "Kurulum", "Git deposu başlat ve ilk commit", "Her İkisi", "Bekliyor", null],
    [18, "Kurulum", "iOS tarafı: Xcode workspace ayarları", "iOS", "Tamamlandı", null],
  ];

  it("skips finished rows and folds the extra columns into the description", () => {
    expect(rowsToTasks(rows)).toEqual([
      {
        title: "Git deposu başlat ve ilk commit",
        column: "backlog",
        description: "Aşama: Kurulum\nPlatform: Her İkisi",
      },
    ]);
  });
});

describe("isDuplicateTitle", () => {
  it("recognises a title an agent reworded", () => {
    const board = [
      "Git deposunu hazırla ve ilk commit'i at",
      "Flutter projesini oluştur (proje yapısı, lint kuralları)",
      "Android: Gradle ayarları, package name ve imzalama",
    ];
    expect(isDuplicateTitle("Git deposu başlat ve ilk commit", board)).toBe(true);
    expect(isDuplicateTitle("Flutter projesini oluştur (flutter create, proje yapısı, lint kuralları)", board)).toBe(true);
    expect(isDuplicateTitle("Android tarafı: Gradle ayarları, package name, imzalama key'i", board)).toBe(true);
  });

  it("keeps a genuinely new task", () => {
    expect(isDuplicateTitle("Marka kimliği: logo, renk paleti, tipografi", ["Git deposunu hazırla ve ilk commit'i at"])).toBe(false);
  });
});
