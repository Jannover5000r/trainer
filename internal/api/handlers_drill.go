package api

import (
	"net/http"
	"strconv"
	"time"

	"trainer/internal/mathdrill"
	"trainer/internal/memory"
	"trainer/internal/models"
)

// --- Kopfrechnen / Quantitativer Drill ---

// handleDrillMath returns a generated task set for one category.
func (s *Server) handleDrillMath(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	cat, ok := mathdrill.ParseCategory(q.Get("type"))
	if !ok {
		if q.Get("type") != "" {
			writeError(w, http.StatusBadRequest, "unknown type (use mental, units or formulas)")
			return
		}
		cat = mathdrill.CategoryMental
	}
	diff := mathdrill.ParseDifficulty(q.Get("difficulty"))
	count := queryInt(q.Get("count"), 20, 1, 100)

	tasks, err := s.math.Generate(cat, diff, count)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not generate tasks")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"category":   cat,
		"difficulty": diff.String(),
		"count":      len(tasks),
		"tasks":      tasks,
	})
}

type mathAnswer struct {
	Token      string `json:"token"`
	Answer     string `json:"answer"`
	DurationMs int64  `json:"duration_ms"`
}

type mathVerifyRequest struct {
	Answers []mathAnswer `json:"answers"`
	// Log controls whether an authenticated request writes an aggregate row.
	// The UI sets it to false for per-task checks (instant feedback) and sends
	// one final request with true so exactly one row is recorded per session.
	Log *bool `json:"log"`
}

type mathVerifyResult struct {
	QuestionID string `json:"question_id"`
	Category   string `json:"category"`
	Correct    bool   `json:"correct"`
	Expected   string `json:"expected"`
	Given      string `json:"given"`
	DurationMs int64  `json:"duration_ms"`
}

// handleDrillMathVerify validates submitted answers, measures latency and, for
// signed-in users, records an aggregate row in stats_math.
func (s *Server) handleDrillMathVerify(w http.ResponseWriter, r *http.Request) {
	var req mathVerifyRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Answers) == 0 {
		writeError(w, http.StatusBadRequest, "answers must not be empty")
		return
	}

	now := time.Now()
	results := make([]mathVerifyResult, 0, len(req.Answers))
	var correct, totalDuration int64
	category := ""
	mixed := false

	for _, a := range req.Answers {
		v, err := s.math.Verify(a.Token, a.Answer)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid task token")
			return
		}

		// Trust the client's per-task duration only when it fits inside the
		// window since the task was issued; otherwise use the measured elapsed.
		elapsed := now.Sub(v.IssuedAt).Milliseconds()
		duration := a.DurationMs
		if duration <= 0 || duration > elapsed {
			duration = elapsed
		}

		if v.Correct {
			correct++
		}
		totalDuration += duration
		if category == "" {
			category = v.Category
		} else if category != v.Category {
			mixed = true
		}

		results = append(results, mathVerifyResult{
			QuestionID: v.ID,
			Category:   v.Category,
			Correct:    v.Correct,
			Expected:   v.Expected,
			Given:      v.Given,
			DurationMs: duration,
		})
	}

	total := int64(len(results))
	accuracy := float64(correct) / float64(total)
	errorRate := 1 - accuracy
	if mixed {
		category = "mixed"
	}

	logged := false
	shouldLog := req.Log == nil || *req.Log
	if shouldLog {
		if uid, ok := userIDFrom(r.Context()); ok {
			err := s.stats.InsertMath(r.Context(), &uid, models.MathStatInput{
				Category:   category,
				DurationMs: totalDuration,
				Accuracy:   accuracy,
				ErrorRate:  errorRate,
			})
			logged = err == nil
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"total":       total,
		"correct":     correct,
		"accuracy":    accuracy,
		"error_rate":  errorRate,
		"duration_ms": totalDuration,
		"logged":      logged,
		"results":     results,
	})
}

// --- Merkfähigkeit / Steckbriefe ---

// handleMemoryGenerate creates a profile set and starts the memorisation
// window. Questions are only released after the delay has elapsed.
func (s *Server) handleMemoryGenerate(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	count := queryInt(q.Get("count"), 5, 4, 8)
	delaySeconds := queryInt(q.Get("delay_seconds"), 60, 0, 600)

	sess := s.memGen.NewSession(count, time.Duration(delaySeconds)*time.Second)
	s.memSessions.Add(sess)

	writeJSON(w, http.StatusOK, map[string]any{
		"session_id":    sess.ID,
		"profiles":      sess.Profiles,
		"ready_at":      sess.ReadyAt,
		"delay_seconds": delaySeconds,
	})
}

// handleMemoryQuestions releases the probe questions once the delay is over.
func (s *Server) handleMemoryQuestions(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("session_id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "session_id is required")
		return
	}
	sess, ok := s.memSessions.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, "session not found or expired")
		return
	}

	if remaining := time.Until(sess.ReadyAt); remaining > 0 {
		retry := int(remaining.Seconds()) + 1
		w.Header().Set("Retry-After", strconv.Itoa(retry))
		writeJSON(w, http.StatusTooEarly, map[string]any{
			"error":       "memorisation time not over yet",
			"retry_after": retry,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"session_id": sess.ID,
		"questions":  sess.Questions,
	})
}

type memoryEvaluateRequest struct {
	SessionID  string          `json:"session_id"`
	MemorizeMs int64           `json:"memorize_ms"`
	Answers    []memory.Answer `json:"answers"`
}

// handleMemoryEvaluate scores the probes and records the result once per
// session for signed-in users.
func (s *Server) handleMemoryEvaluate(w http.ResponseWriter, r *http.Request) {
	var req memoryEvaluateRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.SessionID == "" {
		writeError(w, http.StatusBadRequest, "session_id is required")
		return
	}

	sess, ok := s.memSessions.Get(req.SessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "session not found or expired")
		return
	}

	eval := sess.Evaluate(req.Answers)

	logged := false
	if uid, ok := userIDFrom(r.Context()); ok && sess.MarkEvaluated() {
		err := s.stats.InsertMemory(r.Context(), &uid, models.MemoryStatInput{
			ProfileType: "steckbrief",
			Errors:      eval.Total - eval.Correct,
			MemorizeMs:  req.MemorizeMs,
		})
		logged = err == nil
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"session_id":  sess.ID,
		"total":       eval.Total,
		"correct":     eval.Correct,
		"hit_rate":    eval.HitRate,
		"memorize_ms": req.MemorizeMs,
		"logged":      logged,
		"results":     eval.Results,
	})
}

// queryInt parses an optional query integer, clamping it to [min, max].
func queryInt(raw string, fallback, min, max int) int {
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
