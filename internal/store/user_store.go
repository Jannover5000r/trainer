package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"trainer/internal/models"
)

// ErrUsernameTaken is returned when registering a username that already exists.
var ErrUsernameTaken = errors.New("username already registered")

// UserStore provides persistence for accounts.
type UserStore struct {
	db *sql.DB
}

func NewUserStore(db *sql.DB) *UserStore {
	return &UserStore{db: db}
}

// Create inserts a new user and returns it with the assigned id.
func (s *UserStore) Create(ctx context.Context, username, passwordHash, recoveryHash string) (*models.User, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO users (username, password_hash, recovery_hash) VALUES (?, ?, ?)`,
		username, passwordHash, recoveryHash,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrUsernameTaken
		}
		return nil, fmt.Errorf("insert user: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("user last insert id: %w", err)
	}
	return s.ByID(ctx, id)
}

// ByUsername looks up an account by username.
func (s *UserStore) ByUsername(ctx context.Context, username string) (*models.User, error) {
	return s.scanOne(ctx,
		`SELECT id, username, password_hash, recovery_hash, created_at FROM users WHERE username = ?`,
		username,
	)
}

// ByID looks up an account by id.
func (s *UserStore) ByID(ctx context.Context, id int64) (*models.User, error) {
	return s.scanOne(ctx,
		`SELECT id, username, password_hash, recovery_hash, created_at FROM users WHERE id = ?`,
		id,
	)
}

// UpdateCredentials replaces the password hash and rotation recovery code.
func (s *UserStore) UpdateCredentials(ctx context.Context, id int64, passwordHash, recoveryHash string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET password_hash = ?, recovery_hash = ? WHERE id = ?`,
		passwordHash, recoveryHash, id,
	)
	if err != nil {
		return fmt.Errorf("update credentials: %w", err)
	}
	return nil
}

// Preferences returns the stored preferences JSON, defaulting to an empty object.
func (s *UserStore) Preferences(ctx context.Context, id int64) (json.RawMessage, error) {
	var raw string
	err := s.db.QueryRowContext(ctx, `SELECT preferences FROM users WHERE id = ?`, id).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return json.RawMessage(`{}`), nil
	}
	if err != nil {
		return nil, fmt.Errorf("query preferences: %w", err)
	}
	if raw == "" || !json.Valid([]byte(raw)) {
		return json.RawMessage(`{}`), nil
	}
	return json.RawMessage(raw), nil
}

// UpdatePreferences stores the preferences JSON for a user.
func (s *UserStore) UpdatePreferences(ctx context.Context, id int64, prefs json.RawMessage) error {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET preferences = ? WHERE id = ?`, string(prefs), id)
	if err != nil {
		return fmt.Errorf("update preferences: %w", err)
	}
	return nil
}

func (s *UserStore) scanOne(ctx context.Context, query string, args ...any) (*models.User, error) {
	var u models.User
	err := s.db.QueryRowContext(ctx, query, args...).
		Scan(&u.ID, &u.Username, &u.PasswordHash, &u.RecoveryHash, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query user: %w", err)
	}
	return &u, nil
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "unique constraint")
}
