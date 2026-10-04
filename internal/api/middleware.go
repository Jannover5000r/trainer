package api

import (
	"context"
	"net/http"
	"time"

	"trainer/internal/auth"
)

type contextKey int

const (
	userIDKey  contextKey = iota
	cookieName            = "session"
)

// optionalAuth attaches the authenticated user id to the request context when
// a valid session cookie is present. Invalid or missing cookies are ignored so
// guest mode keeps working.
func (s *Server) optionalAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(cookieName); err == nil {
			if uid, err := auth.Verify(s.cfg.JWTSecret, c.Value); err == nil {
				ctx := context.WithValue(r.Context(), userIDKey, uid)
				r = r.WithContext(ctx)
			}
		}
		next.ServeHTTP(w, r)
	})
}

// requireAuth rejects requests without a valid session.
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := userIDFrom(r.Context()); !ok {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func userIDFrom(ctx context.Context) (int64, bool) {
	uid, ok := ctx.Value(userIDKey).(int64)
	return uid, ok
}

func (s *Server) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(s.cfg.TokenTTL),
		MaxAge:   int(s.cfg.TokenTTL.Seconds()),
	})
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}
