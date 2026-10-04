package mathdrill

import (
	"fmt"
	"math"
	mathrand "math/rand/v2"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Category selects which family of tasks the generator produces.
type Category string

const (
	CategoryMental   Category = "mental"
	CategoryUnits    Category = "units"
	CategoryFormulas Category = "formulas"
)

// Difficulty scales operand ranges and distractor plausibility.
type Difficulty int

const (
	Easy Difficulty = iota
	Medium
	Hard
)

func (d Difficulty) String() string {
	switch d {
	case Easy:
		return "easy"
	case Hard:
		return "hard"
	default:
		return "medium"
	}
}

// ParseCategory maps API values (German or English) to a Category.
func ParseCategory(s string) (Category, bool) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "mental", "grundrechenarten", "arithmetic", "kopfrechnen":
		return CategoryMental, true
	case "units", "einheiten", "zehnerpotenzen", "conversion":
		return CategoryUnits, true
	case "formulas", "formeln", "physik", "physics":
		return CategoryFormulas, true
	default:
		return "", false
	}
}

// ParseDifficulty defaults to Medium for unknown input.
func ParseDifficulty(s string) Difficulty {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "easy", "leicht", "1":
		return Easy
	case "hard", "schwer", "3":
		return Hard
	default:
		return Medium
	}
}

// Task is the client-facing representation of a generated exercise. The
// correct answer is not included; it is embedded in the signed Token.
type Task struct {
	ID         string `json:"id"`
	Category   string `json:"category"`
	Prompt     string `json:"prompt"`
	AnswerUnit string `json:"answer_unit,omitempty"`
	Token      string `json:"token"`
}

// question is the internal result of a task builder.
type question struct {
	prompt     string
	answer     string
	answerType string // "numeric" | "text"
	tolerance  float64
	unit       string
}

// Generator produces tasks and verifies answers. It is safe for concurrent use.
type Generator struct {
	mu     sync.Mutex
	rng    *mathrand.Rand
	secret []byte
}

// New returns a generator seeded from the clock and process id.
func New(secret []byte) *Generator {
	seed := uint64(time.Now().UnixNano()) ^ uint64(os.Getpid())<<32
	return NewWithSeed(secret, seed)
}

// NewWithSeed is intended for deterministic tests.
func NewWithSeed(secret []byte, seed uint64) *Generator {
	return &Generator{
		rng:    mathrand.New(mathrand.NewPCG(seed, seed^0x9e3779b97f4a7c15)),
		secret: secret,
	}
}

// Generate produces count tasks of the given category and difficulty.
func (g *Generator) Generate(cat Category, diff Difficulty, count int) ([]Task, error) {
	if count <= 0 {
		count = 10
	}
	if count > 100 {
		count = 100
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	tasks := make([]Task, 0, count)
	for i := 0; i < count; i++ {
		q := g.build(cat, diff)
		id, err := newID()
		if err != nil {
			return nil, err
		}
		token, err := g.sign(issued{
			ID:         id,
			Category:   string(cat),
			Difficulty: diff.String(),
			Answer:     q.answer,
			AnswerType: q.answerType,
			Tolerance:  q.tolerance,
			IssuedAt:   time.Now().Unix(),
		})
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, Task{
			ID:         id,
			Category:   string(cat),
			Prompt:     q.prompt,
			AnswerUnit: q.unit,
			Token:      token,
		})
	}
	return tasks, nil
}

func (g *Generator) build(cat Category, diff Difficulty) question {
	switch cat {
	case CategoryUnits:
		return g.units(diff)
	case CategoryFormulas:
		return g.formulas(diff)
	default:
		return g.mental(diff)
	}
}

func (g *Generator) mental(diff Difficulty) question {
	switch g.intn(3) {
	case 0:
		return g.multiplication(diff)
	case 1:
		return g.divisionWithRemainder(diff)
	default:
		return g.chain(diff)
	}
}

func (g *Generator) multiplication(diff Difficulty) question {
	lo, hi := 2, 10
	switch diff {
	case Easy:
		lo, hi = 1, 10
	case Hard:
		lo, hi = 2, 20
	default:
		lo, hi = 2, 15
	}
	a := g.between(lo, hi)
	b := g.between(lo, hi)
	return question{
		prompt:     fmt.Sprintf("%d × %d = ?", a, b),
		answer:     strconv.Itoa(a * b),
		answerType: "numeric",
	}
}

func (g *Generator) divisionWithRemainder(diff Difficulty) question {
	maxDivisor := 12
	if diff == Hard {
		maxDivisor = 20
	}
	divisor := g.between(2, maxDivisor)
	quotient := g.between(2, 12)
	remainder := g.between(0, divisor-1)
	dividend := divisor*quotient + remainder
	return question{
		prompt:     fmt.Sprintf("%d ÷ %d = ?", dividend, divisor),
		answer:     fmt.Sprintf("%dr%d", quotient, remainder),
		answerType: "division",
	}
}

func (g *Generator) chain(diff Difficulty) question {
	hi := 12
	if diff == Hard {
		hi = 20
	} else if diff == Easy {
		hi = 9
	}
	switch g.intn(5) {
	case 0:
		a, b, c := g.between(2, hi), g.between(2, hi), g.between(2, 9)
		return numericQ(fmt.Sprintf("(%d + %d) × %d = ?", a, b, c), (a+b)*c)
	case 1:
		a, b, c := g.between(4, hi), g.between(2, hi), g.between(2, 9)
		if b >= a {
			a, b = b+1, a
		}
		return numericQ(fmt.Sprintf("(%d − %d) × %d = ?", a, b, c), (a-b)*c)
	case 2:
		a, b, c := g.between(2, hi), g.between(2, hi), g.between(2, hi)
		return numericQ(fmt.Sprintf("%d × %d + %d = ?", a, b, c), a*b+c)
	case 3:
		a, b := g.between(2, hi), g.between(2, hi)
		c := g.between(1, a*b)
		return numericQ(fmt.Sprintf("%d × %d − %d = ?", a, b, c), a*b-c)
	default:
		a, b, c := g.between(2, hi), g.between(2, hi), g.between(2, hi)
		return numericQ(fmt.Sprintf("%d + %d × %d = ?", a, b, c), a+b*c)
	}
}

func numericQ(prompt string, answer int) question {
	return question{
		prompt:     prompt,
		answer:     strconv.Itoa(answer),
		answerType: "numeric",
	}
}

// --- random helpers (callers must hold g.mu) ---

func (g *Generator) intn(n int) int {
	if n <= 0 {
		return 0
	}
	return g.rng.IntN(n)
}

func (g *Generator) between(lo, hi int) int {
	if hi <= lo {
		return lo
	}
	return lo + g.rng.IntN(hi-lo+1)
}

func (g *Generator) pickFloat(values []float64) float64 {
	return values[g.rng.IntN(len(values))]
}

// fmtNum renders a float without scientific notation and without trailing
// zeros, rounding tiny float error away first.
func fmtNum(v float64) string {
	r := math.Round(v*1e6) / 1e6
	return strconv.FormatFloat(r, 'f', -1, 64)
}
