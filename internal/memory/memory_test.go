package memory

import (
	"testing"
	"time"
)

func TestGenerateProfilesBoundsAndUniqueness(t *testing.T) {
	g := NewWithSeed(99)
	for _, in := range []int{0, 3, 4, 5, 8, 20} {
		profiles := g.GenerateProfiles(in)
		if len(profiles) < 4 || len(profiles) > 8 {
			t.Fatalf("count %d produced %d profiles, want 4..8", in, len(profiles))
		}
		seen := make(map[string]bool)
		for _, p := range profiles {
			if p.Name == "" || p.Diagnosis == "" || p.Medication == "" || p.BloodGroup == "" || p.Symptom == "" {
				t.Fatalf("incomplete profile: %+v", p)
			}
			if p.Age < 18 || p.Age > 65 {
				t.Fatalf("implausible age %d", p.Age)
			}
			if seen[p.Name] {
				t.Fatalf("duplicate name %q", p.Name)
			}
			seen[p.Name] = true
		}
	}
}

func TestBuildQuestionsHaveAnswerKeys(t *testing.T) {
	g := NewWithSeed(1234)
	profiles := g.GenerateProfiles(5)
	questions, keys := g.BuildQuestions(profiles)

	if len(questions) != len(keys) {
		t.Fatalf("got %d questions and %d keys", len(questions), len(keys))
	}
	if len(questions) < len(profiles) {
		t.Fatalf("expected at least %d questions, got %d", len(profiles), len(questions))
	}

	for _, q := range questions {
		key, ok := keys[q.ID]
		if !ok {
			t.Fatalf("question %s has no answer key", q.ID)
		}
		switch q.Type {
		case "mc":
			if !contains(q.Choices, key.Value) {
				t.Fatalf("correct value %q missing from choices %v", key.Value, q.Choices)
			}
		case "match":
			if len(q.Items) == 0 || len(q.Options) == 0 {
				t.Fatalf("match question %s is empty", q.ID)
			}
			for _, v := range key.Matches {
				if !contains(q.Options, v) {
					t.Fatalf("correct option %q missing from options %v", v, q.Options)
				}
			}
		default:
			t.Fatalf("unknown question type %q", q.Type)
		}
	}
}

func TestEvaluatePerfectAndEmpty(t *testing.T) {
	g := NewWithSeed(7)
	sess := g.NewSession(6, 0)

	// Perfect answers built directly from the answer key.
	perfect := make([]Answer, 0, len(sess.Questions))
	for _, q := range sess.Questions {
		key := sess.keys[q.ID]
		if q.Type == "match" {
			perfect = append(perfect, Answer{QuestionID: q.ID, Matches: key.Matches})
		} else {
			perfect = append(perfect, Answer{QuestionID: q.ID, Value: key.Value})
		}
	}
	eval := sess.Evaluate(perfect)
	if eval.Correct != eval.Total || eval.HitRate != 1 {
		t.Fatalf("perfect run scored %d/%d (%v)", eval.Correct, eval.Total, eval.HitRate)
	}

	empty := sess.Evaluate(nil)
	if empty.Correct != 0 || empty.HitRate != 0 {
		t.Fatalf("empty run scored %d/%d (%v)", empty.Correct, empty.Total, empty.HitRate)
	}

	if !sess.MarkEvaluated() {
		t.Fatal("first MarkEvaluated should return true")
	}
	if sess.MarkEvaluated() {
		t.Fatal("second MarkEvaluated should return false")
	}
}

func TestStoreExpiry(t *testing.T) {
	store := NewStore(time.Millisecond)
	sess := &Session{ID: "abc", CreatedAt: time.Now().Add(-time.Hour)}
	store.Add(sess)
	if _, ok := store.Get("abc"); ok {
		t.Fatal("expired session should not be returned")
	}
}

func TestMatchingEvaluationDetectsPartial(t *testing.T) {
	g := NewWithSeed(55)
	sess := g.NewSession(5, 0)

	var matchQ Question
	for _, q := range sess.Questions {
		if q.Type == "match" {
			matchQ = q
			break
		}
	}
	if matchQ.ID == "" {
		t.Skip("no matching question generated")
	}

	key := sess.keys[matchQ.ID]
	partial := make(map[string]string, len(key.Matches))
	for id, v := range key.Matches {
		partial[id] = v
		break // only the first item is right
	}
	eval := sess.Evaluate([]Answer{{QuestionID: matchQ.ID, Matches: partial}})
	for _, r := range eval.Results {
		if r.QuestionID == matchQ.ID && r.Correct {
			t.Fatal("partially correct matching question scored as correct")
		}
	}
}
