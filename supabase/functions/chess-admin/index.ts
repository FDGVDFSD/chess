import { createClient } from "npm:@supabase/supabase-js@2";
import { Chess } from "npm:chess.js@1.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
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
      // Fall through to the legacy key.
    }
  }
  return Deno.env.get(legacyName) ?? "";
}

function nextRating(rating: number, opponentRating: number, score: number) {
  const expected = 1 / (1 + 10 ** ((opponentRating - rating) / 400));
  return Math.max(100, Math.min(4000, Math.round(rating + 28 * (score - expected))));
}

function safeText(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function botRatingFromName(name: string) {
  if (/god mode/i.test(name)) return 700 + 10 * 140;
  const match = name.match(/bot\s*level\s*(\d+)/i);
  if (!match) return 1000;
  const level = Math.max(1, Math.min(10, Number(match[1])));
  return 700 + level * 140;
}

function sanitizeTimeControl(input: any) {
  if (!input || typeof input !== "object") return null;
  const category = ["bullet", "blitz", "rapid", "unlimited"].includes(input.category)
    ? input.category
    : "rapid";
  return {
    id: safeText(input.id, 32) || "rapid-10",
    name: safeText(input.name, 40) || "10+0 Rapid",
    category,
    initialSec: Math.max(0, Math.min(7200, Number(input.initialSec ?? 600))),
    incSec: Math.max(0, Math.min(60, Number(input.incSec ?? 0)))
  };
}

function replayAndValidate(game: any) {
  const chess = new Chess();
  const moves = Array.isArray(game.moves) ? game.moves.map((move: unknown) => String(move)) : [];
  for (const san of moves) {
    try {
      const made = chess.move(san);
      if (!made) throw new Error("Invalid move.");
    } catch {
      throw new Error("Game history contains an invalid move.");
    }
  }

  if (safeText(game.finalFen, 200) !== chess.fen()) {
    throw new Error("Final board state does not match the move history.");
  }

  if (game.reason === "checkmate" && !chess.isCheckmate()) {
    throw new Error("The saved game is not actually checkmate.");
  }
  if (game.reason === "stalemate" && !chess.isStalemate()) {
    throw new Error("The saved game is not actually stalemate.");
  }

  return { chess, moves };
}

async function getProfile(admin: any, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error || !data) throw new Error("Profile not found.");
  return data;
}

async function audit(admin: any, actorId: string, action: string, target?: string, reason?: string) {
  await admin.from("audit_logs").insert({
    admin_id: actorId,
    action: safeText(action, 120),
    target: target ? safeText(target, 180) : null,
    reason: reason ? safeText(reason, 500) : null
  });
}

