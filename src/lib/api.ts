import type {
  Announcement,
  AuditLog,
  AuthResponse,
  GameRecord,
  LeaderboardRow,
  PublicUser,
  ReportItem,
  SystemAnalytics,
  UserSettings
} from "../../shared/types.js";
import { supabase } from "./supabase.js";

const tokenKey = "chess-arena-token";

const defaultSettings: UserSettings = {
  boardTheme: "emerald",
  pieceStyle: "classic",
  soundEnabled: true,
  soundVolume: 0.7,
  legalHints: true,
  autoFlip: false,
  reducedMotion: false,
  animationSpeed: 180,
  botDelayMs: 500,
  jarvisEnabled: false
};

export function getApiBaseUrl() {
  return "";
}

export function getToken() {
  return sessionStorage.getItem(tokenKey);
}

export function setToken(token: string | null) {
  if (token) sessionStorage.setItem(tokenKey, token);
  else sessionStorage.removeItem(tokenKey);
}

function profileToUser(profile: any, email = ""): PublicUser {
  const rating = Number(profile.rating ?? 1000);
  const settings = { ...defaultSettings, ...(profile.settings ?? {}) };
  const role = profile.role === "owner" ? "owner" : "user";
  if (role !== "owner") settings.jarvisEnabled = false;

  return {
    id: profile.id,
    email: profile.email ?? email,
    username: profile.username ?? "Player",
    role,
    rating,
    formatRatings: profile.format_ratings ?? { bullet: rating, blitz: rating, rapid: rating },
    puzzleRating: Number(profile.puzzle_rating ?? 1200),
    bestRating: Number(profile.best_rating ?? rating),
    streak: Number(profile.streak ?? 1),
    xp: Number(profile.xp ?? 0),
    level: Number(profile.level ?? 1),
    isBanned: Boolean(profile.is_banned),
    banReason: profile.ban_reason ?? undefined,
    birthYear: profile.birth_year ?? undefined,
    dailyChallenge: profile.daily_challenge ?? {
      target: 2,
      completed: 0,
      lastDate: new Date().toISOString().slice(0, 10)
    },
    blockedUsers: profile.blocked_users ?? [],
    wins: Number(profile.wins ?? 0),
    losses: Number(profile.losses ?? 0),
    draws: Number(profile.draws ?? 0),
    createdAt: profile.created_at ?? new Date().toISOString(),
    settings
  };
}

async function getOwnProfile(userId: string, email = "") {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) throw new Error(error.message);
  return profileToUser(data, email);
}

async function getAuthUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not signed in.");
  return data.user;
}

export async function signup(
  email: string,
  password: string,
  username: string
): Promise<AuthResponse> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = username.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(cleanEmail)) {
    throw new Error("Enter a valid email address.");
  }
  if (!/^[a-zA-Z0-9_ ]{3,18}$/.test(cleanUsername)) {
    throw new Error("Username must be 3-18 letters, numbers, spaces, or underscores.");
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        username: cleanUsername,
        age_13_plus_confirmed: true,
        terms_accepted: true,
        privacy_accepted: true,
        policy_version: "2026-09-19"
      }
    }
  });

  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Could not create your account.");
  if (!data.session) {
    throw new Error("Account created. Check your email to confirm it, then log in.");
  }

  setToken(data.session.access_token);
  const user = await getOwnProfile(data.user.id, data.user.email ?? cleanEmail);
  return { token: data.session.access_token, user };
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail.includes("@")) {
    throw new Error("For v2, sign in with your email address.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password
  });

  if (error || !data.user || !data.session) {
    throw new Error(error?.message ?? "Email or password is incorrect.");
  }

  const user = await getOwnProfile(data.user.id, data.user.email ?? cleanEmail);
  if (user.isBanned) {
    await supabase.auth.signOut();
    setToken(null);
    throw new Error(`Your account has been suspended: ${user.banReason ?? "Violation of platform rules."}`);
  }

  setToken(data.session.access_token);
  return { token: data.session.access_token, user };
}

export async function currentSession() {
  const authUser = await getAuthUser();
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.access_token) setToken(sessionData.session.access_token);

  const user = await getOwnProfile(authUser.id, authUser.email ?? "");
  void supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", authUser.id);
  if (user.isBanned) {
    await logout();
    throw new Error("This account is suspended.");
  }
  return { user };
}

