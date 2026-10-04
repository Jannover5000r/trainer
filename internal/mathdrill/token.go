package mathdrill

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"strconv"
	"strings"
	"time"
)

// ErrInvalidToken is returned when a task token is malformed or fails
// authentication. Tokens are stateless: the correct answer travels inside the
// encrypted payload so verification survives a server restart and stays hidden
// from the client.
var ErrInvalidToken = errors.New("invalid task token")

// issued is the encrypted payload embedded in every task token.
type issued struct {
	ID         string  `json:"id"`
	Category   string  `json:"c"`
	Difficulty string  `json:"d"`
	Answer     string  `json:"a"`
	AnswerType string  `json:"t"` // "numeric" | "text"
	Tolerance  float64 `json:"e"`
	IssuedAt   int64   `json:"iat"`
}

// tokenCipher derives an AES-256-GCM AEAD from the server secret. The payload
// is encrypted rather than merely signed so a client cannot base64-decode the
// correct answer while still keeping verification stateless.
func (g *Generator) tokenCipher() (cipher.AEAD, error) {
	key := sha256.Sum256(append([]byte("mathdrill-token-v1:"), g.secret...))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func (g *Generator) sign(p issued) (string, error) {
	payload, err := json.Marshal(p)
	if err != nil {
		return "", err
	}
	aead, err := g.tokenCipher()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := aead.Seal(nonce, nonce, payload, nil)
	return base64.RawURLEncoding.EncodeToString(sealed), nil
}

func (g *Generator) parseToken(token string) (issued, error) {
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return issued{}, ErrInvalidToken
	}
	aead, err := g.tokenCipher()
	if err != nil {
		return issued{}, ErrInvalidToken
	}
	if len(raw) < aead.NonceSize() {
		return issued{}, ErrInvalidToken
	}
	nonce, ciphertext := raw[:aead.NonceSize()], raw[aead.NonceSize():]
	payload, err := aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return issued{}, ErrInvalidToken
	}
	var p issued
	if err := json.Unmarshal(payload, &p); err != nil {
		return issued{}, ErrInvalidToken
	}
	return p, nil
}

// Verification is the outcome of checking a single submitted answer.
type Verification struct {
	ID         string
	Category   string
	Difficulty string
	Correct    bool
	Expected   string
	Given      string
	IssuedAt   time.Time
}

// Verify checks an answer against the signed token without touching the DB.
func (g *Generator) Verify(token, answer string) (Verification, error) {
	p, err := g.parseToken(token)
	if err != nil {
		return Verification{}, err
	}
	return Verification{
		ID:         p.ID,
		Category:   p.Category,
		Difficulty: p.Difficulty,
		Correct:    answersMatch(p, answer),
		Expected:   p.Answer,
		Given:      strings.TrimSpace(answer),
		IssuedAt:   time.Unix(p.IssuedAt, 0),
	}, nil
}

func answersMatch(p issued, given string) bool {
	switch p.AnswerType {
	case "numeric":
		want, err := strconv.ParseFloat(p.Answer, 64)
		if err != nil {
			return false
		}
		got, ok := parseNumber(given)
		if !ok {
			return false
		}
		tol := p.Tolerance
		if tol <= 0 {
			tol = 1e-6
		}
		diff := math.Abs(got - want)
		return diff <= tol || diff <= tol*math.Abs(want)
	case "division":
		return divisionMatches(p.Answer, given)
	default:
		return normalizeText(given) == normalizeText(p.Answer)
	}
}

// divisionMatches compares a division-with-remainder answer. The expected value
// is stored as "quotient r remainder" (e.g. "5r3"). A bare quotient is accepted
// when the remainder is zero, so "2" is correct for "8 ÷ 4".
func divisionMatches(expected, given string) bool {
	wantQ, wantR, _, ok := parseDivision(expected)
	if !ok {
		return false
	}
	gotQ, gotR, hasRemainder, ok := parseDivision(given)
	if !ok {
		return false
	}
	if !hasRemainder {
		return wantR == 0 && gotR == 0 && gotQ == wantQ
	}
	return gotQ == wantQ && gotR == wantR
}

// parseDivision parses "5r3", "5 rest 3" or a bare "5". hasRemainder is false
// when no "r"/"rest" part was present.
func parseDivision(s string) (quotient, remainder int, hasRemainder, ok bool) {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "rest", "r")
	s = strings.ReplaceAll(s, ",", "")
	const maxLen = 32
	if s == "" || len(s) > maxLen {
		return 0, 0, false, false
	}
	parts := strings.SplitN(s, "r", 2)
	q, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, false, false
	}
	if len(parts) == 1 {
		return q, 0, false, true
	}
	r, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, false, false
	}
	return q, r, true, true
}

// parseNumber extracts a float from a user answer, tolerating a decimal comma
// and stray whitespace but not unit suffixes.
func parseNumber(s string) (float64, bool) {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, ",", ".")
	f, err := strconv.ParseFloat(s, 64)
	return f, err == nil
}

// normalizeText canonicalises free-text answers such as "5 rest 3" -> "5r3".
func normalizeText(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "rest", "r")
	s = strings.ReplaceAll(s, ",", "")
	s = strings.ReplaceAll(s, "×", "x")
	s = strings.ReplaceAll(s, "*", "x")
	// Collapse repeated "r" that would come from "rest" plus an explicit "r".
	for strings.Contains(s, "rr") {
		s = strings.ReplaceAll(s, "rr", "r")
	}
	return s
}

func newID() (string, error) {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
