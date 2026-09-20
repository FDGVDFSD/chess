# ♟️ Chess Arena v2

<p align="center">
  <strong>A modern full-stack chess platform for playing, improving, competing, and experimenting with chess AI.</strong>
</p>

<p align="center">
  <a href="https://chess-arena-v2.netlify.app"><strong>🎮 Play Chess Arena Live</strong></a>
  ·
  <a href="https://github.com/dvilrgamerz/chess/issues">Report a Bug</a>
  ·
  <a href="SECURITY.md">Security</a>
</p>

<p align="center">
  <a href="https://chess-arena-v2.netlify.app">
    <img alt="Live Site" src="https://img.shields.io/badge/PLAY-LIVE-success?style=for-the-badge&logo=netlify" />
  </a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-React-blue?style=for-the-badge&logo=typescript" />
  <img alt="Supabase" src="https://img.shields.io/badge/Backend-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" />
  <img alt="Netlify" src="https://img.shields.io/badge/Deploy-Netlify-00C7B7?style=for-the-badge&logo=netlify&logoColor=white" />
</p>

> **Live app:** [https://chess-arena-v2.netlify.app](https://chess-arena-v2.netlify.app)

---

## 🚀 What is Chess Arena?

**Chess Arena v2** is a modern full-stack chess platform built with **React, TypeScript, chess.js, Supabase, and Netlify**.

It supports bot play, same-device matches, persistent online friend rooms, rating-based matchmaking, synchronized clocks, puzzles, openings, game history, player profiles, moderation tools, and owner-only J.A.R.V.I.S. assistance.

The v2 architecture removes the old production dependency on a persistent Express/Socket.IO server. The browser runs as a static Vite application while Supabase handles authentication, persistence, realtime updates, security rules, and protected backend logic.

## ✨ Features

| Area | Features |
| --- | --- |
| 🤖 **Bots** | 10 bot levels, worker-based calculations, difficulty progression |
| 🌐 **Online Play** | Friend rooms, 6-character room codes, matchmaking, realtime updates |
| ⏱️ **Chess Clocks** | Server-backed clocks, increments, timeout validation |
| 🏆 **Competitive** | Elo ratings, Bullet/Blitz/Rapid ratings, leaderboard |
| 📈 **Progression** | XP, levels, streaks, daily progress, game history |
| 🧩 **Training** | Puzzle trainer, puzzle rating, opening explorer |
| 👥 **Local Play** | Same-device two-player chess |
| 🛡️ **Safety** | Reports, blocking, bans, moderation tools, audit logs |
| 👑 **Owner Tools** | Owner dashboard and J.A.R.V.I.S. assistance |
| 📱 **UI** | Responsive layout, board themes, piece themes, accessibility settings |

## 🎮 Play Now

### 🌍 Live Production App

**[▶ Open Chess Arena v2](https://chess-arena-v2.netlify.app)**

Production branch: **`main`**

---

## 🏗️ Architecture

```text
Browser
  │
  ├── Vite + React + TypeScript
  │
  ├── chess.js
  │
  └── Supabase JS
          │
          ├── Auth
          ├── Postgres + RLS
          ├── Realtime
          └── Edge Functions
                │
                ├── chess-game
                │     ├── legal move validation
                │     ├── matchmaking
                │     ├── room management
                │     ├── synchronized clocks
                │     └── online results
                │
                └── chess-admin
                      ├── ratings
                      ├── saved history
                      ├── moderation
                      ├── analytics
                      └── owner actions
```

### Why this design?

The browser never receives a Supabase secret/service-role key.

Players send requests such as:

```text
from: e2
to: e4
```

The protected backend verifies authentication, player identity, color, turn, clock state, move legality, and current game state before committing an online move.

That means the browser cannot simply tell the database that it won.

---

## 🛡️ Privacy, Safety & Compliance

Chess Arena includes practical launch safeguards rather than claiming legal certification:

- Privacy Policy and Terms of Service
- Cookie & browser-storage disclosure
- first-use privacy/storage notice
- explicit signup agreement to Terms + Privacy
- 13+ account confirmation without collecting a full date of birth
- no paid checkout or hidden-fee flow in the current release
- account/data deletion from Settings
- accessibility statement, skip links, visible keyboard focus, and reduced-motion controls
- third-party dependency/license documentation
- report/block/moderation tooling

See **[COMPLIANCE.md](COMPLIANCE.md)** for the 20-point product checklist and **[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)** for core dependency/license notes.

> These controls improve the product's privacy/safety posture but are not a guarantee of compliance with every law or jurisdiction.

---

## 🔐 Security

Chess Arena v2 uses multiple layers of protection:

- Supabase Authentication
- Row Level Security
- restricted database grants
- protected Edge Functions
- server-authoritative online moves
- server-authoritative online clocks
- protected ratings and statistics
- protected owner/admin operations
- state-version checks against stale move requests
- Netlify security headers
- Content Security Policy
- GitHub Actions verification

Normal players cannot directly promote themselves to owner, edit ratings, modify ban state, or rewrite authoritative online games.

The owner identity is configured server-side and is intentionally **not stored in this repository**.

See **[SECURITY.md](SECURITY.md)** for more information.

---

## 🧠 Game Integrity

For online games, **the backend—not the browser—decides the result**.

The `chess-game` Edge Function validates:

1. authentication
2. game membership
3. player color
4. current turn
5. remaining clock time
6. legal chess movement
7. current state version
8. checkmate/draw/timeout state
9. final result persistence

Completed rated games are saved before Elo/stat updates are applied.

Bot/local games are also replay-validated before being accepted into saved history.

---

## 🧪 Quality Checks

Every major change can be verified with:

```bash
npm test
npm run typecheck
npm run build
```

GitHub Actions runs the release checks for pushes and pull requests targeting `main`.

---

## 🛠️ Tech Stack

### Frontend

- React
- TypeScript
- Vite
- chess.js
- Lucide icons

### Backend

- Supabase Auth
- Supabase Postgres
- Supabase Realtime
- Supabase Row Level Security
- Supabase Edge Functions

### Hosting & CI

- Netlify
- GitHub
- GitHub Actions

---

## 🚀 Local Development

### Requirements

- Node.js 20+
- npm
- Supabase project

### Clone

```bash
git clone https://github.com/dvilrgamerz/chess.git
cd chess
npm ci
npm run dev
```

The Vite development server is the official v2 frontend runtime.

### Environment Variables

Copy:

```bash
cp .env.example .env.local
```

Then configure:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

> Only use a **publishable Supabase key** in frontend `VITE_*` variables. Never expose a Supabase secret/service-role key in browser code.

---

## 🗄️ Supabase Setup

Database schema:

```text
supabase/schema.sql
```

Protected Edge Functions:

```text
supabase/functions/chess-game/
supabase/functions/chess-admin/
```

The v2 database includes support for:

- profiles
- games
- online games
- matchmaking
- puzzle progress
- reports
- announcements
- audit logs

For a fresh environment, apply the schema, deploy both Edge Functions, and configure the intended owner account server-side.

---

## 🌐 Netlify Deployment

The included `netlify.toml` uses:

**Build command**

```text
npm run build
```

**Publish directory**

```text
dist/client
```

It also includes SPA routing, asset caching, HSTS, clickjacking protection, MIME sniffing protection, permission restrictions, and a Supabase-compatible Content Security Policy.

### Production

**Branch:** `main`

**Live URL:** [chess-arena-v2.netlify.app](https://chess-arena-v2.netlify.app)

---

## 📁 Project Structure

```text
chess/
├── src/
│   ├── components/       React UI
│   └── lib/              Supabase client, browser services, workers
│
├── shared/               shared chess and TypeScript models
├── tests/                Vitest test suite
│
├── supabase/
│   ├── schema.sql
│   └── functions/
│       ├── chess-game/   authoritative multiplayer backend
│       └── chess-admin/  ratings, history and administration
│
├── server/               legacy v1 server reference
├── .github/workflows/    CI
├── netlify.toml          production deployment config
├── SECURITY.md
└── README.md
```

> The `server/` folder remains for legacy/reference purposes. Production v2 does not rely on it.

---

## 🧭 v2 Status

Chess Arena v2 focuses on:

- persistent multiplayer
- Supabase-first production architecture
- secure authentication
- authoritative move validation
- synchronized clocks
- reliable matchmaking
- stronger owner authorization
- safer database permissions
- cleaner deployment
- automated CI verification

---

## 🤝 Contributing

Ideas, bug reports, testing feedback, and improvements are welcome.

1. Create a branch
2. Make your changes
3. Run tests/typecheck/build
4. Open a pull request
5. Keep production changes reviewable and secure

---

## 🔗 Links

- 🎮 **Live App:** [chess-arena-v2.netlify.app](https://chess-arena-v2.netlify.app)
- 💻 **Repository:** [github.com/dvilrgamerz/chess](https://github.com/dvilrgamerz/chess)
- 🐛 **Issues:** [GitHub Issues](https://github.com/dvilrgamerz/chess/issues)
- 🔐 **Security:** [SECURITY.md](SECURITY.md)
- 🛡️ **Compliance checklist:** [COMPLIANCE.md](COMPLIANCE.md)
- 📜 **Third-party notices:** [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

---

<p align="center">
  <strong>♟️ Chess Arena v2</strong><br />
  Play • Improve • Compete
</p>

<p align="center">
  Built as an evolving chess platform for learning, competition, and chess AI experimentation.
</p>
