package api

import (
	"errors"
	"net/http"
	"regexp"
	"strings"

	"trainer/internal/auth"
	"trainer/internal/store"
)

var usernamePattern = regexp.MustCompile(`^[a-z0-9._-]{3,32}$`)

type registerRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type recoverRequest struct {
	Username     string `json:"username"`
	RecoveryCode string `json:"recovery_code"`
	NewPassword  string `json:"new_password"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	username := normalizeUsername(req.Username)

	if !usernamePattern.MatchString(username) {
		writeError(w, http.StatusBadRequest, "username must be 3-32 characters (a-z, 0-9, . _ -)")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	recoveryCode, err := auth.NewRecoveryCode()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not generate recovery code")
		return
	}
	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not hash password")
		return
	}
	recoveryHash, err := auth.HashPassword(auth.NormalizeRecoveryCode(recoveryCode))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not store recovery code")
		return
	}

	user, err := s.users.Create(r.Context(), username, passwordHash, recoveryHash)
	if err != nil {
		if errors.Is(err, store.ErrUsernameTaken) {
			writeError(w, http.StatusConflict, "username already taken")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not create user")
		return
	}

	if err := s.issueSession(w, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create session")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"user":          user,
		"recovery_code": recoveryCode,
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	username := normalizeUsername(req.Username)

	user, err := s.users.ByUsername(r.Context(), username)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not look up user")
		return
	}
	// Same response for unknown user and wrong password to avoid leaking which
	// accounts exist.
	if user == nil || !auth.CheckPassword(user.PasswordHash, req.Password) {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if err := s.issueSession(w, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

// handleRecover resets the password using the recovery code shown at
// registration. The code is rotated on success so a leaked code is not reusable.
func (s *Server) handleRecover(w http.ResponseWriter, r *http.Request) {
	var req recoverRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	username := normalizeUsername(req.Username)
	if len(req.NewPassword) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	user, err := s.users.ByUsername(r.Context(), username)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not look up user")
		return
	}
	if user == nil || user.RecoveryHash == "" ||
		!auth.CheckPassword(user.RecoveryHash, auth.NormalizeRecoveryCode(req.RecoveryCode)) {
		writeError(w, http.StatusUnauthorized, "invalid username or recovery code")
		return
	}

	newCode, err := auth.NewRecoveryCode()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not generate recovery code")
		return
	}
	passwordHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not hash password")
		return
	}
	recoveryHash, err := auth.HashPassword(auth.NormalizeRecoveryCode(newCode))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not store recovery code")
		return
	}
	if err := s.users.UpdateCredentials(r.Context(), user.ID, passwordHash, recoveryHash); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update credentials")
		return
	}

	if err := s.issueSession(w, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user":          user,
		"recovery_code": newCode,
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, _ *http.Request) {
	s.clearSessionCookie(w)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	uid, ok := userIDFrom(r.Context())
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"authenticated": false, "user": nil})
		return
	}
	user, err := s.users.ByID(r.Context(), uid)
	if err != nil || user == nil {
		s.clearSessionCookie(w)
		writeJSON(w, http.StatusOK, map[string]any{"authenticated": false, "user": nil})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "user": user})
}

func (s *Server) issueSession(w http.ResponseWriter, userID int64) error {
	token, err := auth.Sign(s.cfg.JWTSecret, userID, s.cfg.TokenTTL)
	if err != nil {
		return err
	}
	s.setSessionCookie(w, token)
	return nil
}

func normalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}
