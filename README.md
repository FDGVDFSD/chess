# ♟️ Chess Arena v2

A full-stack chess platform built with React, TypeScript, chess.js, Netlify, and Supabase.

Chess Arena v2 supports bot play, same-device games, persistent online friend rooms, rating-based matchmaking, synchronized clocks, puzzles, openings, ratings, game history, profiles, moderation tools, and owner-only J.A.R.V.I.S. assistance.

> **v2 architecture:** the browser is a static Vite app. Supabase provides Auth, Postgres, Realtime, Row Level Security, and protected Edge Functions. A persistent Express/Socket.IO server is no longer required for production.

## ✨ Highlights

- **10-level bot ladder** with non-blocking worker calculations
- **Local 2-player chess**
- **Persistent online friend rooms** with 6-character room codes
- **Random matchmaking** using stored rating and time-control compatibility
- **Authoritative online moves** validated server-side with chess.js
- **Synchronized clocks** with timeout validation and increment support
- **Bullet, Blitz, Rapid, and overall ratings**
- **Game history and post-game analysis**
- **Puzzle trainer and puzzle rating**
- **Openings explorer**
- **Leaderboard, XP, levels, streaks, and daily progress**
- **Reports, blocking, announcements, audit logs, bans, and owner controls**
- **Owner-only J.A.R.V.I.S. analysis/assistance**
- **Responsive PWA-style interface**
- **GitHub Actions test/typecheck/build verification**
- **Netlify security headers and Supabase RLS**

## 🏗️ Architecture

```text
Browser
  │
  ├── Vite + React + TypeScript
  │
  ├── chess.js (local board rules / bot UI)
  │
  └── Supabase JS
          │
          ├── Auth
          ├── Postgres + RLS
          ├── Realtime
          └── Edge Functions
                ├── chess-game
                │     authoritative multiplayer moves,
                │     clocks, matchmaking, results
                └── chess-admin
                      verified history, ratings,
                      moderation and owner actions
```

The browser never receives a Supabase secret/service-role key. Public clients use a publishable key, while privileged database writes stay inside Edge Functions.

## 🔐 Security Model

Online game state is authoritative in Supabase. The client submits a requested move (`from`, `to`, optional promotion), and the `chess-game` Edge Function verifies authentication, player color, turn ownership, remaining clock time, move legality, and game state before committing it.

Profiles use RLS and column-level grants. Normal users cannot promote themselves to owner, edit ratings, change ban status, or directly modify authoritative online games. Owner-only operations are checked again inside `chess-admin`.

The owner identity is configured server-side in the Supabase project and is intentionally not stored in this repository.

See [SECURITY.md](SECURITY.md) for deployment requirements and reporting guidance.

## 🚀 Local Development

Requirements:

- Node.js 20+
- npm
- A Supabase project for Auth/database/realtime features

Clone and run:

```bash
git clone https://github.com/dvilrgamerz/chess.git
cd chess
npm ci
npm run dev
```

The Vite dev server is the official v2 development runtime.

### Environment

Copy the example file:

```bash
cp .env.example .env.local
```

Then set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Only use a **publishable** key in `VITE_*` variables. Never put a Supabase secret/service-role key in frontend environment variables.

## 🗄️ Supabase Setup

The schema upgrade lives at:

```text
supabase/schema.sql
```

The protected functions live at:

```text
supabase/functions/chess-game/
supabase/functions/chess-admin/
```

For a new environment, apply the schema, deploy both Edge Functions, then configure the intended owner profile server-side. Do not add owner identifiers or secret keys to source control.

Current v2 tables cover profiles, saved games, online games, matchmaking, puzzle results, player reports, announcements, and audit logs.

## 🧪 Verification

Run the same checks used by CI:

```bash
npm test
npm run typecheck
npm run build
```

GitHub Actions runs all three checks for pushes and pull requests targeting `main`.

## 🌐 Netlify

The included `netlify.toml` builds with:

```text
npm run build
```

and publishes:

```text
dist/client
```

SPA fallback, long-term asset caching, HSTS, clickjacking protection, MIME sniffing protection, permissions restrictions, and a Supabase-compatible Content Security Policy are already configured.

## 📁 Project Structure

```text
src/
  components/          React UI
  lib/                 browser services, workers, Supabase client
shared/                 shared chess/types code
tests/                  Vitest test suite
supabase/
  schema.sql            v2 database/RLS upgrade
  functions/
    chess-game/         authoritative multiplayer backend
    chess-admin/        history/rating/admin backend
server/                  legacy v1 Node backend (not production v2 runtime)
.github/workflows/       CI
netlify.toml             production frontend deployment
```

The `server/` directory is retained for legacy reference/tests; production v2 does not depend on it.

## 🎮 Game Integrity

For online games, the Edge Function—not the browser—decides whether a move is legal and whether a timeout, checkmate, draw, resignation, or rating update is valid. State-version checks prevent two stale move requests from silently overwriting one another.

Completed rated online games are saved exactly once before Elo/stat updates are applied. Bot games are also replay-validated before being accepted into history.

## 🧭 v2 Status

The v2 branch focuses on replacing the mixed Supabase/Express authentication architecture with a single Supabase-backed production design, persistent multiplayer, secure owner authorization, synchronized clocks, and deployment reliability.

Before merging a v2 change into `main`, keep CI green and review any Supabase security-advisor warnings.

---

Built as an evolving chess platform for learning, competing, and experimenting with chess AI.
