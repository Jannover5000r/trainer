package auth

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
)

// recoveryAlphabet omits easily confused characters (I, O, 0, 1).
const recoveryAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// NewRecoveryCode returns a 16-character code grouped as XXXX-XXXX-XXXX-XXXX.
func NewRecoveryCode() (string, error) {
	buf := make([]byte, 16)
	for i := range buf {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(recoveryAlphabet))))
		if err != nil {
			return "", err
		}
		buf[i] = recoveryAlphabet[n.Int64()]
	}
	return fmt.Sprintf("%s-%s-%s-%s", buf[0:4], buf[4:8], buf[8:12], buf[12:16]), nil
}

// NormalizeRecoveryCode makes input tolerant of case, spaces and dashes so a
// user can type the code however they copied it.
func NormalizeRecoveryCode(code string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(strings.TrimSpace(code)) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}
