package store

import (
	"context"
	"database/sql"
	"fmt"

	"trainer/internal/models"
)

// StatsStore persists training results (user_id may be NULL for guests).
type StatsStore struct {
	db *sql.DB
}

func NewStatsStore(db *sql.DB) *StatsStore {
	return &StatsStore{db: db}
}

// InsertMath records a single math session.
func (s *StatsStore) InsertMath(ctx context.Context, userID *int64, in models.MathStatInput) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO stats_math (user_id, category, duration_ms, accuracy, error_rate)
		 VALUES (?, ?, ?, ?, ?)`,
		userID, in.Category, in.DurationMs, in.Accuracy, in.ErrorRate,
	)
	if err != nil {
		return fmt.Errorf("insert math stat: %w", err)
	}
	return nil
}

// InsertMemory records a single memory session.
func (s *StatsStore) InsertMemory(ctx context.Context, userID *int64, in models.MemoryStatInput) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO stats_memory (user_id, profile_type, errors, memorize_ms)
		 VALUES (?, ?, ?, ?)`,
		userID, in.ProfileType, in.Errors, in.MemorizeMs,
	)
	if err != nil {
		return fmt.Errorf("insert memory stat: %w", err)
	}
	return nil
}

// InsertReaction records a single reaction-time session.
func (s *StatsStore) InsertReaction(ctx context.Context, userID *int64, in models.ReactionStatInput) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO stats_reaction (user_id, avg_ms, best_ms, trials)
		 VALUES (?, ?, ?, ?)`,
		userID, in.AvgMs, in.BestMs, in.Trials,
	)
	if err != nil {
		return fmt.Errorf("insert reaction stat: %w", err)
	}
	return nil
}

// Sync attributes a guest backlog to a user in a single transaction. Either
// all rows are written or none are, so a failed upload can be retried.
func (s *StatsStore) Sync(ctx context.Context, userID int64, req models.SyncRequest) (int, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin sync tx: %w", err)
	}
	defer tx.Rollback()

	mathStmt, err := tx.PrepareContext(ctx,
		`INSERT INTO stats_math (user_id, category, duration_ms, accuracy, error_rate)
		 VALUES (?, ?, ?, ?, ?)`,
	)
	if err != nil {
		return 0, fmt.Errorf("prepare math insert: %w", err)
	}
	defer mathStmt.Close()

	memStmt, err := tx.PrepareContext(ctx,
		`INSERT INTO stats_memory (user_id, profile_type, errors, memorize_ms)
		 VALUES (?, ?, ?, ?)`,
	)
	if err != nil {
		return 0, fmt.Errorf("prepare memory insert: %w", err)
	}
	defer memStmt.Close()

	reactionStmt, err := tx.PrepareContext(ctx,
		`INSERT INTO stats_reaction (user_id, avg_ms, best_ms, trials)
		 VALUES (?, ?, ?, ?)`,
	)
	if err != nil {
		return 0, fmt.Errorf("prepare reaction insert: %w", err)
	}
	defer reactionStmt.Close()

	count := 0
	for _, m := range req.Math {
		if _, err := mathStmt.ExecContext(ctx, userID, m.Category, m.DurationMs, m.Accuracy, m.ErrorRate); err != nil {
			return 0, fmt.Errorf("sync math: %w", err)
		}
		count++
	}
	for _, m := range req.Memory {
		if _, err := memStmt.ExecContext(ctx, userID, m.ProfileType, m.Errors, m.MemorizeMs); err != nil {
			return 0, fmt.Errorf("sync memory: %w", err)
		}
		count++
	}
	for _, m := range req.Reaction {
		if _, err := reactionStmt.ExecContext(ctx, userID, m.AvgMs, m.BestMs, m.Trials); err != nil {
			return 0, fmt.Errorf("sync reaction: %w", err)
		}
		count++
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit sync: %w", err)
	}
	return count, nil
}
