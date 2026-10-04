package models

import "time"

// User is a registered account. PasswordHash and RecoveryHash are never
// serialised.
type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	RecoveryHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

// MathStat is one completed mental-arithmetic / unit-conversion session.
type MathStat struct {
	ID         int64     `json:"id"`
	UserID     *int64    `json:"user_id"`
	Category   string    `json:"category"`
	DurationMs int64     `json:"duration_ms"`
	Accuracy   float64   `json:"accuracy"`
	ErrorRate  float64   `json:"error_rate"`
	CreatedAt  time.Time `json:"created_at"`
}

// MemoryStat is one completed memory-training session.
type MemoryStat struct {
	ID          int64     `json:"id"`
	UserID      *int64    `json:"user_id"`
	ProfileType string    `json:"profile_type"`
	Errors      int       `json:"errors"`
	MemorizeMs  int64     `json:"memorize_ms"`
	CreatedAt   time.Time `json:"created_at"`
}

// ReactionStat is one reaction-time session (several trials averaged).
type ReactionStat struct {
	ID        int64     `json:"id"`
	UserID    *int64    `json:"user_id"`
	AvgMs     int64     `json:"avg_ms"`
	BestMs    int64     `json:"best_ms"`
	Trials    int       `json:"trials"`
	CreatedAt time.Time `json:"created_at"`
}

// MathStatInput is the client payload for a single math result.
type MathStatInput struct {
	Category   string  `json:"category"`
	DurationMs int64   `json:"duration_ms"`
	Accuracy   float64 `json:"accuracy"`
	ErrorRate  float64 `json:"error_rate"`
}

// MemoryStatInput is the client payload for a single memory result.
type MemoryStatInput struct {
	ProfileType string `json:"profile_type"`
	Errors      int    `json:"errors"`
	MemorizeMs  int64  `json:"memorize_ms"`
}

// ReactionStatInput is the client payload for a reaction-time session.
type ReactionStatInput struct {
	AvgMs  int64 `json:"avg_ms"`
	BestMs int64 `json:"best_ms"`
	Trials int   `json:"trials"`
}

// SyncRequest is the guest backlog uploaded after login. Anonymous sessions
// collect results locally; this endpoint attributes them to the user.
type SyncRequest struct {
	Math     []MathStatInput     `json:"math"`
	Memory   []MemoryStatInput   `json:"memory"`
	Reaction []ReactionStatInput `json:"reaction"`
}
