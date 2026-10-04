package memory

import (
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Answer is one submitted answer. Value is used for mc questions, Matches for
// matching questions.
type Answer struct {
	QuestionID string            `json:"question_id"`
	Value      string            `json:"value,omitempty"`
	Matches    map[string]string `json:"matches,omitempty"`
}

// QuestionResult reports the outcome for a single question.
type QuestionResult struct {
	QuestionID string `json:"question_id"`
	Correct    bool   `json:"correct"`
	Expected   string `json:"expected"`
	Given      string `json:"given"`
}

// Evaluation aggregates the results of a session.
type Evaluation struct {
	Total   int              `json:"total"`
	Correct int              `json:"correct"`
	HitRate float64          `json:"hit_rate"`
	Results []QuestionResult `json:"results"`
}

// Session holds a generated profile set, its questions and answer key until it
// is evaluated or expires.
type Session struct {
	ID        string
	CreatedAt time.Time
	ReadyAt   time.Time
	Profiles  []Profile
	Questions []Question

	keys      map[string]AnswerKey
	evaluated atomic.Bool
}

// NewSession generates profiles, questions and a delay window.
func (g *Generator) NewSession(count int, delay time.Duration) *Session {
	profiles := g.GenerateProfiles(count)
	questions, keys := g.BuildQuestions(profiles)
	now := time.Now()
	return &Session{
		ID:        randomID(),
		CreatedAt: now,
		ReadyAt:   now.Add(delay),
		Profiles:  profiles,
		Questions: questions,
		keys:      keys,
	}
}

// Evaluate scores the submitted answers. Unanswered questions count as
// incorrect, so the hit rate can never overstate performance.
func (s *Session) Evaluate(answers []Answer) Evaluation {
	byID := make(map[string]Answer, len(answers))
	for _, a := range answers {
		byID[a.QuestionID] = a
	}

	eval := Evaluation{Total: len(s.Questions)}
	for _, q := range s.Questions {
		key, ok := s.keys[q.ID]
		if !ok {
			continue
		}
		a := byID[q.ID]

		result := QuestionResult{QuestionID: q.ID}
		if q.Type == "match" {
			result.Expected = formatMatches(key.Matches)
			result.Given = formatMatches(a.Matches)
			result.Correct = matchesEqual(key.Matches, a.Matches)
		} else {
			result.Expected = key.Value
			result.Given = strings.TrimSpace(a.Value)
			result.Correct = normalize(result.Given) == normalize(key.Value)
		}
		if result.Correct {
			eval.Correct++
		}
		eval.Results = append(eval.Results, result)
	}
	if eval.Total > 0 {
		eval.HitRate = float64(eval.Correct) / float64(eval.Total)
	}
	return eval
}

// MarkEvaluated reports whether this is the first evaluation of the session.
// It lets the handler log a memory stat exactly once per session.
func (s *Session) MarkEvaluated() bool {
	return s.evaluated.CompareAndSwap(false, true)
}

func matchesEqual(want, got map[string]string) bool {
	if len(want) == 0 {
		return false
	}
	for id, v := range want {
		if normalize(got[id]) != normalize(v) {
			return false
		}
	}
	return true
}

func formatMatches(m map[string]string) string {
	if len(m) == 0 {
		return ""
	}
	ids := make([]string, 0, len(m))
	for id := range m {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	parts := make([]string, 0, len(ids))
	for _, id := range ids {
		parts = append(parts, id+"="+m[id])
	}
	return strings.Join(parts, "; ")
}

func normalize(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// Store is a TTL-bounded, in-memory session registry. It is intentionally not
// persisted: sessions are short-lived and a restart simply invalidates them.
type Store struct {
	mu       sync.Mutex
	sessions map[string]*Session
	ttl      time.Duration
}

// NewStore returns a store whose sessions live until evaluated or ttl passes.
func NewStore(ttl time.Duration) *Store {
	return &Store{sessions: make(map[string]*Session), ttl: ttl}
}

// Add registers a session and sweeps expired entries.
func (s *Store) Add(sess *Session) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweepLocked(time.Now())
	s.sessions[sess.ID] = sess
}

// Get returns a session if it exists and has not expired.
func (s *Store) Get(id string) (*Session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweepLocked(time.Now())
	sess, ok := s.sessions[id]
	return sess, ok
}

// Delete removes a session (e.g. after evaluation).
func (s *Store) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, id)
}

func (s *Store) sweepLocked(now time.Time) {
	if s.ttl <= 0 {
		return
	}
	for id, sess := range s.sessions {
		if now.Sub(sess.CreatedAt) > s.ttl {
			delete(s.sessions, id)
		}
	}
}
