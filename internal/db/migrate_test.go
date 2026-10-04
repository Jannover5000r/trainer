package db

import (
	"path/filepath"
	"testing"
)

// TestMigrateLegacyEmailColumn ensures an account table created before the
// username switch is upgraded in place without losing data.
func TestMigrateLegacyEmailColumn(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	database, err := Open(path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer database.Close()

	legacy := `
CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);`
	if _, err := database.Exec(legacy); err != nil {
		t.Fatalf("create legacy schema: %v", err)
	}
	if _, err := database.Exec(`INSERT INTO users (email, password_hash) VALUES ('olduser', 'hash')`); err != nil {
		t.Fatalf("insert legacy row: %v", err)
	}

	if err := Migrate(database); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	var username, recovery, preferences string
	if err := database.QueryRow(`SELECT username, recovery_hash, preferences FROM users WHERE id = 1`).Scan(&username, &recovery, &preferences); err != nil {
		t.Fatalf("select migrated row: %v", err)
	}
	if username != "olduser" {
		t.Errorf("username = %q, want %q", username, "olduser")
	}
	if recovery != "" {
		t.Errorf("recovery_hash = %q, want empty default", recovery)
	}
	if preferences != "{}" {
		t.Errorf("preferences = %q, want %q", preferences, "{}")
	}

	// Idempotent: a second run must not fail.
	if err := Migrate(database); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
}
