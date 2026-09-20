import { createClient } from "npm:@supabase/supabase-js@2";
import { Chess } from "npm:chess.js@1.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TIME_CONTROLS: Record<string, any> = {
  "bullet-1": { id: "bullet-1", name: "1+0 Bullet", category: "bullet", initialSec: 60, incSec: 0 },
  "blitz-3": { id: "blitz-3", name: "3+0 Blitz", category: "blitz", initialSec: 180, incSec: 0 },
  "blitz-5": { id: "blitz-5", name: "5+0 Blitz", category: "blitz", initialSec: 300, incSec: 0 },
  "rapid-10": { id: "rapid-10", name: "10+0 Rapid", category: "rapid", initialSec: 600, incSec: 0 }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function envKey(jsonName: string, legacyName: string) {
  const packed = Deno.env.get(jsonName);
  if (packed) {
    try {
      const parsed = JSON.parse(packed);
      if (parsed?.default) return String(parsed.default);
    } catch {
      // Fall through to legacy key.
    }
  }
  return Deno.env.get(legacyName) ?? "";
}

function cleanTimeControl(input: any) {
  const id = typeof input?.id === "string" ? input.id : "blitz-5";
  return TIME_CONTROLS[id] ?? TIME_CONTROLS["blitz-5"];
}

function playerColor(game: any, userId: string): "white" | "black" | null {
  if (game.white_user_id === userId) return "white";
  if (game.black_user_id === userId) return "black";
  return null;
}

function opposite(side: "white" | "black") {
  return side === "white" ? "black" : "white";
}

function generateRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (value) => ROOM_CHARS[value % ROOM_CHARS.length]).join("");
}

async function uniqueRoomCode(admin: any) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateRoomCode();
    const { data } = await admin
      .from("online_games")
      .select("id")
      .eq("room_code", code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error("Could not allocate a room code. Try again.");
}

async function getProfile(admin: any, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error || !data) throw new Error("Profile not found.");
  if (data.is_banned) throw new Error("This account is suspended.");
  return data;
}

