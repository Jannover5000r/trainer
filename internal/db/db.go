package db

import (
	"database/sql"
	"fmt"

	// Pure-Go SQLite driver: no CGO, which makes cross-compiling for a
	// Raspberry Pi (linux/arm64) trivial.
	_ "modernc.org/sqlite"
)

// Open opens the SQLite database with the pragmas this project relies on:
// WAL for concurrent reads, a busy timeout so writers retry instead of
// failing, foreign keys enforced and synchronous=NORMAL for a good
// throughput/durability trade-off on flash storage.
func Open(path string) (*sql.DB, error) {
	dsn := fmt.Sprintf(
		"file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)",
		path,
	)

	database, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	// SQLite allows a single writer. Serialising connections avoids
	// SQLITE_BUSY under concurrent requests on the Pi.
	database.SetMaxOpenConns(1)
	database.SetMaxIdleConns(1)
	database.SetConnMaxLifetime(0)

	if err := database.Ping(); err != nil {
		database.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	return database, nil
}
