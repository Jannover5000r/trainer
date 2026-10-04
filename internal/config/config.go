package config

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"strconv"
	"time"
)

// Config holds the runtime configuration.
type Config struct {
	Addr         string
	DBPath       string
	StaticDir    string
	JWTSecret    []byte
	TokenTTL     time.Duration
	CookieSecure bool
}

// Load reads the environment and falls back to development-friendly defaults.
func Load() Config {
	cfg := Config{
		Addr:         env("TRAINER_ADDR", ":8080"),
		DBPath:       env("TRAINER_DB", "data/trainer.db"),
		StaticDir:    env("TRAINER_STATIC", "web/static"),
		TokenTTL:     envDuration("TRAINER_TOKEN_TTL", 30*24*time.Hour),
		CookieSecure: envBool("TRAINER_COOKIE_SECURE", false),
	}

	secret := os.Getenv("TRAINER_JWT_SECRET")
	if secret == "" {
		// Ephemeral development secret; sessions do not survive a restart.
		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err != nil {
			log.Fatalf("config: cannot generate jwt secret: %v", err)
		}
		secret = hex.EncodeToString(buf)
		log.Println("config: TRAINER_JWT_SECRET not set, using ephemeral secret")
	}
	cfg.JWTSecret = []byte(secret)

	return cfg
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}

func envDuration(key string, fallback time.Duration) time.Duration {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}
