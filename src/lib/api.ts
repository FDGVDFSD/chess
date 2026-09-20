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

const tokenKey = "chess-arena-token";
const apiBase = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function getApiBaseUrl() { return apiBase; }
export function getToken() { return sessionStorage.getItem(tokenKey); }
export function setToken(token: string | null) { if (token) sessionStorage.setItem(tokenKey, token); else sessionStorage.removeItem(tokenKey); }

export async function signup(email: string, password: string, username: string, birthYear?: number) {
  return request<AuthResponse>("/api/signup", { method: "POST", body: JSON.stringify({ email, password, username, birthYear }) });
}
export async function login(loginName: string, password: string) {
  return request<AuthResponse>("/api/login", { method: "POST", body: JSON.stringify({ login: loginName, password }) });
}
export async function currentSession() { return request<{ user: PublicUser }>("/api/session"); }
export async function logout() { await request<{ ok: true }>("/api/logout", { method: "POST" }); setToken(null); }
export async function deleteAccount() { const result = await request<{ ok: true }>("/api/account/delete", { method: "POST" }); setToken(null); return result; }
export async function reportPlayer(target: string, reason: string, details?: string) { return request<{ ok: true }>("/api/report", { method: "POST", body: JSON.stringify({ target, reason, details }) }); }
export async function blockPlayer(targetUsername: string) { return request<{ user: PublicUser }>("/api/block", { method: "POST", body: JSON.stringify({ targetUsername }) }); }
export async function getLeaderboard() { return request<{ rows: LeaderboardRow[] }>("/api/leaderboard"); }
export async function getHistory() { return request<{ games: GameRecord[] }>("/api/history"); }
export async function updateSettings(settings: Partial<UserSettings>) { return request<{ user: PublicUser }>("/api/settings", { method: "PATCH", body: JSON.stringify({ settings }) }); }
export async function saveGame(game: GameRecord) { return request<{ game: GameRecord }>("/api/games", { method: "POST", body: JSON.stringify({ game }) }); }
export async function getAnnouncements() { return request<{ announcements: Announcement[] }>("/api/announcements"); }
export async function submitPuzzleSolve(success = true) { return request<{ user: PublicUser }>("/api/puzzle/solve", { method: "POST", body: JSON.stringify({ success }) }); }
export async function verifyOwnerPassword(password: string) { return request<{ ok: true }>("/api/admin/verify-owner", { method: "POST", body: JSON.stringify({ password }) }); }
export async function getAdminUsers() { return request<{ users: PublicUser[] }>("/api/admin/users"); }
export async function banUser(userId: string, isBanned: boolean, banReason?: string) { return request<{ user: PublicUser }>("/api/admin/users/ban", { method: "POST", body: JSON.stringify({ userId, isBanned, banReason }) }); }
export async function setUserRatingAdmin(userId: string, rating: number) { return request<{ user: PublicUser }>("/api/admin/users/rating", { method: "POST", body: JSON.stringify({ userId, rating }) }); }
export async function deleteUserAdmin(userId: string) { return request<{ ok: true }>(`/api/admin/users/${userId}`, { method: "DELETE" }); }
export async function getAdminReports() { return request<{ reports: ReportItem[] }>("/api/admin/reports"); }
export async function updateReportStatus(reportId: string, status: "resolved" | "dismissed") { return request<{ ok: true }>("/api/admin/reports/status", { method: "POST", body: JSON.stringify({ reportId, status }) }); }
export async function getAdminAnalytics() { return request<{ analytics: SystemAnalytics }>("/api/admin/analytics"); }
export async function getAuditLogs() { return request<{ auditLogs: AuditLog[] }>("/api/admin/audit-logs"); }
export async function createAnnouncement(title: string, content: string) { return request<{ announcement: Announcement }>("/api/admin/announcements", { method: "POST", body: JSON.stringify({ title, content }) }); }

export type OnlineGame = {
  id: string; code: string | null; status: "waiting" | "active" | "finished" | "cancelled"; mode: "random" | "friend";
  white_player: string; black_player: string | null; turn: "white" | "black"; fen: string; move_number: number;
  result: string | null; created_at: string; started_at: string | null; ended_at: string | null;
};

async function supabaseRequest<T>(path: string, body?: unknown): Promise<T> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/${path}`;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const token = getToken();
  const response = await fetch(url, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error((payload as { message?: string; hint?: string } | null)?.message ?? "Online request failed.");
  return payload as T;
}

export async function joinRandomMatch(rating = 1000) { return supabaseRequest<OnlineGame | null>("join_random_match", { p_rating: rating }); }
export async function createFriendGame() { return supabaseRequest<OnlineGame>("create_friend_game"); }
export async function joinFriendGame(code: string) { return supabaseRequest<OnlineGame>("join_friend_game", { p_code: code }); }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers); headers.set("Content-Type", "application/json");
  const token = getToken(); if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBase}${path}`, { ...init, headers, credentials: "include" });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 401) { setToken(null); window.dispatchEvent(new CustomEvent("chess-arena:logout")); }
  if (!response.ok) throw new Error(payload.error ?? "Request failed."); return payload;
}
