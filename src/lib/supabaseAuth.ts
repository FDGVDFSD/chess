import { supabase, isSupabaseConfigured } from "./supabase.js";
import type { PublicUser } from "../../shared/types.js";

export async function signUpSupabase(email: string, password: string, username: string) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username }
    }
  });

  if (authError) throw new Error(authError.message);
  if (!authData.user) throw new Error("Could not create account.");

  const isOwner = email.trim().toLowerCase() === "jp3005791@gmail.com" || username.trim().toLowerCase() === "jenil p";
  const role = isOwner ? "owner" : "user";

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .insert({
      id: authData.user.id,
      email,
      username,
      role,
      rating: 1000,
      puzzle_rating: 1200
    })
    .select()
    .single();

  if (profileErr) {
    // Return basic user info if insert deferred
    return {
      user: {
        id: authData.user.id,
        email,
        username,
        role,
        rating: 1000,
        settings: {
          soundEnabled: true,
          soundVolume: 0.8,
          boardTheme: "emerald",
          pieceStyle: "classic",
          animationSpeed: 180,
          legalHints: true,
          autoFlip: false,
          reducedMotion: false,
          jarvisEnabled: isOwner,
          botDelayMs: 400
        }
      } as PublicUser
    };
  }

  return { user: mapProfileToPublicUser(profile) };
}

export async function signInSupabase(emailOrUsername: string, password: string) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const email = emailOrUsername.includes("@") ? emailOrUsername : `${emailOrUsername.toLowerCase()}@chessarena.local`;
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError) throw new Error(authError.message);

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    const isOwner = authData.user.email === "jp3005791@gmail.com";
    return {
      user: {
        id: authData.user.id,
        email: authData.user.email ?? email,
        username: authData.user.user_metadata?.username ?? "Player",
        role: isOwner ? "owner" : "user",
        rating: 1000,
        settings: {
          soundEnabled: true,
          soundVolume: 0.8,
          boardTheme: "emerald",
          pieceStyle: "classic",
          animationSpeed: 180,
          legalHints: true,
          autoFlip: false,
          reducedMotion: false,
          jarvisEnabled: isOwner,
          botDelayMs: 400
        }
      } as PublicUser
    };
  }

  return { user: mapProfileToPublicUser(profile) };
}

export async function signOutSupabase() {
  if (isSupabaseConfigured) {
    await supabase.auth.signOut();
  }
}

function mapProfileToPublicUser(profile: any): PublicUser {
  const isOwner = profile.email === "jp3005791@gmail.com" || profile.role === "owner";
  return {
    id: profile.id,
    email: profile.email,
    username: profile.username,
    role: isOwner ? "owner" : "user",
    rating: profile.rating ?? 1000,
    formatRatings: profile.format_ratings ?? { bullet: 1000, blitz: 1000, rapid: 1000 },
    puzzleRating: profile.puzzle_rating ?? 1200,
    bestRating: profile.best_rating ?? 1000,
    streak: profile.streak ?? 1,
    xp: profile.xp ?? 0,
    level: profile.level ?? 1,
    dailyChallenge: { target: 2, completed: 0, lastDate: new Date().toISOString().split("T")[0] },
    wins: profile.wins ?? 0,
    losses: profile.losses ?? 0,
    draws: profile.draws ?? 0,
    createdAt: profile.created_at ?? new Date().toISOString(),
    settings: {
      soundEnabled: true,
      soundVolume: 0.8,
      boardTheme: "emerald",
      pieceStyle: "classic",
      animationSpeed: 180,
      legalHints: true,
      autoFlip: false,
      reducedMotion: false,
      jarvisEnabled: isOwner,
      botDelayMs: 400
    }
  };
}
