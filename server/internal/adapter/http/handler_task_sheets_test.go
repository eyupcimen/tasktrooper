package http

import "testing"

func TestIsTaskSheet(t *testing.T) {
	cases := map[string]bool{
		"Victus_Yapilacaklar.xlsx": true,
		"YAPILACAKLAR.csv":         true,
		"Görevler.xlsx":            true,
		"todo.csv":                 true,
		"Backlog 2026.xlsx":        true,
		"tr_foods_v1.csv":          false,
		"todo.json":                false,
		"~$Yapilacaklar.xlsx":      false,
		".tasks.csv":               false,
	}
	for name, want := range cases {
		if got := isTaskSheet(name); got != want {
			t.Errorf("isTaskSheet(%q) = %v, want %v", name, got, want)
		}
	}
}
