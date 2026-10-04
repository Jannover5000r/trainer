package auth

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ErrInvalidToken is returned for any token that fails validation.
var ErrInvalidToken = errors.New("invalid token")

// Claims embeds the standard JWT claims and carries the user id.
type Claims struct {
	UserID int64 `json:"uid"`
	jwt.RegisteredClaims
}

// Sign issues an HS256 token for the given user.
func Sign(secret []byte, userID int64, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(userID, 10),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret)
}

// Verify parses a token and returns the user id it belongs to.
func Verify(secret []byte, tokenString string) (int64, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method %q", t.Header["alg"])
		}
		return secret, nil
	})
	if err != nil {
		return 0, ErrInvalidToken
	}
	if claims.UserID == 0 {
		return 0, ErrInvalidToken
	}
	return claims.UserID, nil
}
