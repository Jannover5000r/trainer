package api

import (
	"net/http"

	"trainer/internal/models"
)

// handleSync imports the guest backlog after login and attributes every row to
// the authenticated user. The route is guarded by requireAuth, so userIDFrom
// is guaranteed to be present.
func (s *Server) handleSync(w http.ResponseWriter, r *http.Request) {
	uid, _ := userIDFrom(r.Context())

	var req models.SyncRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	count, err := s.stats.Sync(r.Context(), uid, req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not sync stats")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"imported": count,
	})
}
