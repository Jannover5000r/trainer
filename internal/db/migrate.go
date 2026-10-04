package db

import (
	"database/sql"
	"fmt"
)

// schema creates any missing tables and indexes.
const schema = `
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    recovery_hash TEXT    NOT NULL DEFAULT '',
    preferences   TEXT    NOT NULL DEFAULT '{}',
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stats_math (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    category    TEXT    NOT NULL,
    duration_ms INTEGER NOT NULL,
    accuracy    REAL    NOT NULL,
    error_rate  REAL    NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stats_math_user    ON stats_math(user_id);
CREATE INDEX IF NOT EXISTS idx_stats_math_created ON stats_math(created_at);

CREATE TABLE IF NOT EXISTS stats_memory (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    profile_type TEXT    NOT NULL,
    errors       INTEGER NOT NULL,
    memorize_ms  INTEGER NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stats_memory_user    ON stats_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_stats_memory_created ON stats_memory(created_at);

CREATE TABLE IF NOT EXISTS stats_reaction (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    avg_ms     INTEGER NOT NULL,
    best_ms    INTEGER NOT NULL,
    trials     INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stats_reaction_user    ON stats_reaction(user_id);
CREATE INDEX IF NOT EXISTS idx_stats_reaction_created ON stats_reaction(created_at);
`

// Migrate creates the schema and applies the user-table upgrades.
func Migrate(database *sql.DB) error {
	if _, err := database.Exec(schema); err != nil {
		return err
	}
	return migrateUsers(database)
}

// migrateUsers renames a legacy email column to username and adds the
// recovery_hash/preferences columns. Idempotent.
func migrateUsers(database *sql.DB) error {
	cols, err := tableColumns(database, "users")
	if err != nil {
		return err
	}
	if cols["email"] && !cols["username"] {
		if _, err := database.Exec(`ALTER TABLE users RENAME COLUMN email TO username`); err != nil {
			return fmt.Errorf("rename users.email: %w", err)
		}
	}
	cols, err = tableColumns(database, "users")
	if err != nil {
		return err
	}
	if !cols["recovery_hash"] {
		if _, err := database.Exec(`ALTER TABLE users ADD COLUMN recovery_hash TEXT NOT NULL DEFAULT ''`); err != nil {
			return fmt.Errorf("add users.recovery_hash: %w", err)
		}
	}
	if !cols["preferences"] {
		if _, err := database.Exec(`ALTER TABLE users ADD COLUMN preferences TEXT NOT NULL DEFAULT '{}'`); err != nil {
			return fmt.Errorf("add users.preferences: %w", err)
		}
	}
	return nil
}

func tableColumns(database *sql.DB, table string) (map[string]bool, error) {
	rows, err := database.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return nil, fmt.Errorf("table_info %s: %w", table, err)
	}
	defer rows.Close()

	cols := make(map[string]bool)
	for rows.Next() {
		var (
			cid       int
			name      string
			ctype     string
			notNull   int
			dfltValue sql.NullString
			pk        int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &dfltValue, &pk); err != nil {
			return nil, fmt.Errorf("scan table_info %s: %w", table, err)
		}
		cols[name] = true
	}
	return cols, rows.Err()
}