async function createGame(
  admin: any,
  mode: "friend" | "random",
  white: any | null,
  black: any | null,
  timeControl: any,
  roomCode: string | null,
  explicitId?: string
) {
  const active = Boolean(white && black);
  const initialMs = Number(timeControl.initialSec) * 1000;
  const now = new Date().toISOString();

  const row: Record<string, unknown> = {
    mode,
    status: active ? "active" : "waiting",
    room_code: roomCode,
    white_user_id: white?.id ?? null,
    black_user_id: black?.id ?? null,
    white_username: white?.username ?? "Waiting for player...",
    black_username: black?.username ?? "Waiting for player...",
    white_role: white?.role ?? null,
    black_role: black?.role ?? null,
    white_rating: white?.rating ?? null,
    black_rating: black?.rating ?? null,
    turn: "white",
    fen: START_FEN,
    moves: [],
    move_number: 0,
    result: null,
    reason: null,
    draw_offer_from: null,
    time_control: timeControl,
    initial_seconds: timeControl.initialSec,
    increment_seconds: timeControl.incSec,
    white_ms_remaining: initialMs,
    black_ms_remaining: initialMs,
    started_at: active ? now : null,
    turn_started_at: active ? now : null,
    updated_at: now,
    state_version: 0
  };
  if (explicitId) row.id = explicitId;

  const { data, error } = await admin
    .from("online_games")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

function clockState(game: any) {
  let whiteMs = Number(game.white_ms_remaining ?? 0);
  let blackMs = Number(game.black_ms_remaining ?? 0);
  const nowMs = Date.now();

  if (game.status === "active" && game.turn_started_at) {
    const startMs = Date.parse(game.turn_started_at);
    if (Number.isFinite(startMs)) {
      const elapsed = Math.max(0, nowMs - startMs);
      if (game.turn === "white") whiteMs = Math.max(0, whiteMs - elapsed);
      else blackMs = Math.max(0, blackMs - elapsed);
    }
  }

  return { whiteMs, blackMs, now: new Date(nowMs).toISOString() };
}

function nextRating(rating: number, opponentRating: number, score: number) {
  const expected = 1 / (1 + 10 ** ((opponentRating - rating) / 400));
  return Math.max(100, Math.min(4000, Math.round(rating + 28 * (score - expected))));
}

async function recordCompletedGame(admin: any, game: any) {
  const endedAt = game.ended_at ?? new Date().toISOString();
  const startedAt = game.started_at ?? game.created_at ?? endedAt;
  const durationMs = Math.max(0, Date.parse(endedAt) - Date.parse(startedAt));

  const { error: insertError } = await admin.from("games").insert({
    id: game.id,
    mode: game.mode,
    white_user_id: game.white_user_id,
    black_user_id: game.black_user_id,
    white_username: game.white_username,
    black_username: game.black_username,
    white_role: game.white_role,
    black_role: game.black_role,
    white_rating: game.white_rating,
    black_rating: game.black_rating,
    result: game.result,
    reason: game.reason ?? "manual",
    moves: game.moves ?? [],
    final_fen: game.fen,
    fen: game.fen,
    time_control: game.time_control,
    started_at: startedAt,
    ended_at: endedAt,
    duration_ms: durationMs
  });

  if (insertError) {
    if (insertError.code === "23505") return;
    throw new Error(insertError.message);
  }

  if (!game.white_user_id || !game.black_user_id || !["white", "black", "draw"].includes(game.result)) {
    return;
  }

  const [white, black] = await Promise.all([
    getProfile(admin, game.white_user_id),
    getProfile(admin, game.black_user_id)
  ]);

  const whiteScore = game.result === "draw" ? 0.5 : game.result === "white" ? 1 : 0;
  const blackScore = 1 - whiteScore;
  const whiteNew = nextRating(Number(white.rating), Number(black.rating), whiteScore);
  const blackNew = nextRating(Number(black.rating), Number(white.rating), blackScore);
  const category = ["bullet", "blitz", "rapid"].includes(game.time_control?.category)
    ? game.time_control.category
    : "rapid";
  const today = new Date().toISOString().slice(0, 10);

  async function patchProfile(profile: any, side: "white" | "black", newRating: number) {
    const won = game.result === side;
    const lost = game.result !== "draw" && !won;
    const xpGain = won ? 50 : 20;
    const currentXp = Number(profile.xp ?? 0);
    const formatRatings = {
      ...(profile.format_ratings ?? {
        bullet: profile.rating,
        blitz: profile.rating,
        rapid: profile.rating
      }),
      [category]: newRating
    };
    const daily = profile.daily_challenge ?? { target: 2, completed: 0, lastDate: today };
    const dailyCompleted =
      daily.lastDate === today ? Math.min(Number(daily.target ?? 2), Number(daily.completed ?? 0) + 1) : 1;

    const { error } = await admin
      .from("profiles")
      .update({
        rating: newRating,
        format_ratings: formatRatings,
        best_rating: Math.max(Number(profile.best_rating ?? profile.rating), newRating),
        wins: Number(profile.wins ?? 0) + (won ? 1 : 0),
        losses: Number(profile.losses ?? 0) + (lost ? 1 : 0),
        draws: Number(profile.draws ?? 0) + (game.result === "draw" ? 1 : 0),
        xp: currentXp + xpGain,
        level: Math.floor((currentXp + xpGain) / 100) + 1,
        daily_challenge: {
          target: Number(daily.target ?? 2),
          completed: dailyCompleted,
          lastDate: today
        },
        updated_at: new Date().toISOString()
      })
      .eq("id", profile.id);
    if (error) throw new Error(error.message);
  }

  await Promise.all([
    patchProfile(white, "white", whiteNew),
    patchProfile(black, "black", blackNew)
  ]);
}

async function finishGame(
  admin: any,
  game: any,
  result: "white" | "black" | "draw",
  reason: string,
  extra: Record<string, unknown> = {}
) {
  if (game.status === "complete") return game;

  const version = Number(game.state_version ?? 0);
  const { data, error } = await admin
    .from("online_games")
    .update({
      ...extra,
      status: "complete",
      result,
      reason,
      draw_offer_from: null,
      ended_at: new Date().toISOString(),
      turn_started_at: null,
      updated_at: new Date().toISOString(),
      state_version: version + 1
    })
    .eq("id", game.id)
    .eq("state_version", version)
    .neq("status", "complete")
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Game state changed. Refresh and try again.");
  await recordCompletedGame(admin, data);
  return data;
}

async function fetchGame(admin: any, gameId: string, userId: string) {
  const { data, error } = await admin
    .from("online_games")
    .select("*")
    .eq("id", gameId)
    .single();
  if (error || !data) throw new Error("Game not found.");
  const color = playerColor(data, userId);
  if (!color) throw new Error("You are not a player in this game.");
  return { game: data, color };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const publishableKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secretKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!url || !publishableKey || !secretKey || !authHeader.startsWith("Bearer ")) {
      return json({ error: "Authentication required." }, 401);
    }

    const token = authHeader.slice("Bearer ".length);
    const userClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    const user = userData.user;
    if (userError || !user) return json({ error: "Invalid or expired session." }, 401);

    const profile = await getProfile(admin, user.id);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "create_friend") {
      const tc = cleanTimeControl(body.timeControl);
      const preferred = body.preferredColor === "black" ? "black" : "white";
      const code = await uniqueRoomCode(admin);
      const game = await createGame(
        admin,
        "friend",
        preferred === "white" ? profile : null,
        preferred === "black" ? profile : null,
        tc,
        code
      );
      return json({ game, playerColor: preferred });
    }

    if (action === "join_friend") {
      const roomCode = String(body.roomCode ?? "").trim().toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(roomCode)) throw new Error("Enter a valid 6-character room code.");

      const { data: game, error } = await admin
        .from("online_games")
        .select("*")
        .eq("room_code", roomCode)
        .neq("status", "complete")
        .single();
      if (error || !game) throw new Error("Room code not found.");

      const existingColor = playerColor(game, user.id);
      if (existingColor) return json({ game, playerColor: existingColor });
      if (game.status !== "waiting") throw new Error("That room is already full.");

      const openColor = game.white_user_id ? "black" : "white";
      const version = Number(game.state_version ?? 0);
      const now = new Date().toISOString();
      const patch =
        openColor === "white"
          ? {
              white_user_id: profile.id,
              white_username: profile.username,
              white_role: profile.role,
              white_rating: profile.rating
            }
          : {
              black_user_id: profile.id,
              black_username: profile.username,
              black_role: profile.role,
              black_rating: profile.rating
            };

      const { data: updated, error: updateError } = await admin
        .from("online_games")
        .update({
          ...patch,
          status: "active",
          started_at: now,
          turn_started_at: now,
          updated_at: now,
          state_version: version + 1
        })
        .eq("id", game.id)
        .eq("status", "waiting")
        .eq("state_version", version)
        .select("*")
        .maybeSingle();

      if (updateError) throw new Error(updateError.message);
      if (!updated) throw new Error("Another player joined this room first.");
      return json({ game: updated, playerColor: openColor });
    }

    if (action === "random_join") {
      const tc = cleanTimeControl(body.timeControl);
      const preferred = body.preferredColor === "black" ? "black" : "white";

      const { data: ownQueue } = await admin
        .from("matchmaking_queue")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (ownQueue?.matched_game_id) {
        const { data: matchedGame } = await admin
          .from("online_games")
          .select("*")
          .eq("id", ownQueue.matched_game_id)
          .single();
        if (matchedGame) {
          await admin.from("matchmaking_queue").delete().eq("user_id", user.id);
          return json({
            queued: false,
            game: matchedGame,
            playerColor: playerColor(matchedGame, user.id)
          });
        }
      }

      await admin.from("matchmaking_queue").delete().eq("user_id", user.id);

      const minRating = Math.max(100, Number(profile.rating) - 250);
      const maxRating = Math.min(4000, Number(profile.rating) + 250);
      const { data: candidates, error: queueError } = await admin
        .from("matchmaking_queue")
        .select("*")
        .neq("user_id", user.id)
        .eq("time_control_id", tc.id)
        .is("matched_game_id", null)
        .gte("rating", minRating)
        .lte("rating", maxRating)
        .order("joined_at", { ascending: true })
        .limit(8);
      if (queueError) throw new Error(queueError.message);

      for (const candidate of candidates ?? []) {
        const opponent = await getProfile(admin, candidate.user_id);
        if ((profile.blocked_users ?? []).some((name: string) => name.toLowerCase() === String(opponent.username).toLowerCase())) {
          continue;
        }
        if ((opponent.blocked_users ?? []).some((name: string) => name.toLowerCase() === String(profile.username).toLowerCase())) {
          continue;
        }

        let callerIsWhite: boolean;
        if (preferred === "white" && candidate.preferred_color === "black") callerIsWhite = true;
        else if (preferred === "black" && candidate.preferred_color === "white") callerIsWhite = false;
        else callerIsWhite = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0;

        const gameId = crypto.randomUUID();
        const game = await createGame(
          admin,
          "random",
          callerIsWhite ? profile : opponent,
          callerIsWhite ? opponent : profile,
          tc,
          null,
          gameId
        );

        const { data: claimed, error: claimError } = await admin
          .from("matchmaking_queue")
          .update({ matched_game_id: gameId, updated_at: new Date().toISOString() })
          .eq("user_id", candidate.user_id)
          .is("matched_game_id", null)
          .select("user_id")
          .maybeSingle();

        if (!claimError && claimed) {
          return json({
            queued: false,
            game,
            playerColor: callerIsWhite ? "white" : "black"
          });
        }

        await admin.from("online_games").delete().eq("id", gameId);
      }

      const { error: insertQueueError } = await admin.from("matchmaking_queue").upsert(
        {
          user_id: user.id,
          username: profile.username,
          rating: profile.rating,
          preferred_color: preferred,
          time_control_id: tc.id,
          time_control: tc,
          matched_game_id: null,
          joined_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      );
      if (insertQueueError) throw new Error(insertQueueError.message);
      return json({ queued: true });
    }

    if (action === "random_sync") {
      const { data: queueRow, error } = await admin
        .from("matchmaking_queue")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!queueRow) return json({ queued: false });
      if (!queueRow.matched_game_id) return json({ queued: true });

      const { data: game, error: gameError } = await admin
        .from("online_games")
        .select("*")
        .eq("id", queueRow.matched_game_id)
        .single();
      if (gameError || !game) throw new Error("Matched game could not be loaded.");

      await admin.from("matchmaking_queue").delete().eq("user_id", user.id);
      return json({
        queued: false,
        game,
        playerColor: playerColor(game, user.id)
      });
    }

    if (action === "random_leave") {
      await admin.from("matchmaking_queue").delete().eq("user_id", user.id);
      return json({ ok: true });
    }

    if (action === "sync_game") {
      const { game, color } = await fetchGame(admin, String(body.gameId ?? ""), user.id);
      return json({ game, playerColor: color });
    }

    if (action === "move") {
      const { game, color } = await fetchGame(admin, String(body.gameId ?? ""), user.id);
      if (game.status !== "active") throw new Error("Game is not active.");
      if (game.turn !== color) throw new Error("It is not your turn.");

      const clocks = clockState(game);
      if ((color === "white" ? clocks.whiteMs : clocks.blackMs) <= 0) {
        const completed = await finishGame(
          admin,
          game,
          opposite(color),
          "timeout",
          {
            white_ms_remaining: Math.round(clocks.whiteMs),
            black_ms_remaining: Math.round(clocks.blackMs)
          }
        );
        return json({ game: completed });
      }

      const from = String(body.from ?? "");
      const to = String(body.to ?? "");
      const promotion = ["q", "r", "b", "n"].includes(String(body.promotion ?? "q"))
        ? String(body.promotion ?? "q")
        : "q";
      if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) {
        throw new Error("Move contains an invalid square.");
      }

      const chess = new Chess(game.fen);
      let made: any;
      try {
        made = chess.move({ from, to, promotion });
      } catch {
        made = null;
      }
      if (!made) throw new Error("That move is not legal.");

      const tc = cleanTimeControl(game.time_control);
      let whiteMs = clocks.whiteMs;
      let blackMs = clocks.blackMs;
      if (color === "white") whiteMs += Number(tc.incSec) * 1000;
      else blackMs += Number(tc.incSec) * 1000;

      const nextMoves = [...(game.moves ?? []), made.san];
      const nextTurn = chess.turn() === "w" ? "white" : "black";
      const commonPatch = {
        fen: chess.fen(),
        moves: nextMoves,
        move_number: Number(game.move_number ?? 0) + 1,
        last_move: { from: made.from, to: made.to, san: made.san },
        turn: nextTurn,
        draw_offer_from: null,
        white_ms_remaining: Math.round(whiteMs),
        black_ms_remaining: Math.round(blackMs)
      };

      if (chess.isGameOver()) {
        let result: "white" | "black" | "draw" = "draw";
        let reason = "draw";
        if (chess.isCheckmate()) {
          result = chess.turn() === "w" ? "black" : "white";
          reason = "checkmate";
        } else if (chess.isStalemate()) {
          reason = "stalemate";
        }

        const completed = await finishGame(admin, game, result, reason, commonPatch);
        return json({ game: completed });
      }

      const version = Number(game.state_version ?? 0);
      const { data: updated, error } = await admin
        .from("online_games")
        .update({
          ...commonPatch,
          turn_started_at: clocks.now,
          updated_at: clocks.now,
          state_version: version + 1
        })
        .eq("id", game.id)
        .eq("state_version", version)
        .eq("status", "active")
        .select("*")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!updated) throw new Error("Game changed before your move was saved. Try again.");
      return json({ game: updated });
    }

    if (["resign", "draw_offer", "draw_accept", "rematch", "flag_timeout"].includes(action)) {
      const { game, color } = await fetchGame(admin, String(body.gameId ?? ""), user.id);

      if (action === "resign") {
        if (game.status !== "active") throw new Error("Game is not active.");
        const clocks = clockState(game);
        const completed = await finishGame(admin, game, opposite(color), "resign", {
          white_ms_remaining: Math.round(clocks.whiteMs),
          black_ms_remaining: Math.round(clocks.blackMs)
        });
        return json({ game: completed });
      }

      if (action === "draw_offer") {
        if (game.status !== "active") throw new Error("Game is not active.");
        const version = Number(game.state_version ?? 0);
        const { data: updated, error } = await admin
          .from("online_games")
          .update({
            draw_offer_from: color,
            updated_at: new Date().toISOString(),
            state_version: version + 1
          })
          .eq("id", game.id)
          .eq("state_version", version)
          .select("*")
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!updated) throw new Error("Game state changed.");
        return json({ game: updated });
      }

      if (action === "draw_accept") {
        if (game.status !== "active" || !game.draw_offer_from || game.draw_offer_from === color) {
          throw new Error("No opponent draw offer is waiting.");
        }
        const clocks = clockState(game);
        const completed = await finishGame(admin, game, "draw", "agreement", {
          white_ms_remaining: Math.round(clocks.whiteMs),
          black_ms_remaining: Math.round(clocks.blackMs)
        });
        return json({ game: completed });
      }

      if (action === "flag_timeout") {
        if (game.status !== "active") return json({ game });
        const clocks = clockState(game);
        const flagged = game.turn as "white" | "black";
        const remaining = flagged === "white" ? clocks.whiteMs : clocks.blackMs;
        if (remaining > 0) throw new Error("The clock has not expired.");
        const completed = await finishGame(admin, game, opposite(flagged), "timeout", {
          white_ms_remaining: Math.round(clocks.whiteMs),
          black_ms_remaining: Math.round(clocks.blackMs)
        });
        return json({ game: completed });
      }

      if (action === "rematch") {
        if (game.status !== "complete" || !game.white_user_id || !game.black_user_id) {
          throw new Error("Rematch is available after a completed two-player game.");
        }
        const [oldWhite, oldBlack] = await Promise.all([
          getProfile(admin, game.white_user_id),
          getProfile(admin, game.black_user_id)
        ]);
        const tc = cleanTimeControl(game.time_control);
        const code = game.mode === "friend" ? await uniqueRoomCode(admin) : null;
        const rematch = await createGame(admin, game.mode, oldBlack, oldWhite, tc, code);
        return json({
          game: rematch,
          gameId: rematch.id,
          playerColor: playerColor(rematch, user.id)
        });
      }
    }

    return json({ error: "Unknown game action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Online game request failed." }, 400);
  }
});
