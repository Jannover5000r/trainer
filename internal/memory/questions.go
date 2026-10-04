package memory

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

// Question is a client-facing probe derived from the generated profiles. The
// correct answer is kept server-side in the session's answer key.
type Question struct {
	ID      string      `json:"id"`
	Type    string      `json:"type"` // "mc" | "match"
	Prompt  string      `json:"prompt"`
	Choices []string    `json:"choices,omitempty"` // mc
	Items   []MatchItem `json:"items,omitempty"`   // match
	Options []string    `json:"options,omitempty"` // match
}

// MatchItem is one row of a matching question.
type MatchItem struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// AnswerKey is the server-side solution for one question.
type AnswerKey struct {
	Value   string            // mc
	Matches map[string]string // match: profile id -> value
}

var questionFields = []string{"blood_group", "diagnosis", "medication", "symptom", "profession", "age"}

var fieldLabels = map[string]string{
	"blood_group": "Blutgruppe",
	"diagnosis":   "Diagnose",
	"medication":  "Medikament",
	"symptom":     "Symptom/Allergie",
	"profession":  "Beruf",
	"age":         "Alter",
}

// BuildQuestions produces one question per profile plus one matching question,
// shuffled. It returns the answer key alongside the public questions.
func (g *Generator) BuildQuestions(profiles []Profile) ([]Question, map[string]AnswerKey) {
	questions := make([]Question, 0, len(profiles)+1)
	keys := make(map[string]AnswerKey, len(profiles)+1)

	order := g.shuffled(len(profiles))
	for _, idx := range order {
		p := profiles[idx]
		field := questionFields[g.intn(len(questionFields))]
		q, key := g.mcQuestion(profiles, p, field)
		questions = append(questions, q)
		keys[q.ID] = key
	}

	if len(profiles) >= 4 {
		field := []string{"blood_group", "diagnosis", "medication", "symptom"}[g.intn(4)]
		q, key := g.matchQuestion(profiles, field)
		questions = append(questions, q)
		keys[q.ID] = key
	}

	// Shuffle so the matching question is not always last.
	shuffled := g.shuffled(len(questions))
	out := make([]Question, 0, len(questions))
	for _, idx := range shuffled {
		out = append(out, questions[idx])
	}
	return out, keys
}

func (g *Generator) mcQuestion(profiles []Profile, p Profile, field string) (Question, AnswerKey) {
	correct := p.fieldValue(field)

	subject := p.Name
	if g.intn(2) == 0 {
		subject = p.descriptor()
	}

	var prompt string
	switch field {
	case "blood_group":
		prompt = fmt.Sprintf("Welche Blutgruppe hatte %s?", subject)
	case "diagnosis":
		prompt = fmt.Sprintf("Welche Diagnose wurde bei %s gestellt?", subject)
	case "medication":
		prompt = fmt.Sprintf("Welches Medikament erhielt %s?", subject)
	case "symptom":
		prompt = fmt.Sprintf("Welche Allergie bzw. welches Symptom hatte %s?", subject)
	case "profession":
		prompt = fmt.Sprintf("Welchen Beruf übte %s aus?", subject)
	case "age":
		prompt = fmt.Sprintf("Wie alt war %s?", subject)
	}

	choices := g.distractors(profiles, field, correct)
	return Question{
		ID:      randomID(),
		Type:    "mc",
		Prompt:  prompt,
		Choices: choices,
	}, AnswerKey{Value: correct}
}

func (g *Generator) matchQuestion(profiles []Profile, field string) (Question, AnswerKey) {
	items := make([]MatchItem, 0, len(profiles))
	correct := make(map[string]string, len(profiles))
	options := make([]string, 0, len(profiles)+2)
	for _, p := range profiles {
		items = append(items, MatchItem{ID: p.ID, Label: p.Name})
		v := p.fieldValue(field)
		correct[p.ID] = v
		options = append(options, v)
	}
	// Add up to two extra values from the global pool to make it a real choice.
	pool := g.fieldPool(field)
	for _, extra := range g.shuffledStrings(pool) {
		if len(options) >= len(profiles)+2 {
			break
		}
		if !contains(options, extra) {
			options = append(options, extra)
		}
	}

	return Question{
		ID:      randomID(),
		Type:    "match",
		Prompt:  fmt.Sprintf("Ordne jedem Patienten die richtige Angabe zu (%s).", fieldLabels[field]),
		Items:   items,
		Options: g.shuffledStrings(options),
	}, AnswerKey{Matches: correct}
}

// distractors returns three plausible wrong values plus the correct one.
func (g *Generator) distractors(profiles []Profile, field, correct string) []string {
	candidates := make([]string, 0, len(profiles)+8)
	for _, p := range profiles {
		candidates = append(candidates, p.fieldValue(field))
	}
	candidates = append(candidates, g.fieldPool(field)...)

	unique := sortedStrings(candidates)
	wrong := make([]string, 0, len(unique))
	for _, v := range unique {
		if v != correct {
			wrong = append(wrong, v)
		}
	}
	wrong = g.shuffledStrings(wrong)
	if len(wrong) > 3 {
		wrong = wrong[:3]
	}

	choices := append([]string{correct}, wrong...)
	return g.shuffledStrings(choices)
}

// fieldPool returns globally valid but profile-independent values used as
// distractors or extra matching options.
func (g *Generator) fieldPool(field string) []string {
	switch field {
	case "blood_group":
		return append([]string{}, bloodGroups...)
	case "diagnosis":
		out := make([]string, 0, len(diagnoses))
		for _, d := range diagnoses {
			out = append(out, d.diagnosis)
		}
		return out
	case "medication":
		out := []string{}
		for _, d := range diagnoses {
			out = append(out, d.medication...)
		}
		return out
	case "symptom":
		return append([]string{}, symptoms...)
	case "profession":
		out := make([]string, 0, len(professions))
		for _, p := range professions {
			out = append(out, p.name)
		}
		return out
	case "age":
		out := []string{}
		for age := 18; age <= 65; age += 3 {
			out = append(out, fmt.Sprintf("%d Jahre", age))
		}
		return out
	default:
		return nil
	}
}

// --- small generic helpers ---

func (g *Generator) shuffled(n int) []int {
	idx := make([]int, n)
	for i := range idx {
		idx[i] = i
	}
	g.rng.Shuffle(n, func(i, j int) { idx[i], idx[j] = idx[j], idx[i] })
	return idx
}

func (g *Generator) shuffledStrings(in []string) []string {
	out := append([]string{}, in...)
	g.rng.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}

func contains(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}

func randomID() string {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		// crypto/rand failing is catastrophic and unrecoverable here.
		panic(fmt.Sprintf("memory: random id: %v", err))
	}
	return hex.EncodeToString(buf)
}
