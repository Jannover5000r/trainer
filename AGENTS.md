# AGENTS.md

Go + SQLite web app for aptitude-test prep (TMS/MedAT/Bundeswehr CAT, Abitur basics).
Designed to run cheaply on a Raspberry Pi.

## Commands (run from repo root)

```sh
go run ./cmd/server            # dev server, default http://localhost:8080
go build -o server ./cmd/server
go vet ./...                   # lint / static checks
go test ./...                  # unit tests for mathdrill + memory
gofmt -w .
```

Cross-compile for a Pi (pure-Go SQLite driver, no CGO needed):

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o trainer-arm64 ./cmd/server
```

## Configuration (env vars)

| Var | Default | Notes |
| --- | --- | --- |
| `TRAINER_ADDR` | `:8080` | listen address |
| `TRAINER_DB` | `data/trainer.db` | SQLite path; `data/` is gitignored |
| `TRAINER_STATIC` | `web/static` | **relative to CWD**, so run from repo root |
| `TRAINER_JWT_SECRET` | random per start | unset = sessions drop on restart; always set in prod |
| `TRAINER_TOKEN_TTL` | `720h` | Go duration string |
| `TRAINER_COOKIE_SECURE` | `false` | set `true` behind HTTPS |

## Architecture

- `cmd/server/main.go` — entrypoint, graceful shutdown, HTTP server.
- `internal/api/` — chi router + handlers. `optionalAuth` attaches the user to
  the context when a valid cookie is present; `requireAuth` rejects guests.
  Guest routes (`/api/stats/*`) write `user_id = NULL`.
- `internal/auth/` — bcrypt password hashing, HS256 JWT in the HttpOnly
  `session` cookie, and generation/normalisation of recovery codes.
- `internal/db/` — `Open` sets WAL + pragmas in the DSN; `Migrate` runs the
  schema and the non-destructive `migrateUsers` upgrade (legacy `email` column
  -> `username`, adds `recovery_hash`). `SetMaxOpenConns(1)` is intentional
  (single SQLite writer).
- `internal/store/` — SQL for users and stats. `StatsStore.Sync` is transactional.
  `users.preferences` is a free-form JSON object (difficulty choices, language).
- `internal/models/` — domain structs and JSON request DTOs.
- `internal/mathdrill/` — task generator + validator for mental arithmetic,
  unit conversions and physics formulas. `Generator` holds a `math/rand/v2`
  source behind a mutex; use `NewWithSeed` for deterministic tests. Correct
  answers live inside an AES-GCM-encrypted, stateless task token (not the DB),
  so verification survives restarts and the answer is not client-readable.
  Division tasks use the `"division"` answer type: `"2r0"` accepts a bare `"2"`.
- `internal/memory/` — patient-profile generator, MC/matching questions and
  evaluation. Sessions are an in-memory TTL store (`memory.Store`, 30 min);
  questions are withheld until `Session.ReadyAt`. `Session.MarkEvaluated`
  guarantees a memory stat is logged at most once per session.
- `web/static/` — vanilla HTML/CSS/JS, no build step and no CDN (must work
  offline). Entry is `index.html` -> `/js/app.js` (ES modules): `api.js`,
  `store.js`, `ui.js`, `i18n.js`, `prefs.js`, `theme.js`, `auth.js`,
  `dashboard.js`, `math.js`, `memory.js`, `reaction.js`, `visual.js`,
  `symbols.js`. UI text goes through
  `i18n.js` (`t()` on render; `data-i18n` attributes via `applyStatic()`);
  DE/EN switch in the header. Local-first: guests accumulate results in
  `localStorage` (`trainer.backlog`) which `POST /api/sync` uploads and clears
  after login; `trainer.history` powers the dashboard and is kept locally even
  for signed-in users. `prefs.js` mirrors `trainer.settings` to the account via
  `GET/PUT /api/preferences` when signed in (guests stay local-only). Styling is
  a small hand-written `style.css` with CSS variables (deliberately not
  Tailwind CDN: offline + Pi-friendly). Theme is a green-blue futuristic look:
  `theme.js` stores `theme: "light"|"dark"|"system"` in `trainer.settings`
  (synced with the account), resolves `system` via `prefers-color-scheme`, and
  sets `html[data-theme]`; `style.css` keeps two palettes under
  `:root`/`html[data-theme="light"]`, and `index.html` applies the saved theme
  inline before first paint (header `#theme-button` cycles, `#menu-dialog`
  has the three-way `#menu-theme` control).
- Reaction and visual-memory drills are **client-side** (timing/pattern are not
  server-verifiable); they report results through `POST /api/stats/reaction` and
  `POST /api/stats/memory` (`profile_type: "visual"`). Visual memory runs a
  sequence of 10/20/30 grids with a 0.1–5 s study-time slider and fail-fast
  recall (a wrong pick ends the image; response times are averaged). The
  `visual.js` view has a mode switch: "Bildfolge" (that sequence) and
  "Symbolfeld" (`symbols.js`) — one field of colored symbols memorized for
  15 s–5 min, then a bottom palette per symbol; tap all its cells, first mistake
  ends the run. Both are client-side and log a `profile_type: "visual"` stat
  (symbol runs also set `variant: "symbols"` in local history). The math
  view has an on-screen keypad (`inputmode="none"`); on screens ≤700px the
  inline language/account buttons are hidden behind the header gear menu
  (`#menu-dialog`).
- Accounts are **username + password** (no email) with a one-time recovery code
  shown at registration. Memory phase 1 auto-switches to the questions when the
  countdown ends (hard stop).

## API surface (all under `/api`, guest-friendly via `optionalAuth`)

- `POST /auth/register|login|recover|logout`, `GET /auth/me` — `register` and
  `recover` return a one-time `recovery_code`
- `POST /stats/math|memory|reaction` — write a stat directly
- `GET /drill/math?type={mental|units|formulas}&difficulty={easy|medium|hard}&count=N`
- `POST /drill/math/verify` — batch `{answers:[{token,answer,duration_ms}]}`;
  optional `log` (default true) controls the aggregate `stats_math` write, so
  the UI can check each answer with `log:false` for instant feedback and log
  once at the end with `log:true`
- `GET /drill/memory/generate?count=4..8&delay_seconds=0..600`
- `GET /drill/memory/questions?session_id=...` — `425 Too Early` until the
  memorisation delay elapsed (`Retry-After` header)
- `POST /drill/memory/evaluate` — `{session_id, memorize_ms, answers}`
- `GET /preferences` / `PUT /preferences` — account preferences JSON (**requires auth**)
- `POST /sync` — **requires auth**

## Gotchas

- SQLite driver is `modernc.org/sqlite` (pure Go), NOT `mattn/go-sqlite3`; do
  not add CGO. The Dockerfile relies on `CGO_ENABLED=0`.
- No migration tool: `internal/db/migrate.go` is an idempotent
  `CREATE TABLE IF NOT EXISTS` block executed on every start. Add new
  columns/tables there; never write destructive changes without a real versioned
  migration.
- `TRAINER_STATIC` is resolved against the working directory, so tests/binaries
  must run from the repo root for the frontend to resolve.
- `POST /api/sync` requires authentication; all other `/api/*` routes work
  anonymously.
- The task token key is derived from `TRAINER_JWT_SECRET`; changing the secret
  invalidates outstanding task tokens (issued-at is embedded and used to clamp
  reported per-task latency).
- Memory sessions are intentionally in-memory (restart = invalidated) and are
  not shared across instances; only evaluated results reach SQLite.
- Accounts have no email: `users.username` is unique and lower-cased. The
  recovery code is bcrypt-hashed in `recovery_hash` and rotated on every
  successful `/auth/recover`; treat it as a single-use secret.
- Frontend drill views must not be startable twice: the config card is hidden
  during a session, `memory.js` guards the countdown->questions switch with a
  `phase` flag + `stopCountdown()` (idempotent), and `math.js` tags each session
  with a `sessionToken` checked by the timer/`setTimeout`/`finish` callbacks.
  Keep these guards when editing the views.
- Mobile tap targets use `onTap()` from `ui.js` (pointer events, not `click`)
  so rapid taps register: `"down"` for reaction pad/keypad, `"up"` for grid
  cells. Never rebuild a drill board with `innerHTML` on every pick (the symbol
  field patches single cells in `updateRecallUI`) — that drops taps on Android.
  Interactive tiles/buttons need `touch-action: manipulation` to avoid the
  double-tap-zoom delay.

## Deployment

- `Dockerfile` is multi-stage: `golang:1.26-alpine` builds a static binary
  (`CGO_ENABLED=0`), `alpine` runs it as uid 10001. `docker-entrypoint.sh`
  chowns `/app/data` then drops privileges via `su-exec`.
- `docker-compose.yml` targets Coolify; `TRAINER_JWT_SECRET` is required and
  cookie-secure defaults to true. The SQLite file lives in `/app/data` — this
  must be a persistent volume or training data is lost on redeploy.
- `README.md` has the GitHub + Coolify step-by-step. Keep `.dockerignore`
  excluding `data/` and binaries when adding build steps.

## Android app (offline)

- `cmd/wasm/` exposes `internal/mathdrill` + `internal/memory` to JS over
  `syscall/js` (JSON strings). It is guarded by `//go:build js && wasm`; a host
  stub (`stub.go`) keeps `go build/vet/test ./...` working. Build with
  `bash scripts/build-wasm.sh` → `web/static/wasm/` (gitignored).
- Capacitor config lives at the repo root (`capacitor.config.json`,
  `package.json`); the native project is generated under `android/`. The app is
  offline and guest-only: `web/static/js/platform.js` detects the native shell
  and `api.js` swaps the HTTP client for `local-api.js` (WASM); the account,
  sync and server-preference UI is hidden offline.
- `.github/workflows/android-release.yml` builds a signed APK on `v*` tags (or
  manual dispatch) and attaches it to the Release. Signing uses the
  `ANDROID_KEYSTORE_*` secrets; `android/app/build.gradle` reads
  `TRAINER_KEYSTORE_PATH` and `-PversionName`/`-PversionCode`.
- `android/`, `node_modules/` and `web/static/wasm/` are excluded from the
  Docker build; never commit the keystore.