export async function logout() {
  await supabase.auth.signOut();
  setToken(null);
  window.dispatchEvent(new CustomEvent("chess-arena:logout"));
  return { ok: true as const };
}

export async function initializePasswordRecoverySession() {
  const url = new URL(window.location.href);
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

  const code = query.get("code");
  const tokenHash = query.get("token_hash");
  const queryType = query.get("type");
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const hashType = hash.get("type");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new Error(error.message);
  } else if (accessToken && refreshToken && hashType === "recovery") {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (error) throw new Error(error.message);
  } else if (tokenHash && queryType === "recovery") {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery"
    } as any);
    if (error) throw new Error(error.message);
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session) {
    throw new Error("This password-reset link is invalid, expired, or has already been used. Request a new reset email.");
  }

  setToken(data.session.access_token);
  return { session: data.session };
}

export async function requestPasswordReset(email: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(cleanEmail)) {
    throw new Error("Enter a valid email address.");
  }

  const redirectTo = `${window.location.origin}/reset-password?recovery=1`;
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo
  });

  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export async function updateRecoveredPassword(password: string) {
  if (password.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }

  await initializePasswordRecoverySession();

  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);

  await supabase.auth.signOut();
  setToken(null);
  return { ok: true as const };
}

async function invokeSecure<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("chess-admin", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export async function deleteAccount() {
  const result = await invokeSecure<{ ok: true }>({ action: "delete_self" });
  await supabase.auth.signOut();
  setToken(null);
  return result;
}

export async function reportPlayer(target: string, reason: string, details?: string) {
  const authUser = await getAuthUser();
  const me = await getOwnProfile(authUser.id, authUser.email ?? "");

  const { error } = await supabase.from("reports").insert({
    reporter_user_id: authUser.id,
    reporter_username: me.username,
    target: target.trim(),
    reason: reason.trim(),
    details: details?.trim() || null
  });

  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export async function blockPlayer(targetUsername: string) {
  const authUser = await getAuthUser();
  const user = await getOwnProfile(authUser.id, authUser.email ?? "");
  const current = user.blockedUsers ?? [];
  const key = targetUsername.trim().toLowerCase();
  const exists = current.some((name) => name.toLowerCase() === key);
  const blockedUsers = exists
    ? current.filter((name) => name.toLowerCase() !== key)
    : [...current, targetUsername.trim()];

  const { data, error } = await supabase
    .from("profiles")
    .update({ blocked_users: blockedUsers, updated_at: new Date().toISOString() })
    .eq("id", authUser.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return { user: profileToUser(data, authUser.email ?? "") };
}

export async function getLeaderboard() {
  return invokeSecure<{ rows: LeaderboardRow[] }>({ action: "leaderboard" });
}

function rowToGame(row: any): GameRecord {
  return {
    id: row.id,
    mode: row.mode,
    timeControl: row.time_control ?? undefined,
    players: {
      white: {
        id: row.white_user_id ?? undefined,
        username: row.white_username,
        role: row.white_role ?? undefined,
        kind: row.white_user_id ? "human" : "bot",
        rating: row.white_rating ?? undefined
      },
      black: {
        id: row.black_user_id ?? undefined,
        username: row.black_username,
        role: row.black_role ?? undefined,
        kind: row.black_user_id ? "human" : "bot",
        rating: row.black_rating ?? undefined
      }
    },
    result: row.result,
    reason: row.reason,
    moves: row.moves ?? [],
    finalFen: row.final_fen,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: Number(row.duration_ms ?? 0)
  };
}

export async function getHistory() {
  const authUser = await getAuthUser();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .or(`white_user_id.eq.${authUser.id},black_user_id.eq.${authUser.id}`)
    .order("ended_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return { games: (data ?? []).map(rowToGame) };
}

export async function updateSettings(settings: Partial<UserSettings>) {
  const authUser = await getAuthUser();
  const current = await getOwnProfile(authUser.id, authUser.email ?? "");

  const safe: UserSettings = {
    ...current.settings,
    ...settings,
    soundVolume: Math.min(1, Math.max(0, Number(settings.soundVolume ?? current.settings.soundVolume))),
    animationSpeed: Math.min(1000, Math.max(50, Number(settings.animationSpeed ?? current.settings.animationSpeed))),
    botDelayMs: Math.min(5000, Math.max(0, Number(settings.botDelayMs ?? current.settings.botDelayMs))),
    jarvisEnabled: current.role === "owner" ? Boolean(settings.jarvisEnabled ?? current.settings.jarvisEnabled) : false
  };

  const { data, error } = await supabase
    .from("profiles")
    .update({ settings: safe, updated_at: new Date().toISOString() })
    .eq("id", authUser.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return { user: profileToUser(data, authUser.email ?? "") };
}

export async function saveGame(game: GameRecord) {
  return invokeSecure<{ game: GameRecord }>({ action: "save_game", game });
}

export async function getAnnouncements() {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);

  const announcements: Announcement[] = (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    active: Boolean(row.active),
    createdAt: row.created_at
  }));

  return { announcements };
}

export async function submitPuzzleSolve(success = true) {
  const authUser = await getAuthUser();
  const data = await invokeSecure<{ user: any }>({
    action: "puzzle_result",
    success
  });
  return { user: profileToUser(data.user, authUser.email ?? "") };
}

export async function verifyOwnerPassword(password: string) {
  const authUser = await getAuthUser();
  if (!authUser.email) throw new Error("Owner email is unavailable.");

  const { error } = await supabase.auth.signInWithPassword({
    email: authUser.email,
    password
  });
  if (error) throw new Error("Owner verification password is incorrect.");

  const user = await getOwnProfile(authUser.id, authUser.email);
  if (user.role !== "owner") throw new Error("Owner privileges are required.");
  return { ok: true as const };
}

export async function getAdminUsers() {
  const data = await invokeSecure<{ users: any[] }>({ action: "list_users" });
  return { users: data.users.map((row) => profileToUser(row, row.email ?? "")) };
}

export async function banUser(userId: string, isBanned: boolean, banReason?: string) {
  const data = await invokeSecure<{ user: any }>({
    action: "ban_user",
    userId,
    isBanned,
    banReason
  });
  return { user: profileToUser(data.user, data.user.email ?? "") };
}

export async function setUserRatingAdmin(userId: string, rating: number) {
  const data = await invokeSecure<{ user: any }>({
    action: "set_rating",
    userId,
    rating
  });
  return { user: profileToUser(data.user, data.user.email ?? "") };
}

export async function deleteUserAdmin(userId: string) {
  return invokeSecure<{ ok: true }>({ action: "delete_user", userId });
}

export async function getAdminReports() {
  const data = await invokeSecure<{ reports: any[] }>({ action: "list_reports" });
  const reports: ReportItem[] = data.reports.map((row) => ({
    id: row.id,
    reporterUserId: row.reporter_user_id,
    reporterUsername: row.reporter_username,
    target: row.target,
    reason: row.reason,
    details: row.details ?? undefined,
    status: row.status,
    createdAt: row.created_at
  }));
  return { reports };
}

export async function updateReportStatus(reportId: string, status: "resolved" | "dismissed") {
  return invokeSecure<{ ok: true }>({ action: "update_report", reportId, status });
}

export async function getAdminAnalytics() {
  return invokeSecure<{ analytics: SystemAnalytics }>({ action: "analytics" });
}

export async function getAuditLogs() {
  const data = await invokeSecure<{ auditLogs: any[] }>({ action: "audit_logs" });
  const auditLogs: AuditLog[] = data.auditLogs.map((row) => ({
    id: row.id,
    adminUsername: row.admin_username,
    action: row.action,
    target: row.target ?? undefined,
    reason: row.reason ?? undefined,
    timestamp: row.created_at
  }));
  return { auditLogs };
}

export async function createAnnouncement(title: string, content: string) {
  const data = await invokeSecure<{ announcement: any }>({
    action: "create_announcement",
    title,
    content
  });

  return {
    announcement: {
      id: data.announcement.id,
      title: data.announcement.title,
      content: data.announcement.content,
      active: Boolean(data.announcement.active),
      createdAt: data.announcement.created_at
    } as Announcement
  };
}
