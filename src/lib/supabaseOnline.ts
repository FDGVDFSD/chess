import { supabase, isSupabaseConfigured } from "./supabase.js";
import type { GameSnapshot, PlayerSeat, PublicUser, Side, TimeControl } from "../../shared/types.js";
import { Chess } from "chess.js";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function createFriendRoomSupabase(
  user: PublicUser,
  preferredColor: Side,
  timeControl: TimeControl
): Promise<{ roomCode: string; gameId: string; playerColor: Side }> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured yet. Using local fallback.");
  }

  const roomCode = generateCode();
  const playerColor = preferredColor === "black" ? "black" : "white";

  const { data, error } = await supabase
    .from("online_games")
    .insert({
      room_code: roomCode,
      mode: "friend",
      [playerColor === "white" ? "white_user_id" : "black_user_id"]: user.id,
      [playerColor === "white" ? "white_username" : "black_username"]: user.username,
      [playerColor === "white" ? "black_username" : "white_username"]: "Waiting for player...",
      time_control: timeControl,
      status: "waiting"
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { roomCode, gameId: data.id, playerColor };
}

export async function joinFriendRoomSupabase(
  user: PublicUser,
  roomCode: string
): Promise<{ gameId: string; playerColor: Side; snapshot: GameSnapshot }> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured yet.");
  }

  const cleanCode = roomCode.trim().toUpperCase();
  const { data: game, error: fetchErr } = await supabase
    .from("online_games")
    .select("*")
    .eq("room_code", cleanCode)
    .single();

  if (fetchErr || !game) throw new Error("Room code not found.");
  if (game.status === "complete") throw new Error("This game has already ended.");

  let playerColor: Side = "black";
  const updates: Record<string, any> = { status: "active" };

  if (!game.white_user_id && game.black_user_id !== user.id) {
    playerColor = "white";
    updates.white_user_id = user.id;
    updates.white_username = user.username;
  } else if (!game.black_user_id && game.white_user_id !== user.id) {
    playerColor = "black";
    updates.black_user_id = user.id;
    updates.black_username = user.username;
  } else {
    playerColor = game.white_user_id === user.id ? "white" : "black";
  }

  const { data: updatedGame, error: updateErr } = await supabase
    .from("online_games")
    .update(updates)
    .eq("id", game.id)
    .select()
    .single();

  if (updateErr) throw new Error(updateErr.message);

  const snapshot = mapRowToSnapshot(updatedGame);
  return { gameId: updatedGame.id, playerColor, snapshot };
}

export async function submitOnlineMoveSupabase(
  gameId: string,
  fen: string,
  moveSan: string,
  from: string,
  to: string
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const chess = new Chess(fen);
  const nextTurn = chess.turn() === "w" ? "white" : "black";
  const status = chess.isGameOver() ? "complete" : "active";

  let result: string | null = null;
  let reason: string | null = null;

  if (chess.isCheckmate()) {
    result = chess.turn() === "w" ? "black" : "white";
    reason = "checkmate";
  } else if (chess.isDraw() || chess.isStalemate()) {
    result = "draw";
    reason = "stalemate";
  }

  const { data: existing } = await supabase.from("online_games").select("moves").eq("id", gameId).single();
  const currentMoves = existing?.moves ?? [];

  const { error } = await supabase
    .from("online_games")
    .update({
      fen,
      moves: [...currentMoves, moveSan],
      turn: nextTurn,
      status,
      result,
      reason,
      updated_at: new Date().toISOString()
    })
    .eq("id", gameId);

  if (error) throw new Error(error.message);
}

export function subscribeToOnlineGameRealtime(
  gameId: string,
  onSnapshot: (snapshot: GameSnapshot) => void
) {
  if (!isSupabaseConfigured) return () => {};

  const channel = supabase
    .channel(`game:${gameId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "online_games",
        filter: `id=eq.${gameId}`
      },
      (payload) => {
        const snapshot = mapRowToSnapshot(payload.new);
        onSnapshot(snapshot);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

function mapRowToSnapshot(row: any): GameSnapshot {
  const moves = row.moves ?? [];
  let lastMove: { from: string; to: string } | undefined = undefined;

  return {
    id: row.id,
    mode: row.mode ?? "friend",
    roomCode: row.room_code,
    status: row.status,
    fen: row.fen,
    turn: row.turn ?? "white",
    moves,
    lastMove,
    isCheck: false,
    startedAt: row.created_at ?? new Date().toISOString(),
    players: {
      white: { username: row.white_username ?? "White", kind: "human" },
      black: { username: row.black_username ?? "Black", kind: "human" }
    },
    result: row.result,
    reason: row.reason,
    timeControl: row.time_control
  };
}
