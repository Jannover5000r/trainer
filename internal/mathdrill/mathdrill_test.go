package mathdrill

import (
	"testing"
)

func TestGenerateAndVerifyAllCategories(t *testing.T) {
	g := NewWithSeed([]byte("test-secret"), 42)

	categories := []Category{CategoryMental, CategoryUnits, CategoryFormulas}
	difficulties := []Difficulty{Easy, Medium, Hard}

	for _, cat := range categories {
		for _, diff := range difficulties {
			tasks, err := g.Generate(cat, diff, 25)
			if err != nil {
				t.Fatalf("generate %s/%s: %v", cat, diff, err)
			}
			if len(tasks) != 25 {
				t.Fatalf("expected 25 tasks, got %d", len(tasks))
			}
			for _, task := range tasks {
				if task.Prompt == "" {
					t.Fatalf("%s/%s: empty prompt", cat, diff)
				}
				// The expected answer travels in the signed token; feeding it
				// back must verify as correct.
				v, err := g.Verify(task.Token, "")
				if err != nil {
					t.Fatalf("verify token: %v", err)
				}
				if v.Expected == "" {
					t.Fatalf("%s/%s: empty expected answer", cat, diff)
				}
				ok, err := g.Verify(task.Token, v.Expected)
				if err != nil {
					t.Fatalf("verify expected: %v", err)
				}
				if !ok.Correct {
					t.Fatalf("%s/%s: expected answer %q did not verify", cat, diff, v.Expected)
				}
				// An obviously wrong answer must not verify.
				bad, err := g.Verify(task.Token, "definitely-wrong-answer")
				if err != nil {
					t.Fatalf("verify wrong: %v", err)
				}
				if bad.Correct {
					t.Fatalf("%s/%s: wrong answer incorrectly verified (prompt %q)", cat, diff, task.Prompt)
				}
			}
		}
	}
}

func TestParseCategoryAndDifficulty(t *testing.T) {
	cases := map[string]Category{
		"mental":           CategoryMental,
		"Grundrechenarten": CategoryMental,
		"einheiten":        CategoryUnits,
		"units":            CategoryUnits,
		"formeln":          CategoryFormulas,
	}
	for in, want := range cases {
		got, ok := ParseCategory(in)
		if !ok || got != want {
			t.Errorf("ParseCategory(%q)=%q,%v want %q", in, got, ok, want)
		}
	}
	if _, ok := ParseCategory("nonsense"); ok {
		t.Error("ParseCategory accepted nonsense")
	}
	if ParseDifficulty("easy") != Easy || ParseDifficulty("schwer") != Hard || ParseDifficulty("") != Medium {
		t.Error("ParseDifficulty mapping is wrong")
	}
}

func TestTextAnswerNormalization(t *testing.T) {
	g := NewWithSeed([]byte("s"), 1)
	// Build a signed token manually so we control the answer.
	token, err := g.sign(issued{ID: "x", Category: "mental", Answer: "5r3", AnswerType: "text", IssuedAt: 1})
	if err != nil {
		t.Fatal(err)
	}
	for _, in := range []string{"5r3", "5R3", "5 rest 3", "5 Rest 3", "  5 r 3 "} {
		v, err := g.Verify(token, in)
		if err != nil {
			t.Fatal(err)
		}
		if !v.Correct {
			t.Errorf("answer %q should be accepted", in)
		}
	}
}

func TestNumericTolerance(t *testing.T) {
	g := NewWithSeed([]byte("s"), 1)
	token, err := g.sign(issued{ID: "x", Category: "units", Answer: "54", AnswerType: "numeric", Tolerance: 1e-6, IssuedAt: 1})
	if err != nil {
		t.Fatal(err)
	}
	for _, in := range []string{"54", "54.0", "54,0", " 54 "} {
		v, _ := g.Verify(token, in)
		if !v.Correct {
			t.Errorf("answer %q should be accepted", in)
		}
	}
	v, _ := g.Verify(token, "108")
	if v.Correct {
		t.Error("wrong numeric answer accepted")
	}
}

func TestDivisionAnswerMatching(t *testing.T) {
	g := NewWithSeed([]byte("s"), 1)
	token := func(answer string) string {
		tok, err := g.sign(issued{ID: "x", Category: "mental", Answer: answer, AnswerType: "division", IssuedAt: 1})
		if err != nil {
			t.Fatal(err)
		}
		return tok
	}
	check := func(tok, given string, want bool) {
		t.Helper()
		v, err := g.Verify(tok, given)
		if err != nil {
			t.Fatal(err)
		}
		if v.Correct != want {
			t.Errorf("answer %q: got correct=%v want %v", given, v.Correct, want)
		}
	}

	// Remainder zero: a bare quotient is correct.
	zero := token("2r0")
	for _, in := range []string{"2", "2r0", "2 rest 0", " 2 R 0 "} {
		check(zero, in, true)
	}
	for _, in := range []string{"3", "2r1", "20", ""} {
		check(zero, in, false)
	}

	// Non-zero remainder: the bare quotient is not enough.
	rest := token("5r3")
	for _, in := range []string{"5r3", "5 rest 3"} {
		check(rest, in, true)
	}
	for _, in := range []string{"5", "5r4", "4r3"} {
		check(rest, in, false)
	}
}

func TestTamperedTokenRejected(t *testing.T) {
	g := NewWithSeed([]byte("secret"), 7)
	tasks, err := g.Generate(CategoryMental, Medium, 1)
	if err != nil {
		t.Fatal(err)
	}
	tampered := tasks[0].Token + "x"
	if _, err := g.Verify(tampered, "1"); err == nil {
		t.Fatal("tampered token was accepted")
	}

	other := NewWithSeed([]byte("different-secret"), 7)
	if _, err := other.Verify(tasks[0].Token, "1"); err == nil {
		t.Fatal("token signed with another secret was accepted")
	}
}
