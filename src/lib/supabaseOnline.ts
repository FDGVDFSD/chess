import { Chess } from "chess.js";
import type { GameSnapshot, PublicUser, Side, TimeControl } from "../../shared/types.js";
import { supabase, isSupabaseConfigured } from "./supabase.js";

type GameAction =
  | "resign"
  | "draw_offer"
  | "draw_accept"
  | "rematch"
  | "flag_timeout";

async function invokeGame<T>(body: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke("chess-game", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export function mapOnlineRowToSnapshot(row: any): GameSnapshot {
  const chess = new Chess(row.fen);
  return {
    id: row.id,
    mode: row.mode ?? "friend",
    roomCode: row.room_code ?? undefined,
    timeControl: row.time_control ?? undefined,
    whiteTimeRemainingMs: row.white_ms_remaining ?? undefined,
    blackTimeRemainingMs: row.black_ms_remaining ?? undefined,
    turnStartedAt: row.turn_started_at ?? undefined,
    status: row.status,
    fen: row.fen,
    turn: row.turn ?? (chess.turn() === "w" ? "white" : "black"),
    players: {
      white: row.white_user_id
        ? {
            id: row.white_user_id,
            username: row.white_username ?? "White",
            role: row.white_role === "owner" ? "owner" : "user",
            kind: "human",
            rating: row.white_rating ?? undefined,
            connected: true
          }
        : undefined,
      black: row.black_user_id
        ? {
            id: row.black_user_id,
            username: row.black_username ?? "Black",
            role: row.black_role === "owner" ? "owner" : "user",
            kind: "human",
            rating: row.black_rating ?? undefined,
            connected: true
          }
        : undefined
    },
    moves: row.moves ?? [],
    lastMove: row.last_move ?? undefined,
    isCheck: chess.inCheck(),
    result: row.result ?? undefined,
    reason: row.reason ?? undefined,
    startedAt: row.started_at ?? row.created_at ?? new Date().toISOString(),
    endedAt: row.ended_at ?? undefined,
    drawOfferFrom: row.draw_offer_from ?? undefined
  };
}

export async function createFriendRoomSupabase(
  _user: PublicUser,
  preferredColor: Side,
  timeControl: TimeControl
): Promise<{ roomCode: string; gameId: string; playerColor: Side; snapshot: GameSnapshot }> {
  const data = await invokeGame<{ game: any; playerColor: Side }>({
    action: "create_friend",
    preferredColor,
    timeControl
  });
  const snapshot = mapOnlineRowToSnapshot(data.game);
  return {
    roomCode: snapshot.roomCode ?? "",
    gameId: snapshot.id,
    playerColor: data.playerColor,
    snapshot
  };
}

export async function joinFriendRoomSupabase(
  _user: PublicUser,
  roomCode: string
): Promise<{ gameId: string; playerColor: Side; snapshot: GameSnapshot }> {
  const data = await invokeGame<{ game: any; playerColor: Side }>({
    action: "join_friend",
    roomCode: roomCode.trim().toUpperCase()
  });
  return {
    gameId: data.game.id,
    playerColor: data.playerColor,
    snapshot: mapOnlineRowToSnapshot(data.game)
  };
}

export async function joinRandomMatchSupabase(
  rating: number,
  preferredColor: Side,
  timeControl: TimeControl
): Promise<{ queued: boolean; gameId?: string; playerColor?: Side; snapshot?: GameSnapshot }> {
  const data = await invokeGame<{ queued: boolean; game?: any; playerColor?: Side }>({
    action: "random_join",
    rating,
    preferredColor,
    timeControl
  });

  return {
    queued: data.queued,
    gameId: data.game?.id,
    playerColor: data.playerColor,
    snapshot: data.game ? mapOnlineRowToSnapshot(data.game) : undefined
  };
}

export async function syncRandomMatchSupabase() {
  const data = await invokeGame<{ queued: boolean; game?: any; playerColor?: Side }>({
    action: "random_sync"
  });
  return {
    queued: data.queued,
    gameId: data.game?.id,
    playerColor: data.playerColor,
    snapshot: data.game ? mapOnlineRowToSnapshot(data.game) : undefined
  };
}

export async function leaveRandomQueueSupabase() {
  return invokeGame<{ ok: true }>({ action: "random_leave" });
}

export async function syncOnlineGameSupabase(gameId: string) {
  const data = await invokeGame<{ game: any; playerColor: Side }>({
    action: "sync_game",
    gameId
  });
  return {
    playerColor: data.playerColor,
    snapshot: mapOnlineRowToSnapshot(data.game)
  };
}

export async function submitOnlineMoveSupabase(
  gameId: string,
  from: string,
  to: string,
  promotion = "q"
): Promise<GameSnapshot> {
  const data = await invokeGame<{ game: any }>({
    action: "move",
    gameId,
    from,
    to,
    promotion
  });
  return mapOnlineRowToSnapshot(data.game);
}

export async function onlineGameActionSupabase(
  action: GameAction,
  gameId: string
): Promise<{ snapshot: GameSnapshot; gameId?: string; playerColor?: Side }> {
  const data = await invokeGame<{ game: any; gameId?: string; playerColor?: Side }>({
    action,
    gameId
  });
  return {
    snapshot: mapOnlineRowToSnapshot(data.game),
    gameId: data.gameId,
    playerColor: data.playerColor
  };
}

export function subscribeToOnlineGameRealtime(
  gameId: string,
  onSnapshot: (snapshot: GameSnapshot) => void,
  onStatus?: (status: string) => void
) {
  if (!isSupabaseConfigured) return () => {};

  const channel = supabase
    .channel(`online-game:${gameId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "online_games",
        filter: `id=eq.${gameId}`
      },
      (payload) => {
        onSnapshot(mapOnlineRowToSnapshot(payload.new));
      }
    )
    .subscribe((status) => onStatus?.(status));

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToMatchmaking(
  userId: string,
  onMatched: () => void
) {
  if (!isSupabaseConfigured) return () => {};

  const channel = supabase
    .channel(`matchmaking:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "matchmaking_queue",
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        if (payload.new?.matched_game_id) onMatched();
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