async function applyBotResult(admin: any, profile: any, game: any, botRating: number, humanSide: "white" | "black") {
  if (!["white", "black", "draw"].includes(game.result)) return;

  const score = game.result === "draw" ? 0.5 : game.result === humanSide ? 1 : 0;
  const newRating = nextRating(Number(profile.rating ?? 1000), botRating, score);
  const category = ["bullet", "blitz", "rapid"].includes(game.timeControl?.category)
    ? game.timeControl.category
    : "rapid";
  const currentXp = Number(profile.xp ?? 0);
  const xpGain = score === 1 ? 50 : 20;
  const today = new Date().toISOString().slice(0, 10);
  const daily = profile.daily_challenge ?? { target: 2, completed: 0, lastDate: today };
  const formatRatings = {
    ...(profile.format_ratings ?? {
      bullet: profile.rating,
      blitz: profile.rating,
      rapid: profile.rating
    }),
    [category]: newRating
  };

  const { error } = await admin
    .from("profiles")
    .update({
      rating: newRating,
      format_ratings: formatRatings,
      best_rating: Math.max(Number(profile.best_rating ?? profile.rating ?? 1000), newRating),
      wins: Number(profile.wins ?? 0) + (game.result === humanSide ? 1 : 0),
      losses: Number(profile.losses ?? 0) + (game.result !== "draw" && game.result !== humanSide ? 1 : 0),
      draws: Number(profile.draws ?? 0) + (game.result === "draw" ? 1 : 0),
      xp: currentXp + xpGain,
      level: Math.floor((currentXp + xpGain) / 100) + 1,
      daily_challenge: {
        target: Number(daily.target ?? 2),
        completed:
          daily.lastDate === today
            ? Math.min(Number(daily.target ?? 2), Number(daily.completed ?? 0) + 1)
            : 1,
        lastDate: today
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", profile.id);

  if (error) throw new Error(error.message);
}

async function saveLocalGame(admin: any, userId: string, input: any) {
  if (!input || typeof input !== "object") throw new Error("Game record is missing.");
  if (!["bot", "pass-and-play"].includes(input.mode)) {
    throw new Error("Only local and bot games are saved through this endpoint.");
  }
  if (!["white", "black", "draw", "abandoned"].includes(input.result)) {
    throw new Error("Invalid game result.");
  }

  const white = input.players?.white ?? {};
  const black = input.players?.black ?? {};
  const userIsWhite = white.id === userId;
  const userIsBlack = black.id === userId;
  if (!userIsWhite && !userIsBlack) {
    throw new Error("You can only save games you played.");
  }

  const { moves } = replayAndValidate(input);
  const id = safeText(input.id, 64);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid game identifier.");

  const startedAt = new Date(input.startedAt).toISOString();
  const endedAt = new Date(input.endedAt).toISOString();
  const durationMs = Math.max(0, Date.parse(endedAt) - Date.parse(startedAt));
  const timeControl = sanitizeTimeControl(input.timeControl);
  const humanSide = userIsWhite ? "white" : "black";
  const botSide = humanSide === "white" ? black : white;
  const botRating = input.mode === "bot" ? botRatingFromName(safeText(botSide.username, 80)) : null;
  const profile = await getProfile(admin, userId);

  const record = {
    id,
    mode: input.mode,
    white_user_id: userIsWhite ? userId : (white.id || null),
    black_user_id: userIsBlack ? userId : (black.id || null),
    white_username: userIsWhite ? profile.username : safeText(white.username, 80) || "White",
    black_username: userIsBlack ? profile.username : safeText(black.username, 80) || "Black",
    white_role: userIsWhite ? profile.role : (white.role === "owner" ? "owner" : null),
    black_role: userIsBlack ? profile.role : (black.role === "owner" ? "owner" : null),
    white_rating: userIsWhite ? profile.rating : (input.mode === "bot" ? botRating : Number(white.rating ?? 1000)),
    black_rating: userIsBlack ? profile.rating : (input.mode === "bot" ? botRating : Number(black.rating ?? 1000)),
    result: input.result,
    reason: safeText(input.reason, 40) || "manual",
    moves,
    final_fen: safeText(input.finalFen, 200),
    fen: safeText(input.finalFen, 200),
    time_control: timeControl,
    started_at: startedAt,
    ended_at: endedAt,
    duration_ms: durationMs
  };

  const { data: existing } = await admin.from("games").select("id").eq("id", id).maybeSingle();
  if (!existing) {
    const { error } = await admin.from("games").insert(record);
    if (error) throw new Error(error.message);
    if (input.mode === "bot" && botRating !== null) {
      await applyBotResult(admin, profile, { ...input, timeControl }, botRating, humanSide);
    }
  }

  return {
    id,
    mode: input.mode,
    timeControl: timeControl ?? undefined,
    players: {
      white: {
        id: record.white_user_id ?? undefined,
        username: record.white_username,
        role: record.white_role ?? undefined,
        kind: userIsWhite ? "human" : input.mode === "bot" ? "bot" : "guest",
        rating: record.white_rating ?? undefined
      },
      black: {
        id: record.black_user_id ?? undefined,
        username: record.black_username,
        role: record.black_role ?? undefined,
        kind: userIsBlack ? "human" : input.mode === "bot" ? "bot" : "guest",
        rating: record.black_rating ?? undefined
      }
    },
    result: input.result,
    reason: record.reason,
    moves,
    finalFen: record.final_fen,
    startedAt,
    endedAt,
    durationMs
  };
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

    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) return json({ error: "Invalid or expired session." }, 401);

    const profile = await getProfile(admin, user.id);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "delete_self") {
      if (profile.role === "owner") throw new Error("The owner account cannot be deleted here.");
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (profile.is_banned) throw new Error("This account is suspended.");

    if (action === "save_game") {
      const game = await saveLocalGame(admin, user.id, body.game);
      return json({ game });
    }

    if (action === "leaderboard") {
      const { data, error } = await admin
        .from("profiles")
        .select("id,username,role,rating,format_ratings,puzzle_rating,wins,losses,draws")
        .eq("is_banned", false)
        .order("rating", { ascending: false })
        .order("wins", { ascending: false })
        .order("username", { ascending: true });
      if (error) throw new Error(error.message);
      return json({
        rows: (data ?? []).map((row: any) => ({
          userId: row.id,
          username: row.username,
          role: row.role === "owner" ? "owner" : "user",
          rating: Number(row.rating ?? 1000),
          formatRatings: row.format_ratings ?? { bullet: 1000, blitz: 1000, rapid: 1000 },
          puzzleRating: Number(row.puzzle_rating ?? 1200),
          wins: Number(row.wins ?? 0),
          losses: Number(row.losses ?? 0),
          draws: Number(row.draws ?? 0),
          gamesPlayed: Number(row.wins ?? 0) + Number(row.losses ?? 0) + Number(row.draws ?? 0)
        }))
      });
    }

    if (action === "puzzle_result") {
      const success = body.success === true;
      const delta = success ? 15 : -10;
      const xpGain = success ? 25 : 0;
      const currentXp = Number(profile.xp ?? 0);
      const { data, error } = await admin
        .from("profiles")
        .update({
          puzzle_rating: Math.max(100, Number(profile.puzzle_rating ?? 1200) + delta),
          xp: currentXp + xpGain,
          level: Math.floor((currentXp + xpGain) / 100) + 1,
          updated_at: new Date().toISOString()
        })
        .eq("id", user.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      const { error: solveError } = await admin.from("puzzle_solves").insert({
        user_id: user.id,
        puzzle_id: null,
        success,
        rating_delta: delta,
        xp_delta: xpGain
      });
      if (solveError) throw new Error(solveError.message);
      return json({ user: data });
    }

    if (profile.role !== "owner") {
      return json({ error: "Owner privileges are required." }, 403);
    }

    if (action === "list_users") {
      const { data, error } = await admin.from("profiles").select("*").order("created_at");
      if (error) throw new Error(error.message);
      return json({ users: data ?? [] });
    }

    if (action === "ban_user") {
      const targetId = safeText(body.userId, 64);
      const target = await getProfile(admin, targetId);
      if (target.role === "owner") throw new Error("The owner account cannot be suspended.");

      const isBanned = body.isBanned === true;
      const reason = isBanned ? safeText(body.banReason, 300) || "Suspended by owner" : null;
      const { data, error } = await admin
        .from("profiles")
        .update({
          is_banned: isBanned,
          ban_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq("id", targetId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await audit(admin, user.id, isBanned ? "Ban user" : "Unban user", target.username, reason ?? undefined);
      return json({ user: data });
    }

    if (action === "set_rating") {
      const targetId = safeText(body.userId, 64);
      const target = await getProfile(admin, targetId);
      const rating = Math.max(100, Math.min(4000, Math.round(Number(body.rating ?? 1000))));
      const { data, error } = await admin
        .from("profiles")
        .update({
          rating,
          best_rating: Math.max(Number(target.best_rating ?? target.rating), rating),
          format_ratings: { bullet: rating, blitz: rating, rapid: rating },
          updated_at: new Date().toISOString()
        })
        .eq("id", targetId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await audit(admin, user.id, "Set rating", target.username, `${target.rating} → ${rating}`);
      return json({ user: data });
    }

    if (action === "delete_user") {
      const targetId = safeText(body.userId, 64);
      const target = await getProfile(admin, targetId);
      if (target.role === "owner") throw new Error("The owner account cannot be deleted.");
      await audit(admin, user.id, "Delete user", target.username);
      const { error } = await admin.auth.admin.deleteUser(targetId);
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (action === "list_reports") {
      const { data, error } = await admin
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return json({ reports: data ?? [] });
    }

    if (action === "update_report") {
      const reportId = safeText(body.reportId, 64);
      const status = body.status === "resolved" ? "resolved" : body.status === "dismissed" ? "dismissed" : null;
      if (!status) throw new Error("Invalid report status.");
      const { data: report, error } = await admin
        .from("reports")
        .update({ status })
        .eq("id", reportId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await audit(admin, user.id, "Update report", report.target, status);
      return json({ ok: true });
    }

    if (action === "analytics") {
      const today = new Date().toISOString().slice(0, 10);
      const [
        usersCount,
        activeCount,
        gamesCount,
        gamesTodayCount,
        botCount,
        onlineCount,
        reportsCount,
        bannedCount,
        activeGames
      ] = await Promise.all([
        admin.from("profiles").select("id", { count: "exact", head: true }),
        admin.from("profiles").select("id", { count: "exact", head: true }).gte("last_seen_at", `${today}T00:00:00.000Z`),
        admin.from("games").select("id", { count: "exact", head: true }),
        admin.from("games").select("id", { count: "exact", head: true }).gte("ended_at", `${today}T00:00:00.000Z`),
        admin.from("games").select("id", { count: "exact", head: true }).eq("mode", "bot"),
        admin.from("games").select("id", { count: "exact", head: true }).in("mode", ["friend", "random"]),
        admin.from("reports").select("id", { count: "exact", head: true }),
        admin.from("profiles").select("id", { count: "exact", head: true }).eq("is_banned", true),
        admin.from("online_games").select("white_user_id,black_user_id").in("status", ["waiting", "active"])
      ]);

      const onlineIds = new Set<string>();
      for (const game of activeGames.data ?? []) {
        if (game.white_user_id) onlineIds.add(game.white_user_id);
        if (game.black_user_id) onlineIds.add(game.black_user_id);
      }

      return json({
        analytics: {
          totalUsers: usersCount.count ?? 0,
          activeToday: activeCount.count ?? 0,
          gamesPlayedToday: gamesTodayCount.count ?? 0,
          totalGamesPlayed: gamesCount.count ?? 0,
          onlinePlayersCount: onlineIds.size,
          botGamesCount: botCount.count ?? 0,
          onlineGamesCount: onlineCount.count ?? 0,
          reportsCount: reportsCount.count ?? 0,
          bannedUsersCount: bannedCount.count ?? 0,
          maintenanceMode: false
        }
      });
    }

    if (action === "audit_logs") {
      const { data: logs, error } = await admin
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);

      const adminIds = [...new Set((logs ?? []).map((item: any) => item.admin_id).filter(Boolean))];
      const nameById = new Map<string, string>();
      if (adminIds.length) {
        const { data: profiles } = await admin.from("profiles").select("id,username").in("id", adminIds);
        for (const item of profiles ?? []) nameById.set(item.id, item.username);
      }

      return json({
        auditLogs: (logs ?? []).map((item: any) => ({
          ...item,
          admin_username: nameById.get(item.admin_id) ?? "Owner"
        }))
      });
    }

    if (action === "create_announcement") {
      const title = safeText(body.title, 100);
      const content = safeText(body.content, 1200);
      if (!title || !content) throw new Error("Announcement title and content are required.");

      const { data, error } = await admin
        .from("announcements")
        .insert({ title, content, active: true })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await audit(admin, user.id, "Create announcement", title);
      return json({ announcement: data });
    }

    return json({ error: "Unknown admin action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Admin request failed." }, 400);
  }
});
