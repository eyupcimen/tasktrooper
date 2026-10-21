package http

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

const (
	taskSheetMaxDepth = 2
	taskSheetMaxBytes = 10 << 20
)

// A spreadsheet only counts as a task list when its name says so: a repository
// can carry data CSVs (fixtures, food tables) that must never become tasks.
var taskSheetNameHints = []string{"yapilacak", "todo", "task", "gorev", "backlog", "roadmap", "is-listesi", "is_listesi"}

var taskSheetSkipDirs = map[string]bool{
	".git": true, "node_modules": true, "build": true, "dist": true, ".dart_tool": true,
	"Pods": true, ".gradle": true, "vendor": true, ".next": true, "coverage": true,
}

func foldTaskSheetName(name string) string {
	return strings.NewReplacer("ı", "i", "İ", "i", "ş", "s", "Ş", "s", "ğ", "g", "Ğ", "g",
		"ü", "u", "Ü", "u", "ö", "o", "Ö", "o", "ç", "c", "Ç", "c").Replace(strings.ToLower(name))
}

func isTaskSheet(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	if ext != ".xlsx" && ext != ".csv" {
		return false
	}
	if strings.HasPrefix(name, "~$") || strings.HasPrefix(name, ".") {
		return false
	}
	folded := foldTaskSheetName(strings.TrimSuffix(name, filepath.Ext(name)))
	for _, hint := range taskSheetNameHints {
		if strings.Contains(folded, hint) {
			return true
		}
	}
	return false
}

func taskSheetNotFound(c *fiber.Ctx, message string) error {
	return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": fiber.Map{"message": message, "type": "not_found"}})
}

// taskSheetRoot resolves symlinks so the containment checks below compare
// like with like (/var and /private/var on macOS).
func (h *Handler) taskSheetRoot(c *fiber.Ctx) (string, bool, error) {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return "", false, badRequest(c, "invalid repository id")
	}
	repo, err := h.repositorySvc.Get(h.enrichContext(c), id)
	if err != nil {
		return "", false, taskSheetNotFound(c, err.Error())
	}
	if repo.RootPath == "" {
		return "", false, taskSheetNotFound(c, "repository has no working copy")
	}
	root, err := filepath.EvalSymlinks(filepath.Clean(repo.RootPath))
	if err != nil {
		return "", false, taskSheetNotFound(c, "working copy is not on disk")
	}
	return root, true, nil
}

// ListTaskSheets — GET /v1/repositories/:id/task-sheets
//
// Spreadsheets in the working copy (two levels deep) whose name marks them as
// a task list. The UI imports them into Backlog on its own.
func (h *Handler) ListTaskSheets(c *fiber.Ctx) error {
	root, ok, err := h.taskSheetRoot(c)
	if !ok {
		return err
	}
	sheets := make([]fiber.Map, 0)
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		if d.IsDir() {
			if path != root && (taskSheetSkipDirs[d.Name()] || strings.Count(rel, string(filepath.Separator)) >= taskSheetMaxDepth) {
				return filepath.SkipDir
			}
			return nil
		}
		if !isTaskSheet(d.Name()) {
			return nil
		}
		info, err := d.Info()
		if err != nil || info.Size() > taskSheetMaxBytes {
			return nil
		}
		sheets = append(sheets, fiber.Map{
			"path":        filepath.ToSlash(rel),
			"name":        d.Name(),
			"size":        info.Size(),
			"modified_at": info.ModTime().UTC(),
		})
		return nil
	})
	return c.JSON(fiber.Map{"sheets": sheets})
}

// GetTaskSheet — GET /v1/repositories/:id/task-sheets/content?path=
//
// The raw bytes of one sheet ListTaskSheets would list; anything else, or a
// path that resolves outside the working copy, is refused.
func (h *Handler) GetTaskSheet(c *fiber.Ctx) error {
	root, ok, err := h.taskSheetRoot(c)
	if !ok {
		return err
	}
	rel := filepath.FromSlash(c.Query("path"))
	inside := root + string(filepath.Separator)
	full := filepath.Join(root, rel)
	if rel == "" || filepath.IsAbs(rel) || !strings.HasPrefix(full, inside) || !isTaskSheet(filepath.Base(full)) {
		return badRequest(c, "not a task sheet in this repository")
	}
	resolved, err := filepath.EvalSymlinks(full)
	if err != nil {
		return taskSheetNotFound(c, "task sheet not found")
	}
	if !strings.HasPrefix(resolved, inside) {
		return badRequest(c, "not a task sheet in this repository")
	}
	info, err := os.Stat(resolved)
	if err != nil || info.IsDir() || info.Size() > taskSheetMaxBytes {
		return taskSheetNotFound(c, "task sheet not found")
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		return taskSheetNotFound(c, "task sheet not found")
	}
	if strings.EqualFold(filepath.Ext(full), ".csv") {
		c.Set(fiber.HeaderContentType, "text/csv; charset=utf-8")
	} else {
		c.Set(fiber.HeaderContentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	}
	return c.Send(data)
}
