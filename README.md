# Trainer

A lightweight web app for aptitude-test prep (TMS, MedAT, Bundeswehr CAT) and
Abitur basics. It trains **mental arithmetic / quantitative reasoning**,
**units & physics formulas**, and **memory** — with no build step and no CDN, it
runs fully offline and is built to run cheaply on a Raspberry Pi.

- **Local-first:** usable immediately as a guest, all results stay in the browser.
- **Optional account:** registering signs you in and syncs local guest data.
- **Resource-friendly:** one static Go binary, SQLite (WAL), vanilla JS.
- **Instant feedback:** answers are checked server-side against encrypted,
  stateless task tokens (the solution is never readable by the client).
- **Keyboard-first:** large type, auto-focus, Enter/numpad, number keys 1–4.
- **Bilingual:** German and English, switchable in the header.
- **Extra drills:** a reaction-time test and a visual (photographic) memory grid.
- **Account preferences:** difficulty choices and language follow the account.

---

## Contents

- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Testing](#testing)
- [API reference](#api-reference)
- [Hosting](#hosting)
- [Android app (offline APK)](#android-app-offline-apk)
- [Backups](#backups)

---

## How it works

### Mental math module
Depending on the difficulty (easy / medium / hard), the generator produces:

- **Arithmetic:** 1×1 up to 20×20, division with remainder, chained operations.
- **Units / powers of ten:** e.g. km/h→m/s, bar→Pa, µg→mg, mm³→l, kWh→J.
- **Formulas:** `v = s/t`, `p = F/A`, `U = R·I` — each with a randomly isolated
  variable.

The correct answer is stored inside an **AES-GCM-encrypted token**. Verification
is therefore stateless (survives restarts) and the solution stays hidden from
the client. Numeric answers are compared with a relative tolerance; text answers
are normalised (`"5 rest 3"` == `"5r3"`). For division with a remainder, a bare
quotient is accepted when the remainder is zero, so `2` is correct for `8 ÷ 4`.

### Memory module
1. **Phase 1:** 4–8 plausible patient profiles (name, age, profession, diagnosis,
   medication, blood group, symptom/allergy) with a countdown.
2. **Phase 2:** only after the study time has elapsed (enforced server-side,
   `425 Too Early`) are multiple-choice and matching questions released. The
   switch is automatic — you cannot keep studying.
3. **Evaluation:** hit rate and study time, optionally stored as a stat.

### Reaction & visual memory
- **Reaction test:** the pad stays neutral until a random moment, then turns
  green; you click as fast as possible. Runs several rounds and reports the
  average and fastest time.
- **Visual memory:** a sequence of 10 / 20 / 30 grids is shown one after
  another. Each grid has a varying number of colored tiles and is displayed for
  a short study time (0.1–5 s, adjustable with a slider). The colors are then
  hidden and you pick the tiles you remember; a wrong pick ends the image
  immediately, and your response time is measured. The grid grows with
  difficulty (4×4 / 6×6 / 8×8).

Both are client-side drills and report through `POST /api/stats/reaction` and
`POST /api/stats/memory` (visual) when signed in, or into the guest backlog.
The math drill also offers a big on-screen keypad (with only the keys the
category needs) so no phone keyboard is required.

### Local-first & sync
Without an account the client collects all results in `localStorage`
(`trainer.backlog`) and keeps a separate local history (`trainer.history`) for
the dashboard. On login/registration the backlog is uploaded via
`POST /api/sync` and then cleared. The dashboard (streak, daily values, 7-day
accuracy) always computes from the local history, so it works offline too.

---

## Tech stack

| Area | Choice |
| --- | --- |
| Backend | Go, [chi](https://github.com/go-chi/chi) router |
| Database | SQLite (WAL) via `modernc.org/sqlite` — **pure Go, no CGO** |
| Auth | bcrypt + HS256 JWT in an HttpOnly `session` cookie |
| Frontend | HTML/CSS/vanilla JS as ES modules, no build step, no CDN |
| Android (offline) | Capacitor + the same Go core compiled to WebAssembly |
| Deployment | Multi-stage Dockerfile, Docker Compose / Coolify, ARM64 |

---

## Project structure

```
cmd/server/            entrypoint, config, graceful shutdown
cmd/wasm/              js/wasm bridge for the offline Android core (build-tagged)
internal/api/          chi router, middleware (optionalAuth/requireAuth), handlers
internal/auth/         bcrypt passwords, JWT signing, recovery codes
internal/config/       environment configuration
internal/db/           Open (WAL pragmas) + idempotent migration
internal/store/        SQL for users and stats
internal/models/       domain types and request DTOs
internal/mathdrill/    task generator + token verification
internal/memory/       profile/question generator, sessions, evaluation
web/static/            index.html, style.css, js/ (ES modules: math, memory,
                       reaction, visual, dashboard, auth, prefs, i18n)
android/               Capacitor native project (generated; offline APK)
scripts/build-wasm.sh  builds web/static/wasm/ for the Android app
Dockerfile             multi-stage build (CGO_ENABLED=0)
docker-compose.yml     Coolify/Compose stack
```

---

## Quick start

**Requirements:** Go ≥ 1.26. Nothing else — SQLite is inside the binary.

```sh
git clone https://github.com/<your-user>/trainer.git
cd trainer

go run ./cmd/server          # http://localhost:8080
```

For a session that survives restarts, set the secret:

```sh
TRAINER_JWT_SECRET="$(openssl rand -hex 32)" go run ./cmd/server
```

Always start the app **from the repository root**, because `TRAINER_STATIC` is
resolved relative to the working directory.

---

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `TRAINER_ADDR` | `:8080` | listen address |
| `TRAINER_DB` | `data/trainer.db` | SQLite path (`data/` is gitignored) |
| `TRAINER_STATIC` | `web/static` | static assets, **relative to CWD** |
| `TRAINER_JWT_SECRET` | random per start | unset ⇒ sessions drop on restart. **Always set in production** |
| `TRAINER_TOKEN_TTL` | `720h` | session cookie lifetime (Go duration) |
| `TRAINER_COOKIE_SECURE` | `false` | set `true` behind HTTPS |

> Task tokens are derived from `TRAINER_JWT_SECRET`. Changing the secret
> invalidates open tasks and sessions.

---

## Testing

### Automated tests

```sh
go test ./...     # unit tests for mathdrill, memory and db migration
go vet ./...      # static checks
gofmt -l .        # formatting check
```

Covered: generator round-trips across all categories/difficulties (correct
answer verifies, wrong answer rejected), AES-GCM tamper protection, text and
tolerance comparison, division-with/without-remainder handling, profile bounds
and uniqueness, multiple-choice/matching evaluation, session expiry, and the
legacy email→username migration.

### Manual API test

Start the server (see [Quick start](#quick-start)), then:

```sh
# Health
curl localhost:8080/healthz

# Mental math: 3 tasks
curl "localhost:8080/api/drill/math?type=mental&difficulty=medium&count=3"

# Check answers (insert a token from the response above)
curl -X POST localhost:8080/api/drill/math/verify \
  -H 'Content-Type: application/json' \
  -d '{"answers":[{"token":"<TOKEN>","answer":"42","duration_ms":1200}],"log":false}'

# Memory: 5 profiles, 3 seconds study time
curl "localhost:8080/api/drill/memory/generate?count=5&delay_seconds=3"
# -> session_id from the response; before the delay questions returns 425:
curl "localhost:8080/api/drill/memory/questions?session_id=<SESSION_ID>"

# Account + guest sync
curl -c cookies.txt -X POST localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"testuser","password":"password123"}'
# -> response contains a one-time "recovery_code"; store it safely
curl -b cookies.txt -X POST localhost:8080/api/sync \
  -H 'Content-Type: application/json' \
  -d '{"math":[{"category":"mental","duration_ms":60000,"accuracy":0.9,"error_rate":0.1}],"memory":[]}'

# Reset a forgotten password
curl -X POST localhost:8080/api/auth/recover \
  -H 'Content-Type: application/json' \
  -d '{"username":"testuser","recovery_code":"XXXX-XXXX-XXXX-XXXX","new_password":"newpassword456"}'
```

Quick reference: `type={mental|units|formulas}`,
`difficulty={easy|medium|hard}`; `POST /api/auth/login|recover|logout`,
`GET /api/auth/me`; `POST /api/stats/math|memory` writes a stat directly.
`POST /api/sync` requires login — every other `/api/*` route works anonymously.

### Manual frontend check

1. Start `go run ./cmd/server` and open http://localhost:8080.
2. **Guest mode:** start mental math, answer with Enter or the on-screen keypad,
   watch the green/red feedback. Use the **Cancel** button to abort a session.
3. The dashboard shows progress/streak; a reload keeps everything (localStorage).
4. Register (username + password) → a one-time recovery code is shown; after
   confirming, the "x results synced" toast appears and the local backlog clears.
5. Memory: pick a short study time; when the countdown ends the questions
   appear automatically, answer with keys 1–4 or the selects, then check the result.
6. Reaction: start, wait for green, click — repeat for all rounds; the average
   and fastest times are shown.
7. Visual memory: pick a difficulty and image count, set the study-time slider,
   then work through the images and check the summary.
8. Toggle **DE/EN** in the header (on mobile, via the gear menu); change a
   difficulty, reload — the choices persist (and, when signed in, are stored on
   the account).

---

## API reference

All routes live under `/api` and are guest-friendly (cookie optional) except
`POST /api/sync`.

| Method & path | Purpose |
| --- | --- |
| `POST /api/auth/register` / `login` / `logout` | account / session |
| `POST /api/auth/recover` | reset password with the recovery code |
| `GET /api/auth/me` | current user (or guest) |
| `POST /api/stats/math` / `memory` / `reaction` | write a stat directly |
| `GET /api/drill/math?type=&difficulty=&count=` | task set incl. token |
| `POST /api/drill/math/verify` | check answers; optional `log` controls the stat write |
| `GET /api/drill/memory/generate?count=4..8&delay_seconds=0..600` | profiles + `session_id` |
| `GET /api/drill/memory/questions?session_id=` | questions (425 until ready, `Retry-After`) |
| `POST /api/drill/memory/evaluate` | hit rate / study time |
| `GET` / `PUT /api/preferences` | account preferences JSON (**login required**) |
| `POST /api/sync` | attribute guest backlog to the account (**login required**) |
| `GET /healthz` | health check |

---

## Hosting

### Docker Compose (local or your own server)

```sh
cp .env.example .env      # set TRAINER_JWT_SECRET
docker compose up --build
```

The multi-stage image builds a static binary with `CGO_ENABLED=0` and runs it in
a slim `alpine` runtime image as an unprivileged user (`uid 10001`). The
entrypoint makes `/app/data` writable and then drops privileges. The SQLite file
lives in `/app/data` and must persist.

### Raspberry Pi (ARM64) via Coolify from GitHub

1. **Push the repo**

   ```sh
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin git@github.com:<your-user>/trainer.git
   git push -u origin main
   ```

2. **Coolify – source:** *Sources* → connect the GitHub App, pick the repository.
3. **Coolify – resource:** *Project* → *New Resource* → *Application* →
   repository + branch `main`.
4. **Build pack:** `Docker Compose`, compose file `/docker-compose.yml`.
5. **Environment variables:**
   - `TRAINER_JWT_SECRET` **(required)** → `openssl rand -hex 32`. Keep it stable!
   - `TRAINER_COOKIE_SECURE=true` (Coolify provides HTTPS).
   - optional `TRAINER_TOKEN_TTL`.
6. **Persistent storage:** add a volume for `/app/data` (or uncomment the named
   volume lines in `docker-compose.yml`). Without it, training data is lost on
   every redeploy.
7. **Domain:** set the FQDN, enable HTTPS. Coolify detects port `8080`.
8. **Deploy** and check `GET https://<domain>/healthz` returns `{"status":"ok"}`.

Updates: just push to `main` — Coolify rebuilds and redeploys automatically and
the volume is preserved.

### Without Docker, directly on the Pi

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 \
  go build -trimpath -ldflags="-s -w" -o trainer ./cmd/server

TRAINER_JWT_SECRET="$(openssl rand -hex 32)" ./trainer
```

For a permanent service, run the binary via a `systemd` unit and set
`TRAINER_COOKIE_SECURE=true` once a TLS reverse proxy is in front.

---

## Android app (offline APK)

The repository also builds a self-contained Android app with
[Capacitor](https://capacitorjs.com/). It bundles the frontend and runs the math
and memory generators **on-device** by compiling `cmd/wasm` to WebAssembly
(`internal/mathdrill` + `internal/memory`), so it needs no server. It is
guest-only: account login, sync and server preferences are hidden offline; the
dashboard, streak and all drills keep working.

Pushing a tag like `v1.0.0` builds a signed APK and attaches it (with a SHA-256
checksum) to the GitHub Release. `workflow_dispatch` builds an artifact for
testing.

### One-time: create the release keystore

```sh
keytool -genkeypair -v -keystore trainer-release.jks -alias trainer \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 trainer-release.jks        # copy the output
```

Add these repository secrets (Settings → Secrets and variables → Actions, or the
`gh` command):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the base64 string above |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `trainer` |
| `ANDROID_KEY_PASSWORD` | key password |

> Keep `trainer-release.jks` safe. Without the same key, already-installed apps
> cannot be updated in place — users would have to uninstall first. If the
> secrets are missing, CI still builds, but the APK is only debug-signed.

### Cut a release

```sh
git tag v1.0.0
git push origin v1.0.0
```

The **Android APK** workflow then:

1. builds `web/static/wasm/trainer.wasm` and syncs Capacitor;
2. runs `./gradlew assembleRelease` with `versionName` from the tag and
   `versionCode` from the workflow run number;
3. publishes `trainer-v1.0.0.apk` + `trainer-v1.0.0.apk.sha256` on the Releases
   page.

For a test build without a release, run **Actions → Android APK → Run workflow**
and download the `trainer-apk-*` artifact.

### Build locally (needs Node + an Android SDK)

```sh
npm install
npm run android:release          # -> android/app/build/outputs/apk/release/app-release.apk
```

`npm run cap:sync` alone rebuilds the WASM core and copies `web/static` into the
Android project; `npm run android:debug` builds a debug APK. You can also try the
offline core in a desktop browser at `http://localhost:8080/?offline=1`.

To upload a locally built APK to an existing release instead of using CI:

```sh
gh release upload v1.0.0 android/app/build/outputs/apk/release/app-release.apk
```

---

## Backups

There is only one stateful file: the SQLite database. In the container it lives
at `/app/data/trainer.db`. The cleanest way to back it up is the SQLite online
backup:

```sh
sqlite3 data/trainer.db ".backup 'backup/trainer-$(date +%F).db'"
```

In the container, use `docker exec <container> sqlite3 /app/data/trainer.db ...`
or copy the volume/bind directory.
