//go:build js && wasm

// Command wasm exposes the offline training core to JavaScript via syscall/js.
// Each function takes and returns a JSON string.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"syscall/js"
	"time"

	"trainer/internal/mathdrill"
	"trainer/internal/memory"
)

var (
	mathGen  *mathdrill.Generator
	memGen   *memory.Generator
	memStore *memory.Store
)

func main() {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		panic(err)
	}
	mathGen = mathdrill.New([]byte(hex.EncodeToString(secret)))
	memGen = memory.New()
	memStore = memory.NewStore(30 * time.Minute)

	api := map[string]any{
		"mathGenerate":    js.FuncOf(mathGenerate),
		"mathVerify":      js.FuncOf(mathVerify),
		"memoryGenerate":  js.FuncOf(memoryGenerate),
		"memoryQuestions": js.FuncOf(memoryQuestions),
		"memoryEvaluate":  js.FuncOf(memoryEvaluate),
	}
	js.Global().Set("trainerOffline", js.ValueOf(api))

	// Keep the registered JS functions alive for the app's lifetime.
	select {}
}

func argJSON(args []js.Value) ([]byte, bool) {
	if len(args) < 1 || args[0].Type() != js.TypeString {
		return nil, false
	}
	return []byte(args[0].String()), true
}

func mustJSON(value any) string {
	b, err := json.Marshal(value)
	if err != nil {
		return `{"error":"internal error","status":500}`
	}
	return string(b)
}

func errJSON(message string, status int) string {
	return mustJSON(map[string]any{"error": message, "status": status})
}

func mathGenerate(_ js.Value, args []js.Value) any {
	raw, ok := argJSON(args)
	if !ok {
		return errJSON("invalid arguments", 0)
	}
	var in struct {
		Type       string `json:"type"`
		Difficulty string `json:"difficulty"`
		Count      int    `json:"count"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return errJSON("invalid request", 0)
	}

	category, ok := mathdrill.ParseCategory(in.Type)
	if !ok {
		category = mathdrill.CategoryMental
	}
	difficulty := mathdrill.ParseDifficulty(in.Difficulty)

	tasks, err := mathGen.Generate(category, difficulty, in.Count)
	if err != nil {
		return errJSON("could not generate tasks", 500)
	}
	return mustJSON(map[string]any{
		"category":   category,
		"difficulty": difficulty.String(),
		"count":      len(tasks),
		"tasks":      tasks,
	})
}

func mathVerify(_ js.Value, args []js.Value) any {
	raw, ok := argJSON(args)
	if !ok {
		return errJSON("invalid arguments", 0)
	}
	var in struct {
		Answers []struct {
			Token      string `json:"token"`
			Answer     string `json:"answer"`
			DurationMs int64  `json:"duration_ms"`
		} `json:"answers"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return errJSON("invalid request", 0)
	}

	results := make([]map[string]any, 0, len(in.Answers))
	var correct int
	var totalDuration int64
	for _, a := range in.Answers {
		v, err := mathGen.Verify(a.Token, a.Answer)
		if err != nil {
			return errJSON("invalid task token", 400)
		}
		if v.Correct {
			correct++
		}
		totalDuration += a.DurationMs
		results = append(results, map[string]any{
			"question_id": v.ID,
			"category":    v.Category,
			"correct":     v.Correct,
			"expected":    v.Expected,
			"given":       v.Given,
			"duration_ms": a.DurationMs,
		})
	}
	total := len(results)
	accuracy := 0.0
	if total > 0 {
		accuracy = float64(correct) / float64(total)
	}
	return mustJSON(map[string]any{
		"total":       total,
		"correct":     correct,
		"accuracy":    accuracy,
		"error_rate":  1 - accuracy,
		"duration_ms": totalDuration,
		"logged":      false,
		"results":     results,
	})
}

func memoryGenerate(_ js.Value, args []js.Value) any {
	raw, ok := argJSON(args)
	if !ok {
		return errJSON("invalid arguments", 0)
	}
	var in struct {
		Count        int `json:"count"`
		DelaySeconds int `json:"delay_seconds"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return errJSON("invalid request", 0)
	}

	sess := memGen.NewSession(in.Count, time.Duration(in.DelaySeconds)*time.Second)
	memStore.Add(sess)
	return mustJSON(map[string]any{
		"session_id":    sess.ID,
		"profiles":      sess.Profiles,
		"ready_at":      sess.ReadyAt,
		"delay_seconds": in.DelaySeconds,
	})
}

func memoryQuestions(_ js.Value, args []js.Value) any {
	raw, ok := argJSON(args)
	if !ok {
		return errJSON("invalid arguments", 0)
	}
	var in struct {
		SessionID string `json:"session_id"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return errJSON("invalid request", 0)
	}

	sess, ok := memStore.Get(in.SessionID)
	if !ok {
		return errJSON("session not found or expired", 404)
	}
	if remaining := time.Until(sess.ReadyAt); remaining > 0 {
		retry := int(remaining.Seconds()) + 1
		return mustJSON(map[string]any{
			"error":       "memorisation time not over yet",
			"status":      425,
			"retry_after": retry,
		})
	}
	return mustJSON(map[string]any{"session_id": sess.ID, "questions": sess.Questions})
}

func memoryEvaluate(_ js.Value, args []js.Value) any {
	raw, ok := argJSON(args)
	if !ok {
		return errJSON("invalid arguments", 0)
	}
	var in struct {
		SessionID  string          `json:"session_id"`
		MemorizeMs int64           `json:"memorize_ms"`
		Answers    []memory.Answer `json:"answers"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return errJSON("invalid request", 0)
	}

	sess, ok := memStore.Get(in.SessionID)
	if !ok {
		return errJSON("session not found or expired", 404)
	}
	eval := sess.Evaluate(in.Answers)
	return mustJSON(map[string]any{
		"session_id":  sess.ID,
		"total":       eval.Total,
		"correct":     eval.Correct,
		"hit_rate":    eval.HitRate,
		"memorize_ms": in.MemorizeMs,
		"logged":      false,
		"results":     eval.Results,
	})
}
