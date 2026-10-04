package api

import (
	"net/http"

	"trainer/internal/models"
)

// handleMath records one math session. Works anonymously (user_id NULL) so
// server-side guest logs are possible.
func (s *Server) handleMath(w http.ResponseWriter, r *http.Request) {
	var in models.MathStatInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.Category == "" {
		writeError(w, http.StatusBadRequest, "category is required")
		return
	}

	var userID *int64
	if uid, ok := userIDFrom(r.Context()); ok {
		userID = &uid
	}

	if err := s.stats.InsertMath(r.Context(), userID, in); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save stat")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

// handleMemory records one memory session, anonymously or attributed.
func (s *Server) handleMemory(w http.ResponseWriter, r *http.Request) {
	var in models.MemoryStatInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.ProfileType == "" {
		writeError(w, http.StatusBadRequest, "profile_type is required")
		return
	}

	var userID *int64
	if uid, ok := userIDFrom(r.Context()); ok {
		userID = &uid
	}

	if err := s.stats.InsertMemory(r.Context(), userID, in); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save stat")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

// handleReaction records one reaction-time session, anonymously or attributed.
func (s *Server) handleReaction(w http.ResponseWriter, r *http.Request) {
	var in models.ReactionStatInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if in.Trials <= 0 || in.AvgMs <= 0 {
		writeError(w, http.StatusBadRequest, "trials and avg_ms are required")
		return
	}

	var userID *int64
	if uid, ok := userIDFrom(r.Context()); ok {
		userID = &uid
	}

	if err := s.stats.InsertReaction(r.Context(), userID, in); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save stat")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}
