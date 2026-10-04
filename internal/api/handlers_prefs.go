package api

import (
	"encoding/json"
	"net/http"
)

const maxPreferencesBytes = 16 << 10 // 16 KiB

// handleGetPreferences returns the signed-in user's stored preferences.
func (s *Server) handleGetPreferences(w http.ResponseWriter, r *http.Request) {
	uid, ok := userIDFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	prefs, err := s.users.Preferences(r.Context(), uid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load preferences")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(prefs)
}

// handlePutPreferences replaces the signed-in user's preferences. Only a JSON
// object is accepted and the body is size-limited.
func (s *Server) handlePutPreferences(w http.ResponseWriter, r *http.Request) {
	uid, ok := userIDFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxPreferencesBytes)
	var prefs map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&prefs); err != nil {
		writeError(w, http.StatusBadRequest, "invalid preferences")
		return
	}

	raw, err := json.Marshal(prefs)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid preferences")
		return
	}
	if err := s.users.UpdatePreferences(r.Context(), uid, raw); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save preferences")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
