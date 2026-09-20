# Chess Arena Security

Chess Arena v2 uses a static Vite frontend with Supabase Auth, Postgres, Realtime, Row Level Security, and protected Edge Functions.

## Trust boundaries

The browser is never trusted to decide authorization, owner status, online game legality, ratings, bans, or authoritative multiplayer state.

Online moves are submitted as a requested source square, destination square, and promotion. The `chess-game` Edge Function authenticates the caller, verifies that the caller belongs to the game and owns the current turn, validates the move with chess.js, computes the clock, and commits the next state.

Owner and moderation actions run through `chess-admin`, which authenticates the caller and checks the owner role server-side before using privileged database access.

## Secrets

Never commit Supabase secret/service-role keys, passwords, database credentials, or local `.env` files.

The frontend may receive only a Supabase **publishable key**. Publishable keys are expected to be visible in browser applications and rely on RLS for data protection.

Edge Functions read their server-side secret key from the Supabase-managed function environment.

## Row Level Security

Every browser-accessible table must have RLS enabled and policies limited to the minimum required rows. Column grants additionally prevent users from changing sensitive profile fields such as role, rating, ban state, or account statistics.

Legacy `arena.*` tables are retained for compatibility but browser roles are explicitly denied.

## Authentication

Use Supabase Auth for account creation, login, session refresh, and logout. Owner identity is configured server-side; email, username, or user metadata alone must never grant owner privileges.

For production, enable Supabase Auth leaked-password protection and use a strong password policy.

## Deployment

The production frontend can be hosted on Netlify. A persistent Express/Socket.IO server is not required for v2.

Netlify security headers include HSTS, frame denial, MIME sniffing protection, a restrictive Permissions Policy, and a Content Security Policy that permits the configured Supabase HTTPS and Realtime WebSocket endpoints.

## Security reporting

Do not publish credentials, access tokens, database secrets, or detailed exploit instructions in a public issue. Revoke or rotate exposed credentials first, then use GitHub private security reporting when available.
