package api

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"trainer/internal/config"
	"trainer/internal/mathdrill"
	"trainer/internal/memory"
	"trainer/internal/store"
)

// Server wires the HTTP router, stores, generators and configuration together.
type Server struct {
	cfg         config.Config
	users       *store.UserStore
	stats       *store.StatsStore
	math        *mathdrill.Generator
	memGen      *memory.Generator
	memSessions *memory.Store
	router      http.Handler
}

// NewServer builds the fully configured HTTP handler.
func NewServer(database *sql.DB, cfg config.Config) *Server {
	s := &Server{
		cfg:         cfg,
		users:       store.NewUserStore(database),
		stats:       store.NewStatsStore(database),
		math:        mathdrill.New(cfg.JWTSecret),
		memGen:      memory.New(),
		memSessions: memory.NewStore(30 * time.Minute),
	}
	s.router = s.routes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Server) routes() http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5))
	r.Use(securityHeaders)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(r chi.Router) {
		// Optional auth: handlers below work for guests and signed-in users.
		r.Use(s.optionalAuth)

		r.Post("/auth/register", s.handleRegister)
		r.Post("/auth/login", s.handleLogin)
		r.Post("/auth/recover", s.handleRecover)
		r.Post("/auth/logout", s.handleLogout)
		r.Get("/auth/me", s.handleMe)

		// Direct stat submission (guest or user).
		r.Post("/stats/math", s.handleMath)
		r.Post("/stats/memory", s.handleMemory)
		r.Post("/stats/reaction", s.handleReaction)

		// Drill generators and verification.
		r.Get("/drill/math", s.handleDrillMath)
		r.Post("/drill/math/verify", s.handleDrillMathVerify)
		r.Get("/drill/memory/generate", s.handleMemoryGenerate)
		r.Get("/drill/memory/questions", s.handleMemoryQuestions)
		r.Post("/drill/memory/evaluate", s.handleMemoryEvaluate)

		// Sync requires an authenticated user.
		r.With(s.requireAuth).Post("/sync", s.handleSync)

		// Per-account preferences (difficulty, language, ...).
		r.With(s.requireAuth).Get("/preferences", s.handleGetPreferences)
		r.With(s.requireAuth).Put("/preferences", s.handlePutPreferences)
	})

	// Static frontend. Registered last so /api and /healthz take precedence.
	fileServer := http.FileServer(http.Dir(s.cfg.StaticDir))
	r.Handle("/*", fileServer)

	return r
}
